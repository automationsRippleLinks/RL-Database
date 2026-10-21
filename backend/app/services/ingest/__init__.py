"""Ingest jobs: turn an uploaded sheet export into rows in the database.

Every source in `SOURCES` goes through the same stages, and the first stage that
reports errors fails the job before anything is written:

    parse       cells -> typed values, row by row
    validate    duplicates in the file, rows pointing at missing pitches/campaigns
    ai          judgement cells (city, category, status ...) via `ai.judge`, or, when
                the upload turned the AI off, `ai.match_exactly` (cells as typed)
    write       one transaction; rolled back on a dry run, so its counts are real

Committing a dry run starts a child job that re-reads the parent's rows and reuses
its AI answers, so the commit writes exactly what the preview showed.
"""

from typing import Optional, Any
from uuid import UUID
import logging

from sqlmodel import select
from redis.asyncio import Redis
from opentelemetry import trace

from app.observability import tracer
from app.core.config import settings
from app.core.db import SessionFactory
from app.core.cache import invalidate
from app.models import IngestSource, IngestJob
from app.schemas.ingest import RowError
from app.services import ai, jobs
from .masters import PitchMaster, CampaignMaster
from .creators import PitchCreator, CampaignCreator
from .direct import DirectCreator
from .common import load_taxonomy

logger = logging.getLogger(__name__)

SOURCES = {
    IngestSource.pitch_master: PitchMaster(),
    IngestSource.campaign_master: CampaignMaster(),
    IngestSource.pitch_creator: PitchCreator(),
    IngestSource.campaign_creator: CampaignCreator(),
    IngestSource.creator: DirectCreator(),
}


def _unmatched(row: int, out: dict) -> list[RowError]:
    """One error per cell the AI reported as matching nothing allowed."""

    taxonomy_hint = {"category", "language"}
    return [
        RowError(
            row=row,
            field=u["field"],
            message=(
                f"{u['value']!r} doesn't match anything allowed. "
                + (
                    ("Add it under Taxonomy or fix the cell.")
                    if u["field"] in taxonomy_hint
                    else "Fix the cell."
                )
            ),
        )
        for u in out.get("unmatched", [])
    ]


async def _inputs(
    sf: SessionFactory, job: IngestJob
) -> tuple[list[dict], Optional[dict]]:
    """(rows, saved AI answers) for a job.

    A fresh upload has its own rows and no AI answers yet. A commit job has neither;
    it takes both from the dry run it commits.
    """

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
    """Worker entry point: run one queued ingest job and record how it ended.

    Does nothing if the job is no longer queued or another worker holds it. A crash
    marks the job failed as a system error; the write stage is one transaction, so
    nothing is left half-written.
    """

    job = await jobs.claim(sf, job_id)
    if job is None:
        return
    rows: list[dict] = []
    trace.get_current_span().set_attributes(
        {
            "ingest.job_id": str(job_id),
            "ingest.source": IngestSource(job.source).value,
            "ingest.dry_run": job.dry_run,
            "ingest.use_ai": job.use_ai
        }
    )
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
            system=True,
        )


async def _run(
    sf: SessionFactory,
    redis: Redis,
    job: IngestJob,
    rows: list[dict],
    saved_ai: Optional[dict],
) -> None:
    """Run the stages in order, finishing the job at the first one with errors.

    After a real (not dry) run the search, facet and suggestion caches are cleared.
    A dry run stores its AI answers on the job for the commit to reuse.
    """
    source = SOURCES[IngestSource(job.source)]

    async def fail(errors: list[RowError], stage: str, **extra: Any) -> None:
        """Finish the job as failed; no stage before `write` has written anything."""

        await jobs.finish(
            sf,
            job.job_id,
            received=len(rows),
            errors=errors,
            message=f"{len(errors)} errors found while {stage}; nothing was written.",
            **extra,
        )

    def stage(name: str):
        """Tracing span for one stage, named `ingest.<name>`."""

        return tracer.start_as_current_span(
            f"ingest.{name}",
            attributes={"ingest.source": IngestSource(job.source).value},
        )

    with stage("parse") as span:
        records, errors = source.parse(rows)
        span.set_attribute("ingest.errors", len(errors))

    if errors:
        return await fail(errors, "reading the file")

    with stage("validate") as span:
        async with sf() as session:
            errors = await source.validate(session, records)
            taxonomy = await load_taxonomy(session)
        span.set_attribute("ingest.errors", len(errors))
    if errors:
        return await fail(errors, "checking against the database")

    usage = None
    ai_stage = "running the AI step" if job.use_ai else "matching cells as typed"
    with stage("ai") as span:
        if saved_ai is None and not job.use_ai:
            result = ai.match_exactly(
                source.ai, {r.row: r.ai_input for r in records}, taxonomy
            )
            outputs, errors = result.outputs, result.errors
        elif saved_ai is None:
            try:
                result = await ai.judge(
                    source.ai, {r.row: r.ai_input for r in records}, taxonomy, redis
                )
            except Exception as e:
                logger.exception("AI step failed for job %s", job.job_id)
                return await fail(
                    [RowError(field="ai", message=f"The AI step failed: {e}")],
                    "running the AI step",
                    system=True,
                )
            outputs, errors, usage = result.outputs, result.errors, result.usage
        else:
            # stored as JSON, so the row numbers come back as strings
            outputs, errors = {int(k): v for k, v in saved_ai.items()}, []
            span.set_attribute("ingest.ai_reused", True)
        for r in records:
            if r.row in outputs:
                r.ai = outputs[r.row]
                errors += _unmatched(r.row, r.ai)
        span.set_attribute("ingest.errors", len(errors))
    if errors:
        return await fail(errors, ai_stage, ai_usage=usage)
    for r in records:
        source.apply_ai(r)

    with stage("write") as span:
        async with sf() as session:
            counts, message = await source.write(session, records, taxonomy)
            if job.dry_run:
                # the write really ran, so the counts are exact; now undo it
                await session.rollback()
                message = f"Dry run, nothing written. Would have: {message}"
            else:
                await session.commit()
        span.set_attributes({f"ingest.{k}": v for k, v in counts.items()})

    if not job.dry_run:
        try:
            await invalidate(
                redis,
                settings.FACETS_CACHE_PREFIX,
                settings.SEARCH_CACHE_PREFIX,
                settings.SUGGEST_CACHE_PREFIX,
            )
        except Exception:
            # the data is already committed; stale caches expire on their own
            logger.warning("cache invalidation failed after job %s", job.job_id)
    await jobs.finish(
        sf,
        job.job_id,
        received=len(rows),
        errors=[],
        counts=counts,
        message=message,
        ai_output={str(k): v for k, v in outputs.items()} if job.dry_run else None,
        ai_usage=usage,
    )
