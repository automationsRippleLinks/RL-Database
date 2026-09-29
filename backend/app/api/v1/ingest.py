import json
from uuid import UUID

from fastapi import APIRouter, HTTPException, status, Query, UploadFile, File, Form
from sqlmodel import select, col, func
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.orm import defer

from app.worker import run_ingest_job
from app.core.config import settings
from app.api.deps import (
    SessionDep,
    IngestUser,
    CSRFProtected,
)
from app.models import IngestJob, JobStatus
from app.services.ingest import SOURCES
from app.schemas.ingest import (
    IngestSourceInfo,
    IngestSource,
    IngestJobList,
    IngestJobOut,
)

router = APIRouter()

_LIGHT = (defer(IngestJob.rows), defer(IngestJob.ai_output))


async def _job_or_404(session: AsyncSession, job_id: UUID) -> IngestJob:
    job = (
        await session.exec(
            select(IngestJob).options(*_LIGHT).where(IngestJob.job_id == job_id)
        )
    ).first()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found"
        )
    return job


@router.get("/sources", response_model=list[IngestSourceInfo])
async def ingest_sources(session: SessionDep, user: IngestUser):
    out = []
    for source, handler in SOURCES.items():
        count = (
            await session.exec(select(func.count()).select_from(handler.table))
        ).one()
        last = (
            await session.exec(
                select(IngestJob)
                .options(*_LIGHT)
                .where(IngestJob.source == source)
                .order_by(col(IngestJob.started_at).desc())
                .limit(1)
            )
        ).first()
        out.append(
            IngestSourceInfo(
                source=source, label=handler.label, row_count=count, last_job=last
            )
        )
    return out


@router.get("/jobs", response_model=IngestJobList)
async def list_jobs(
    session: SessionDep, user: IngestUser, limit: int = Query(20, ge=1, le=100)
):
    stmnt = (
        select(IngestJob)
        .options(*_LIGHT)
        .order_by(col(IngestJob.started_at).desc())
        .limit(limit)
    )
    return IngestJobList(jobs=(await session.exec(stmnt)).all())


@router.get("/jobs/{job_id}", response_model=IngestJobOut)
async def get_job(job_id: UUID, session: SessionDep, user: IngestUser):
    return await _job_or_404(session, job_id)


@router.post(
    "/upload",
    response_model=IngestJobOut,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[CSRFProtected],
)
async def upload(
    session: SessionDep,
    user: IngestUser,
    file: UploadFile = File(...),
    source: IngestSource = Form(...),
    dry_run: bool = Form(False),
):
    raw = await file.read(settings.MAX_UPLOAD_BYTES + 1)
    if len(raw) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="File exceeds 25 MB"
        )
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid JSON: {e}"
        )
    rows = payload.get("data") if isinstance(payload, dict) else payload
    if (
        not isinstance(rows, list)
        or not rows
        or not all(isinstance(r, dict) for r in rows)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Expected a non-empty array of row objects, or {"data": [...]}',
        )

    job = IngestJob(
        source=source,
        origin="upload",
        dry_run=dry_run,
        file_name=file.filename,
        started_by=user.email,
        received=len(rows),
        rows=rows,
    )
    session.add(job)
    await session.commit()
    await run_ingest_job.kiq(str(job.job_id))
    return job


@router.post(
    "/jobs/{job_id}/commit",
    response_model=IngestJobOut,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[CSRFProtected],
)
async def commit(job_id: UUID, session: SessionDep, user: IngestUser):
    parent = await _job_or_404(session, job_id)
    if not parent.dry_run or parent.status != JobStatus.SUCCESS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a successful dry run can be committed",
        )
    already = (
        await session.exec(
            select(IngestJob.job_id).where(
                IngestJob.parent_job_id == job_id,
                col(IngestJob.status).in_(
                    [JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.SUCCESS]
                ),
            )
        )
    ).first()
    if already:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Already committed as job {already}",
        )

    job = IngestJob(
        source=parent.source,
        origin="commit",
        dry_run=False,
        file_name=parent.file_name,
        started_by=user.email,
        received=parent.received,
        parent_job_id=job_id,
    )
    session.add(job)
    await session.commit()
    await run_ingest_job.kiq(str(job.job_id))
    return job
