from typing import Any, Optional, Callable, Awaitable
import json
from datetime import datetime, UTC, timedelta
import logging

from redis.asyncio import Redis
from sqlmodel import select, or_, col
from sqlmodel.ext.asyncio.session import AsyncSession
from apify_client import ApifyClientAsync

from app.core.config import settings
from app.core.db import SessionFactory
from app.models.creator import Creator
from app.models.ingest_job import JobStatus
from app.models.apify_run import RunTrigger, ApifyRun
from app.models.enums import PlatformChoices
from app.schemas.ingest import RowError
from app.observability import tracer
from app.observability.metrics import APIFY_RUNS, APIFY_OVERDUE
from . import instagram

log = logging.getLogger(__name__)

Handler = Callable[
    [SessionFactory, Redis, list[dict]], Awaitable[tuple[int, list[RowError], str]]
]

HANDLERS: dict[str, Handler] = {
    settings.APIFY_IG_PROFILE_ACTOR: instagram.handle,
}

_EVENTS = [
    "ACTOR.RUN.SUCCEEDED",
    "ACTOR.RUN.FAILED",
    "ACTOR.RUN.TIMED_OUT",
    "ACTOR.RUN.ABORTED",
]

_UNFINISHED = {"READY", "RUNNING", "TIMING-OUT", "ABORTING"}


class UnknownActor(Exception):
    pass


def _client() -> ApifyClientAsync:
    return ApifyClientAsync(token=settings.APIFY_API_TOKEN)


def _webhook_url() -> str:
    return f"{str(settings.PUBLIC_API_URL).rstrip('/')}{settings.API_ROOT_PATH}/apify/webhook"


async def _start(actor: str, run_input: dict[str, Any]):
    return (
        await _client()
        .actor(actor)
        .start(
            run_input=run_input,
            webhooks=[
                {
                    "event_types": _EVENTS,
                    "request_url": _webhook_url(),
                    "headers_template": json.dumps(
                        {"X-Apify-Webhook-Secret": settings.APIFY_WEBHOOK_SECRET}
                    ),
                }
            ],
        )
    )


async def start_run(
    session: AsyncSession,
    actor: str,
    run_input: dict[str, Any],
    trigger: RunTrigger,
    started_by: Optional[str],
) -> ApifyRun:
    if actor not in HANDLERS:
        raise UnknownActor(actor)
    with tracer.start_as_current_span(
        "apify.start", attributes={"apify.actor": actor, "apify.trigger": trigger.value}
    ):
        run = await _start(actor, run_input)
    row = ApifyRun(
        run_id=run.id,
        actor=actor,
        trigger=trigger,
        apify_status=run.status,
        started_by=started_by,
        run_input=run_input,
    )
    session.add(row)
    await session.commit()
    log.info("apify run %s started: %s (%s)", run.id, actor, trigger.value)
    return row


async def _claim(sf: SessionFactory, run_id: str) -> Optional[ApifyRun]:
    stale = datetime.now(UTC) - timedelta(minutes=settings.STALE_RUNNING_MINUTES)
    async with sf() as session:
        row = (
            await session.exec(
                select(ApifyRun)
                .where(
                    ApifyRun.run_id == run_id,
                    ApifyRun.status == JobStatus.RUNNING,
                    or_(
                        col(ApifyRun.claimed_at).is_(None),
                        col(ApifyRun.claimed_at) < stale,
                    ),
                )
                .with_for_update(skip_locked=True)
            )
        ).first()

        if row is None:
            return None

        row.claimed_at = datetime.now(UTC)
        session.add(row)
        await session.commit()
        return row


async def _save(sf: SessionFactory, run_id: str, **values: Any) -> None:
    async with sf() as session:
        run = (
            await session.exec(select(ApifyRun).where(ApifyRun.run_id == run_id))
        ).first()
        if run is None:
            return

        run.sqlmodel_update(values)
        session.add(run)
        await session.commit()
        if values.get("status") in (JobStatus.SUCCESS, JobStatus.FAILED):
            APIFY_RUNS.add(
                amount=1,
                attributes={"actor": run.actor, "status": values.get("status").value},
            )
            log.info(
                "apify run %s %s: %s",
                run_id,
                values["status"].value,
                values.get("message"),
            )


async def process_run(sf: SessionFactory, redis: Redis, run_id: str) -> None:
    with tracer.start_as_current_span(
        "apify.process", attributes={"apify.run_id": run_id}
    ):
        await _process(sf, redis, run_id)


async def _process(sf: SessionFactory, redis: Redis, run_id: str) -> None:
    row = await _claim(sf, run_id)
    if row is None:
        return
    try:
        client = _client()
        run = await client.run(run_id).get()
        if run is None:
            return await _save(
                sf,
                run_id,
                status=JobStatus.FAILED,
                finished_at=datetime.now(UTC),
                message="Run not found on Apify",
            )
        if run.status in _UNFINISHED:
            return await _save(sf, run_id, apify_status=run.status, claimed_at=None)
        if run.status != "SUCCEEDED":
            return await _save(
                sf,
                run_id,
                status=JobStatus.FAILED,
                apify_status=run.status,
                finished_at=datetime.now(UTC),
                message=run.status_message or f"Apify run ended {run.status}",
            )

        items = [
            item
            async for item in client.dataset(run.default_dataset_id).iterate_items(
                clean=True
            )
        ]
        updated, errors, message = await HANDLERS[row.actor](sf, redis, items)
        await _save(
            sf,
            run_id,
            status=JobStatus.SUCCESS,
            apify_status=run.status,
            finished_at=datetime.now(UTC),
            items=len(items),
            updated=updated,
            errors=[e.model_dump() for e in errors[: settings.MAX_STORED_ERRORS]],
            message=message,
        )
    except Exception as e:
        log.exception("apify run %s failed while processing", run_id)
        await _save(
            sf,
            run_id,
            status=JobStatus.FAILED,
            finished_at=datetime.now(UTC),
            message=f"{type(e).__name__}: {e}",
        )


async def unfinished_runs(sf: SessionFactory) -> list[str]:
    overdue = datetime.now(UTC) - timedelta(
        minutes=settings.APIFY_RECONCILE_AFTER_MINUTES
    )
    async with sf() as session:
        stmnt = select(ApifyRun.run_id, ApifyRun.actor, ApifyRun.started_at).where(
            ApifyRun.status == JobStatus.RUNNING, ApifyRun.started_at < overdue
        )
        rows = (await session.exec(stmnt)).all()
    late = datetime.now(UTC) - timedelta(minutes=settings.ALERT_APIFY_OVERDUE_MINUTES)
    for run_id, actor, started_at in rows:
        if started_at < late:
            APIFY_OVERDUE.add(amount=1, attributes={"actor": actor})
            log.warning("apify run %s has had no webhook for %s minutes", run_id, settings.ALERT_APIFY_OVERDUE_MINUTES)
    return [run_id for run_id, _, _ in rows]


async def start_scheduled_refresh(sf: SessionFactory) -> Optional[ApifyRun]:
    actor = settings.APIFY_IG_PROFILE_ACTOR
    async with sf() as session:
        busy = await session.exec(
            select(ApifyRun.id).where(
                ApifyRun.actor == actor,
                ApifyRun.trigger == RunTrigger.SCHEDULE,
                ApifyRun.status == JobStatus.RUNNING,
            )
        )
        if busy.first():
            return None
        cutoff = datetime.now(UTC) - timedelta(days=settings.APIFY_REFRESH_AFTER_DAYS)
        usernames = (
            await session.exec(
                select(Creator.username)
                .where(
                    Creator.platform == PlatformChoices.INSTAGRAM,
                    col(Creator.is_active),
                    or_(
                        col(Creator.stats_refreshed_at).is_(None),
                        col(Creator.stats_refreshed_at) < cutoff,
                    ),
                )
                .order_by(
                    col(Creator.stats_refreshed_at).asc().nulls_first(),
                    col(Creator.username),
                )
                .limit(settings.APIFY_REFRESH_BATCH)
            )
        ).all()
        if not usernames:
            return None
        return await start_run(
            session, actor, {"usernames": list(usernames)}, RunTrigger.SCHEDULE, None
        )
