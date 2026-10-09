"""Analytics routes. Anyone signed in can read them; editing is a separate permission."""

from fastapi import APIRouter

from app.api.deps import CurrentUser, SessionDep
from app.schemas.analytics import CreatorSummary, CreatorSummaryRequest
from app.services.creator_summary import creator_summary

router = APIRouter()


@router.post("/creators/summary", response_model=CreatorSummary)
async def creators_summary(
    req: CreatorSummaryRequest, session: SessionDep, user: CurrentUser
):
    # Not cached on purpose: an edit should show on the dashboard straight away.
    return await creator_summary(session, req)
