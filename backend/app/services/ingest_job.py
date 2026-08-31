from typing import Optional
from datetime import datetime, timezone

from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import IngestJob as IngestJobRow
from app.schemas.ingest import (
    IngestCounts,
    IngestRowError,
    IngestJobStatus,
    IngestJob as IngestJobSchema,
)


class IngestResult(BaseModel):
    counts: IngestCounts
    errors: list[IngestRowError] = []
    message: Optional[str] = None

    @property
    def status(self) -> IngestJobStatus:
        c = self.counts
        if c.failed and not (c.inserted or c.updated):
            return IngestJobStatus.FAILED
        if c.failed or c.skipped:
            return IngestJobStatus.PARTIAL_SUCCESS
        return IngestJobStatus.SUCCESS


async def record_job(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    source,
    origin: str,
    dry_run: bool,
    started_by: Optional[str],
    started_at: datetime,
    result: IngestResult,
    file_name: Optional[str] = None
) -> IngestJobRow:
    """Persist the job row in its own session.

    The ingest work runs in the request session, which a dry run rolls back.
    A job row written there would roll back with it, leaving the frontend
    nothing to poll -- so this commits independently of that transaction
    """

    async with session_factory() as session:
        row = IngestJobRow(
            source=getattr(source, "value", str(source)),
            origin=origin,
            status=result.status.value,
            dry_run=dry_run,
            file_name=file_name,
            started_at=started_at,
            finished_at=datetime.now(timezone.utc),
            started_by=started_by,
            received=result.counts.received,
            inserted=result.counts.inserted,
            updated=result.counts.updated,
            skipped=result.counts.skipped,
            failed=result.counts.failed,
            errors_truncated=result.counts.errors_truncated,
            errors=[e.model_dump() for e in result.errors],
            message=result.message,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row


def job_to_schema(row: IngestJobRow) -> IngestJobSchema:
    return IngestJobSchema(
        job_id=row.job_id,
        source=row.source,
        origin=row.origin,
        status=row.status,
        dry_run=row.dry_run,
        started_at=row.started_at,
        finished_at=row.finished_at,
        started_by=row.started_by,
        message=row.message,
        counts=IngestCounts(
            received=row.received,
            inserted=row.inserted,
            updated=row.updated,
            skipped=row.skipped,
            failed=row.failed,
            errors_truncated=row.errors_truncated
        ),
        errors=[IngestRowError(**e) for e in (row.errors or [])]
    )