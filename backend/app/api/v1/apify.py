"""Apify routes: start a scraper run, list runs, and the webhook Apify calls when a
run ends. Everything but the webhook needs ingest permission."""

import hmac
from fastapi import APIRouter, HTTPException, status, Request, Header, Query

from sqlmodel import select, col

from app.core.config import settings
from app.api.deps import IngestUser, CSRFProtected, SessionDep
from app.services import apify
from app.models.apify_run import RunTrigger, ApifyRun
from app.schemas.apify import ApifyRunOut, ApifyRunCreate
from app.worker import process_apify_run

router = APIRouter()


@router.get("/actors", response_model=list[str])
async def actors(user: IngestUser):
    """Apify actors we can start, i.e. those with a result handler."""

    return sorted(apify.HANDLERS)


@router.post(
    "/runs",
    response_model=ApifyRunOut,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[CSRFProtected],
)
async def start(body: ApifyRunCreate, session: SessionDep, user: IngestUser):
    """Start an Apify run by hand and record it; results come later via the webhook."""

    try:
        return await apify.start_run(
            session, body.actor, body.run_input, RunTrigger.MANUAL, user.email
        )
    except apify.UnknownActor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No result handler for actor {body.actor!r}",
        )

@router.get("/runs", response_model=list[ApifyRunOut])
async def list_runs(session: SessionDep, user: IngestUser, limit: int = Query(20, ge=1, le=100)):
    """Most recent Apify runs, newest first."""

    stmnt = select(ApifyRun).order_by(col(ApifyRun.started_at).desc()).limit(limit)
    return (await session.exec(stmnt)).all()


@router.get("/runs/{run_id}", response_model=ApifyRunOut)
async def get_run(run_id: str, session: SessionDep, user: IngestUser):
    """One Apify run by its Apify run id (not our row id), or 404."""

    row = (
        await session.exec(select(ApifyRun).where(ApifyRun.run_id == run_id))
    ).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Run not found"
        )
    return row


@router.post("/webhook", status_code=status.HTTP_202_ACCEPTED)
async def webhook(request: Request, x_apify_webhook_secret: str = Header("")):
    """Called by Apify when a run ends; queues the run for the worker to process.

    No user session: Apify proves itself with the shared secret header instead.
    Repeat calls are harmless, as the worker only processes a run it can claim.
    """
    # constant-time compare so the secret can't be guessed from response timing
    if not hmac.compare_digest(
        x_apify_webhook_secret.encode(), settings.APIFY_WEBHOOK_SECRET.encode()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad webhook secret"
        )
    body = await request.json()
    # where the run id sits depends on the webhook's payload template; accept both
    run_id = (body.get("resource") or {}).get("id") or (
        body.get("eventData") or {}
    ).get("actorRunId")
    if not run_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No run id in payload"
        )
    await process_apify_run.kiq(run_id)
    return {"accepted": run_id}
