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
    return sorted(apify.HANDLERS)


@router.post(
    "/runs",
    response_model=ApifyRunOut,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[CSRFProtected],
)
async def start(body: ApifyRunCreate, session: SessionDep, user: IngestUser):
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
    stmnt = select(ApifyRun).order_by(col(ApifyRun.started_at).desc()).limit(limit)
    return (await session.exec(stmnt)).all()


@router.get("/runs/{run_id}", response_model=ApifyRunOut)
async def get_run(run_id: str, session: SessionDep, user: IngestUser):
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
    if not hmac.compare_digest(
        x_apify_webhook_secret.encode(), settings.APIFY_WEBHOOK_SECRET.encode()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad webhook secret"
        )
    body = await request.json()
    run_id = (body.get("resource") or {}).get("id") or (
        body.get("eventData") or {}
    ).get("actorRunId")
    if not run_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No run id in payload"
        )
    await process_apify_run.kiq(run_id)
    return {"accepted": run_id}
