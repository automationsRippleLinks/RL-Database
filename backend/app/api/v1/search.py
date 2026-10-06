"""Search routes: auth and caching around servics/searches.py"""

from typing import Literal

from fastapi import APIRouter, Query

from app.core.config import settings
from app.core.cache import cached, cache_key
from app.api.deps import SessionFactoryDep, SessionDep, CurrentUser, RedisDep
from app.services import search
from app.schemas.search import (
    SearchResponse,
    CreatorRow,
    CreatorSearchRequest,
    BrandRow,
    BrandSearchRequest,
    CampaignRow,
    CampaignSearchRequest,
    PitchRow,
    PitchSearchRequest,
)

router = APIRouter()


@router.post("/creators", response_model=SearchResponse[CreatorRow])
async def search_creators(
    req: CreatorSearchRequest, session: SessionDep, user: CurrentUser
):
    return await search.creators(session, req)


@router.post("/brands", response_model=SearchResponse[BrandRow])
async def search_brands(
    req: BrandSearchRequest, session: SessionDep, user: CurrentUser
):
    return await search.brands(session, req)


@router.post("/campaigns", response_model=SearchResponse[CampaignRow])
async def search_campaigns(
    req: CampaignSearchRequest, session: SessionDep, user: CurrentUser
):
    return await search.campaigns(session, req)


@router.post("/pitches", response_model=SearchResponse[PitchRow])
async def search_pitches(
    req: PitchSearchRequest, session: SessionDep, user: CurrentUser
):
    return await search.pitches(session, req)


_FACETS = {
    "creators": search.facets_creators,
    "brands": search.facets_brands,
    "campaigns": search.facets_campaigns,
    "pitches": search.facets_pitches,
}


@router.get("/facets/{kind}")
async def facets(
    kind: Literal["creators", "brands", "campaigns", "pitches"],
    session: SessionDep,
    redis: RedisDep,
    user: CurrentUser,
):
    return await cached(
        redis,
        cache_key(f"{settings.FACETS_CACHE_PREFIX}{kind}"),
        settings.FACETS_CACHE_TTL,
        lambda: _FACETS[kind](session),
    )


@router.get("")
async def global_search(
    redis: RedisDep,
    session_factory: SessionFactoryDep,
    user: CurrentUser,
    q: str = Query(..., min_length=2),
    limit: int = Query(default=5, ge=1, le=20),
):
    return await cached(
        redis,
        cache_key(
            f"{settings.SEARCH_CACHE_PREFIX}global",
            {"q": q.strip().lower(), "limit": limit},
        ),
        settings.SEARCH_CACHE_TTL,
        lambda: search.global_search(session_factory, q, limit),
    )


@router.get("/suggest")
async def suggest(
    session: SessionDep,
    redis: RedisDep,
    user: CurrentUser,
    q: str = Query(..., min_length=1),
    limit: int = Query(default=8, ge=1, le=20),
):
    return await cached(
        redis,
        cache_key(
            settings.SUGGEST_CACHE_PREFIX, {"q": q.strip().lower(), "limit": limit}
        ),
        settings.SUGGEST_CACHE_TTL,
        lambda: search.suggest(session, q, limit),
    )
