from typing import Optional, Any
from uuid import UUID
import logging

from sqlmodel import select
from redis.asyncio import Redis

from app.core.config import settings
from app.core.db import SessionFactory
from app.core.cache import invalidate
from app.models import IngestSource, IngestJob
from app.schemas.ingest import RowError
from app.services import ai, jobs
from .masters import PitchMaster, CampaignMaster
from .creators import PitchCreator, CampaignCreator
from .common import load_taxonomy

logger = logging.getLogger(__name__)

SOURCES = {
    IngestSource.pitch_master: PitchMaster(),
    IngestSource.campaign_master: CampaignMaster(),
    IngestSource.pitch_creator: PitchCreator(),
    IngestSource.campaign_creator: CampaignCreator(),
    # IngestSource.creator: "" # TODO: add direct creator ingestion
}


def _unmatched(row: int, out: dict) -> list[RowError]:
    taxonomy_hint = {"category", "language"}
    return [
        RowError(
            row=row,
            field=u["field"],
            message=(
                f"{u['value']!r} doesn't match anythin allowed. "
                + ("Add it under Taxonomy or fix the cell.")
                if u["field"] in taxonomy_hint
                else "Fix the cell."
            ),
        )
        for u in out.get("unmatched", [])
    ]


async def _inputs(
    sf: SessionFactory, job: IngestJob
) -> tuple[list[dict], Optional[dict]]:
    if job.parent_job_id is None:
        return job.rows or [], None
    async with sf() as session:
        parent = (
            await session.exec(
                select(IngestJob).where(IngestJob.job_id == job.parent_job_id)
            )
        ).one()
        return parent.rows or [], parent.ai_output


async def run_job(sf: SessionFactory, redis: Redis, job_id: UUID) -> None:
    job = await jobs.claim(sf, job_id)
    if job is None:
        return
    rows: list[dict] = []
    try:
        rows, saved_ai = await _inputs(sf, job)
        await _run(sf, redis, job, rows, saved_ai)
    except Exception as e:
        logger.exception("ingest job %s crashed", job_id)
        await jobs.finish(
            sf,
            job_id,
            received=len(rows),
            errors=[RowError(message=f"Unexpected error: {type(e).__name__}: {e}")],
            message="Ingest failed; nothing was written.",
        )


async def _run(
    sf: SessionFactory,
    redis: Redis,
    job: IngestJob,
    rows: list[dict],
    saved_ai: Optional[dict],
) -> None:
    source = SOURCES[IngestSource(job.source)]

    async def fail(errors: list[RowError], stage: str, **extra: Any) -> None:
        await jobs.finish(
            sf,
            job.job_id,
            received=len(rows),
            errors=errors,
            message=f"{len(errors)} errors found while {stage}; nothing was written.",
            **extra,
        )

    records, errors = source.parse(rows)
    if errors:
        return await fail(errors, "reading the file")

    async with sf() as session:
        errors = await source.validate(session, records)
        if errors:
            return await fail(errors, "checking against the database")
        taxonomy = await load_taxonomy(session)

    usage = None
    if saved_ai is None:
        try:
            result = await ai.judge(
                source.ai, {r.row: r.ai_input for r in records}, taxonomy, redis
            )
        except Exception as e:
            return await fail(
                [RowError(field="ai", message=f"The AI step failed: {e}")],
                "running the AI step",
            )
        outputs, errors, usage = result.outputs, result.errors, result.usage
    else:
        outputs, errors = {int(k): v for k, v in saved_ai.items()}, []
    for r in records:
        if r.row in outputs:
            r.ai = outputs[r.row]
            errors += _unmatched(r.row, r.ai)
    if errors:
        return await fail(errors, "running the AI step", ai_usage=usage)
    for r in records:
        source.apply_ai(r)

    async with sf() as session:
        counts, message = await source.write(session, records, taxonomy)
        if job.dry_run:
            await session.rollback()
            message = f"Dry run, nothing written. Would have: {message}"
        else:
            await session.commit()

    if not job.dry_run:
        try:
            await invalidate(redis, settings.FACETS_CACHE_PREFIX, settings.SEARCH_CACHE_PREFIX, settings.SUGGEST_CACHE_PREFIX)
        except Exception:
            logger.warning("cache invalidation failed after job %s", job.job_id)
    await jobs.finish(
        sf, job.job_id, received=len(rows), errors=[], counts=counts, message=message,
        ai_output={str(k): v for k, v in outputs.items()} if job.dry_run else None,
        ai_usage=usage
    )
