from typing import Optional, Any
from uuid import UUID
from datetime import datetime, UTC, timedelta

from sqlmodel import select

from app.core.config import settings
from app.core.db import SessionFactory
from app.models.ingest_job import IngestJob, JobStatus
from app.schemas.ingest import RowError


async def claim(sf: SessionFactory, job_id: UUID) -> Optional[IngestJob]:
    async with sf() as session:
        job = (
            await session.exec(
                select(IngestJob)
                .where(IngestJob.job_id == job_id, IngestJob.status == JobStatus.QUEUED)
                .with_for_update(skip_locked=True)
            )
        ).first()

        if job is None:
            return None

        job.status = JobStatus.RUNNING
        job.started_at = datetime.now(UTC)
        session.add(job)
        await session.commit()
        return job


async def finish(
    sf: SessionFactory,
    job_id: UUID,
    *,
    errors: list[RowError],
    received: int,
    counts: Optional[dict[str, int]] = None,
    message: Optional[str] = None,
    ai_output: Optional[dict[str, Any]] = None,
    ai_usage: Optional[dict[str, Any]] = None,
) -> None:
    errors = sorted(errors, key=lambda e: (e.row, e.field or ""))
    kept = errors[: settings.MAX_STORED_ERRORS]

    if errors:
        whole_file = any(e.row == 0 for e in errors)
        values: dict[str, Any] = {
            "status": JobStatus.FAILED,
            "failed": received if whole_file else len({e.row for e in errors}),
            "inserted": 0,
            "updated": 0,
            "skipped": 0,
        }
    else:
        values = {"status": JobStatus.SUCCESS, "failed": 0, **(counts or {})}

    values |= {
        "finished_at": datetime.now(UTC),
        "received": received,
        "errors": [e.model_dump() for e in kept],
        "errors_truncated": len(errors) - len(kept),
        "message": message,
    }
    if ai_output is not None:
        values["ai_output"] = ai_output
    if ai_usage is not None:
        values["ai_usage"] = ai_usage

    async with sf() as session:
        job = (
            await session.exec(
                select(IngestJob)
                .where(
                    IngestJob.job_id == job_id, IngestJob.status == JobStatus.RUNNING
                )
                .with_for_update()
            )
        ).first()
        if job is None:
            return
        job.sqlmodel_update(values)
        session.add(job)
        await session.commit()


async def sweep(sf: SessionFactory) -> list[UUID]:
    now = datetime.now(UTC)
    async with sf() as session:
        stale_jobs = (
            await session.exec(
                select(IngestJob).where(
                    IngestJob.status == JobStatus.RUNNING,
                    IngestJob.started_at
                    < now - timedelta(minutes=settings.STALE_RUNNING_MINUTES),
                )
            )
        ).all()

        for j in stale_jobs:
            j.status = JobStatus.FAILED
            j.finished_at = now
            j.message = "The worker stopped while this job was running. Upload again."

            session.add(j)

        stuck = (
            await session.exec(
                select(IngestJob.job_id).where(
                    IngestJob.status == JobStatus.QUEUED,
                    IngestJob.started_at
                    < now - timedelta(minutes=settings.STALE_QUEUE_MINUTES),
                )
            )
        ).all()
        await session.commit()
        return list(stuck)
