from datetime import datetime, timezone
import json
from uuid import UUID

from fastapi import APIRouter, HTTPException, status, Query, UploadFile, File, Form
from sqlmodel import select, col, func

from app.core.cache import invalidate, FACETS_PREFIX, SEARCH_PREFIX, SUGGEST_PREFIX
from app.api.deps import SessionDep, IngestUser, CSRFProtected, RedisDep
from app.models import IngestJob as IngestJobSQL, Pitch, Campaign, Brand, Creator
from app.services.ingest import Ingest
from app.services.ingest_job import record_job, job_to_schema, IngestResult
from app.schemas.ingest import (
    IngestSourceInfo,
    IngestSource,
    IngestJob,
    IngestJobList,
    IngestCounts,
    IngestRowError,
)

router = APIRouter()
ingest_service = Ingest()

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB

_ROW_COUNT_MODELS = {
    IngestSource.pitch_master: Pitch,
    IngestSource.campaign_master: Campaign,
    IngestSource.brands: Brand,
    IngestSource.pitch_creator: Creator
}

_LABELS = {
    IngestSource.pitch_master: "Pitch Master",
    IngestSource.campaign_master: "Campaign Master",
    IngestSource.pitch_creator: "Pitch Creator",
    IngestSource.campaign_creator: "Campaign Creator",
    IngestSource.brands: "Brands",
}

_HANDLERS = {
    IngestSource.pitch_master: ingest_service.ingest_pitch_master_data,
    IngestSource.campaign_master: ingest_service.ingest_campaign_master_data,
    IngestSource.pitch_creator: ingest_service.ingest_pitch_creator_data,
    IngestSource.campaign_creator: ingest_service.ingest_campaign_creator_data,
}


@router.get("/sources")
async def ingest_sources(session: SessionDep, user: IngestUser):
    rows = (
        await session.exec(
            select(IngestJobSQL).order_by(col(IngestJobSQL.started_at).desc())
        )
    ).all()
    last_by_source: dict[str, IngestJobSQL] = {}
    for r in rows:
        last_by_source.setdefault(r.source, r)

    sources = []
    for src in IngestSource:
        model = _ROW_COUNT_MODELS.get(src)
        row_count = None
        if model is not None:
            row_count = (
                await session.exec(select(func.count()).select_from(model))
            ).one()
        last = last_by_source.get(src.value)
        sources.append(
            IngestSourceInfo(
                source=src,
                label=_LABELS[src],
                apps_script_supported=False,
                upload_supported=src in _HANDLERS,
                last_job=job_to_schema(last) if last else None,
                row_count=row_count,
            )
        )

    return {"sources": sources}


@router.get("/jobs", response_model=IngestJobList)
async def list_jobs(
    session: SessionDep, user: IngestUser, limit: int = Query(20, ge=1, le=100)
):
    rows = (
        await session.exec(
            (
                select(IngestJobSQL)
                .order_by(col(IngestJobSQL.started_at).desc())
                .limit(limit)
            )
        )
    ).all()
    return IngestJobList(jobs=[job_to_schema(r) for r in rows])


@router.get("/jobs/{job_id}", response_model=IngestJob)
async def get_job(job_id: UUID, session: SessionDep, user: IngestUser):
    row = (
        await session.exec(select(IngestJobSQL).where(IngestJobSQL.job_id == job_id))
    ).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found"
        )
    return job_to_schema(row)


# @router.post("/upload", response_model=IngestJob, dependencies=[CSRFProtected])
@router.post("/upload", response_model=IngestJob)
async def upload(
    session: SessionDep,
    redis: RedisDep,
    # user: IngestUser,
    file: UploadFile = File(...),
    source: IngestSource = Form(...),
    dry_run: bool = Form(False),
):
    handler = _HANDLERS.get(source)
    if handler is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No parser implemented for source '{source.value}'",
        )

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
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
    if not isinstance(rows, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expected a JSON array of rows, or an object with a 'data' array",
        )

    started_at = datetime.now(timezone.utc)
    # started_by = user.email
    started_by = "automations@ripplelinks.com"
    try:
        result = await handler(session, rows)
        if dry_run:
            await session.rollback()
        else:
            await session.commit()
    except Exception as e:
        await session.rollback()
        result = IngestResult(
            counts=IngestCounts(
                received=len(rows), inserted=0, updated=0, skipped=0, failed=len(rows)
            ),
            errors=[IngestRowError(row=0, message=str(e))],
            message="Ingest failed; no rows were written.",
        )
    else:
        if not dry_run: # redis should not report successful ingest as a failure
            await invalidate(redis, FACETS_PREFIX, SEARCH_PREFIX, SUGGEST_PREFIX)

    row = await record_job(
        source=source,
        origin="upload",
        dry_run=dry_run,
        started_by=started_by,
        started_at=started_at,
        result=result,
        file_name=file.filename,
    )
    return job_to_schema(row)

@router.post("/apps-script/{source}", response_model=IngestJob, dependencies=[CSRFProtected])
async def run_apps_script(source: IngestSource, user: IngestUser):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Apps Script ingest is not implemented yet - upload a JSON file instead."
    )
