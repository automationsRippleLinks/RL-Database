from datetime import datetime, time as dtime
import asyncio
from typing import Awaitable, Callable, Any

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlmodel import select, col, or_, func, exists, union, Column
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import (
    FACETS_PREFIX,
    SUGGEST_PREFIX,
    SEARCH_PREFIX,
    SUGGEST_TTL,
    FACETS_TTL,
    SEARCH_TTL,
)
from app.core.cache import cached, cache_key
from app.core.db import Session_Factory
from app.api.deps import SessionDep, CurrentUser, RedisDep
from app.schemas.search import (
    SearchResponse,
    CreatorRow,
    CreatorSearchRequest,
    BrandRow,
    BrandSearchRequest,
    CampaignRow,
    CampaignSearchRequest,
    CompanyRef,
    BrandRef,
    PitchRow,
    PitchSearchRequest,
)
from app.services.search import Timer, text_clause, count_of, clamp_page, tokens
from app.models import (
    Creator,
    Pitch,
    Brand,
    Campaign,
    CampaignCreatorLink,
    PitchCreatorLink,
    Company,
    User,
    Category,
    Language,
)

router = APIRouter()


async def _distinct(session: AsyncSession, column: Column, *, where=None) -> list:
    stmnt = select(column).distinct().where(col(column).is_not(None)).order_by(column)
    if where is not None:
        stmnt = stmnt.where(where)
    return [v for v in (await session.exec(stmnt)).all() if v is not None]


# --- full search ---


@router.post("/creators", response_model=SearchResponse[CreatorRow])
async def search_creators(
    req: CreatorSearchRequest, session: SessionDep, user: CurrentUser
):
    with Timer() as t:
        stmnt = select(Creator)

        tc = text_clause(
            req.text,
            [
                col(Creator.name),
                col(Creator.username),
                col(Creator.categories_raw),
                col(Creator.languages_raw),
                col(Creator.city),
            ],
        )
        if tc is not None:
            stmnt = stmnt.where(tc)

        if req.platforms:
            stmnt = stmnt.where(col(Creator.platform).in_(req.platforms))
        if req.tiers:
            stmnt = stmnt.where(col(Creator.tier).in_(req.tiers))
        if req.genders:
            stmnt = stmnt.where(col(Creator.gender).in_(req.genders))
        if req.cities:
            stmnt = stmnt.where(
                or_(*[col(Creator.city).ilike(f"%{c}%") for c in req.cities])
            )
        if req.categories:
            stmnt = stmnt.where(
                or_(
                    *[
                        col(Creator.categories_raw).ilike(f"%{c}%")
                        for c in req.categories
                    ]
                )
            )
        if req.languages:
            stmnt = stmnt.where(
                or_(
                    *[col(Creator.languages_raw).ilike(f"%{l}%") for l in req.languages]
                )
            )
        if req.has_email:
            stmnt = stmnt.where(
                col(Creator.email).is_not(None), col(Creator.email) != ""
            )
        if req.has_phone:
            stmnt = stmnt.where(
                col(Creator.phone).is_not(None), col(Creator.phone) != ""
            )

        if req.min_followers is not None:
            stmnt = stmnt.where(col(Creator.followers) >= req.min_followers)
        if req.max_followers is not None:
            stmnt = stmnt.where(col(Creator.followers) <= req.max_followers)
        if req.min_avg_views is not None:
            stmnt = stmnt.where(col(Creator.avg_views) >= req.min_avg_views)
        if req.max_avg_views is not None:
            stmnt = stmnt.where(col(Creator.avg_views) <= req.max_avg_views)

        total = await count_of(session, stmnt)
        page, pages = clamp_page(total, req.page, req.page_size)

        sort = req.sort
        if sort == "relevance" and not tokens(req.text):
            sort = "followers_desc"

        order = {
            "followers_desc": col(Creator.followers).desc().nullslast(),
            "followers_asc": col(Creator.followers).asc().nullsfirst(),
            "avg_views_desc": col(Creator.avg_views).desc().nullslast(),
            "avg_views_asc": col(Creator.avg_views).asc().nullsfirst(),
            "name_desc": col(Creator.name).desc(),
            "name_asc": col(Creator.name).asc(),
        }.get(sort)

        if sort == "relevance":
            q = " ".join(tokens(req.text))
            stmnt = stmnt.order_by(
                col(Creator.username).ilike(f"{q}%").desc(),  # username prefix
                col(Creator.name).ilike(f"{q}%").desc(),  # name prefix
                col(Creator.name).ilike(f"%{q}%").desc(),  # name contains
                col(Creator.followers).desc().nullslast(),  # followers tiebreaker
            )
        elif order is not None:
            stmnt = stmnt.order_by(order)

        stmnt = stmnt.order_by(col(Creator.id))
        stmnt = stmnt.offset((page - 1) * req.page_size).limit(req.page_size)
        rows = (await session.exec(stmnt)).all()

    return SearchResponse[CreatorRow](
        total=total,
        pages=pages,
        page=page,
        page_size=req.page_size,
        rows=[CreatorRow.model_validate(r, from_attributes=True) for r in rows],
        took_ms=t.ms,
    )


@router.post("/brands", response_model=SearchResponse[BrandRow])
async def search_brands(
    req: BrandSearchRequest, session: SessionDep, user: CurrentUser
):
    with Timer() as t:
        pitch_count = (
            select(func.count())
            .select_from(Pitch)
            .where(col(Pitch.brand_id) == Brand.id)
            .correlate(Brand)
            .scalar_subquery()
        )
        campaign_count = (
            select(func.count())
            .select_from(Campaign)
            .where(col(Campaign.brand_id) == Brand.id)
            .correlate(Brand)
            .scalar_subquery()
        )
        creators_union = union(
            select(CampaignCreatorLink.creator_id)
            .join(Campaign, col(Campaign.id) == col(CampaignCreatorLink.campaign_id))
            .where(col(Campaign.brand_id) == Brand.id)
            .correlate(Brand),
            select(PitchCreatorLink.creator_id)
            .join(Pitch, col(Pitch.id) == col(PitchCreatorLink.pitch_id))
            .where(col(Pitch.brand_id) == Brand.id)
            .correlate(Brand),
        ).subquery()
        creator_count = (
            select(func.count())
            .select_from(creators_union)
            .correlate(Brand)
            .scalar_subquery()
        )

        latest_activity = func.greatest(
            select(func.max(Campaign.start_date))
            .where(col(Campaign.brand_id) == Brand.id)
            .correlate(Brand)
            .scalar_subquery(),
            select(func.max(func.date(Pitch.created_at)))
            .where(col(Pitch.brand_id) == Brand.id)
            .correlate(Brand)
            .scalar_subquery(),
        )
        stmnt = select(
            Brand,
            Company,
            pitch_count.label("pitch_count"),
            campaign_count.label("campaign_count"),
            creator_count.label("creator_count"),
            latest_activity.label("latest_activity"),
        ).join(Company, col(Company.id) == col(Brand.company_id), isouter=True)

        tc = text_clause(
            req.text, [col(Brand.display_name), col(Company.name), col(Brand.gstin)]
        )
        if tc is not None:
            stmnt = stmnt.where(tc)

        if req.has_company:
            stmnt = stmnt.where(col(Brand.company_id).is_not(None))
        if req.has_gstin:
            stmnt = stmnt.where(col(Brand.gstin).is_not(None), col(Brand.gstin) != "")
        if req.org_types:
            stmnt = stmnt.where(
                exists(
                    select(Pitch.id).where(
                        col(Pitch.brand_id) == Brand.id,
                        col(Pitch.org_type).in_(req.org_types),
                    )
                )
            )
        if req.platforms:
            stmnt = stmnt.where(
                exists(
                    select(Pitch.id).where(
                        col(Pitch.brand_id) == Brand.id,
                        col(Pitch.platform).overlap(req.platforms),
                    )
                )
            )
        if req.min_pitches is not None:
            stmnt = stmnt.where(pitch_count >= req.min_pitches)
        if req.min_campaigns is not None:
            stmnt = stmnt.where(campaign_count >= req.min_campaigns)

        total = await count_of(session, stmnt)
        page, pages = clamp_page(total, req.page, req.page_size)

        sort = req.sort
        if sort == "relevance" and not tokens(req.text):
            sort = "name_asc"
        order = {
            "name_asc": col(Brand.display_name).asc(),
            "name_desc": col(Brand.display_name).desc(),
            "campaigns_desc": campaign_count.desc(),
            "pitches_desc": pitch_count.desc(),
            "recent_desc": latest_activity.desc().nullslast(),
            "relevance": col(Brand.display_name)
            .ilike(f"{' '.join(tokens(req.text))}%")
            .desc(),
        }.get(sort, col(Brand.display_name).asc())
        stmnt = stmnt.order_by(order, col(Brand.id))

        stmnt = stmnt.offset((page - 1) * req.page_size).limit(req.page_size)
        results = (await session.exec(stmnt)).all()

        brand_ids = [b.id for b, *_ in results]
        agg: dict[int, tuple[set, set]] = {bid: (set(), set()) for bid in brand_ids}
        if brand_ids:
            for bid, org_type, platforms in (
                await session.exec(
                    select(Pitch.brand_id, Pitch.org_type, Pitch.platform).where(
                        col(Pitch.brand_id).in_(brand_ids)
                    )
                )
            ).all():
                agg[bid][0].add(org_type)
                agg[bid][1].update(platforms or [])

    rows = [
        BrandRow(
            id=b.id,
            name=b.display_name,
            gstin=b.gstin,
            company=CompanyRef(id=c.id, name=c.name, gstin=c.gstin) if c else None,
            pitch_count=pc,
            campaign_count=cc,
            creator_count=crc,
            org_types=sorted(agg[b.id][0]),
            platforms=sorted(agg[b.id][1]),
            latest_activity=la,
        )
        for b, c, pc, cc, crc, la in results
    ]
    return SearchResponse[BrandRow](
        total=total,
        pages=pages,
        page=page,
        page_size=req.page_size,
        rows=rows,
        took_ms=t.ms,
    )


@router.post("/campaigns", response_model=SearchResponse[CampaignRow])
async def search_campaigns(
    req: CampaignSearchRequest, session: SessionDep, user: CurrentUser
):
    with Timer() as t:
        creator_count = (
            select(func.count())
            .select_from(CampaignCreatorLink)
            .where(col(CampaignCreatorLink.campaign_id) == Campaign.id)
            .correlate(Campaign)
            .scalar_subquery()
        )

        stmnt = select(Campaign, Brand, creator_count.label("creator_count")).join(
            Brand, col(Brand.id) == col(Campaign.brand_id), isouter=True
        )

        tc = text_clause(
            req.text,
            [
                col(Campaign.campaign_code),
                col(Campaign.campaign_name),
                col(Campaign.manager),
                col(Brand.display_name),
                func.array_to_string(col(Campaign.member_names), " "),
            ],
        )
        if tc is not None:
            stmnt = stmnt.where(tc)

        if req.statuses:
            stmnt = stmnt.where(col(Campaign.status).in_(req.statuses))
        if req.report_statuses:
            stmnt = stmnt.where(col(Campaign.report_status).in_(req.report_statuses))
        if req.months:
            stmnt = stmnt.where(col(Campaign.month_name).in_(req.months))
        if req.years:
            stmnt = stmnt.where(col(Campaign.year).in_(req.years))
        if req.managers:
            stmnt = stmnt.where(col(Campaign.manager).in_(req.managers))
        if req.brand_ids:
            stmnt = stmnt.where(col(Campaign.brand_id).in_(req.brand_ids))
        if req.start_date_from is not None:
            stmnt = stmnt.where(col(Campaign.start_date) >= req.start_date_from)
        if req.start_date_to is not None:
            stmnt = stmnt.where(col(Campaign.start_date) <= req.start_date_to)

        total = await count_of(session, stmnt)
        page, pages = clamp_page(total, req.page, req.page_size)

        sort = req.sort
        if sort == "relevance" and not tokens(req.text):
            sort = "start_date_desc"
        order = {
            "start_date_desc": col(Campaign.start_date).desc().nullslast(),
            "start_date_asc": col(Campaign.start_date).asc().nullsfirst(),
            "code_asc": col(Campaign.campaign_code).asc(),
            "code_desc": col(Campaign.campaign_code).desc(),
            "creators_desc": creator_count.desc(),
            "relevance": col(Campaign.campaign_name)
            .ilike(f"{' '.join(tokens(req.text))}%")
            .desc(),
        }.get(sort, col(Campaign.start_date).desc().nullslast())
        stmnt = stmnt.order_by(order, col(Campaign.id))

        stmnt = stmnt.offset((page - 1) * req.page_size).limit(req.page_size)
        results = (await session.exec(stmnt)).all()

    rows = [
        CampaignRow(
            id=c.id,
            campaign_code=c.campaign_code,
            campaign_name=c.campaign_name,
            brand=BrandRef(id=b.id, name=b.display_name) if b else None,
            manager=c.manager,
            member_names=c.member_names or [],
            month_name=c.month_name,
            year=c.year,
            status=c.status,
            report_status=c.report_status,
            start_date=c.start_date,
            expected_end_date=c.expected_end_date,
            end_date=c.end_date,
            report_completion_date=c.report_completion_date,
            creator_count=cc,
            spreadsheet_link=c.spreadsheet_link,
            report_link=c.report_link,
        )
        for c, b, cc in results
    ]
    return SearchResponse[CampaignRow](
        total=total,
        pages=pages,
        page=page,
        page_size=req.page_size,
        rows=rows,
        took_ms=t.ms,
    )


@router.post("/pitches", response_model=SearchResponse[PitchRow])
async def search_pitches(
    req: PitchSearchRequest, session: SessionDep, user: CurrentUser
):
    with Timer() as t:
        creator_count = (
            select(func.count())
            .select_from(PitchCreatorLink)
            .where(col(PitchCreatorLink.pitch_id) == Pitch.id)
            .correlate(Pitch)
            .scalar_subquery()
        )
        converted = exists(
            select(Campaign.id)
            .where(col(Campaign.pitch_id) == Pitch.id)
            .correlate(Pitch)
        )

        stmnt = select(
            Pitch,
            Brand,
            creator_count.label("creator_count"),
            converted.label("converted"),
        ).join(Brand, col(Brand.id) == col(Pitch.brand_id), isouter=True)

        tc = text_clause(
            req.text,
            [
                col(Pitch.pitch_code),
                col(Pitch.campaign_name),
                col(Pitch.sales_lead),
                col(Pitch.list_lead),
                col(Brand.display_name),
            ],
        )
        if tc is not None:
            stmnt = stmnt.where(tc)

        if req.org_types:
            stmnt = stmnt.where(col(Pitch.org_type).in_(req.org_types))
        if req.requirements:
            stmnt = stmnt.where(col(Pitch.requirement).in_(req.requirements))
        if req.platforms:
            stmnt = stmnt.where(col(Pitch.platform).overlap(req.platforms))
        if req.sales_leads:
            stmnt = stmnt.where(col(Pitch.sales_lead).in_(req.sales_leads))
        if req.list_leads:
            stmnt = stmnt.where(col(Pitch.list_lead).in_(req.list_leads))
        if req.brand_ids:
            stmnt = stmnt.where(col(Pitch.brand_id).in_(req.brand_ids))
        if req.created_from is not None:
            stmnt = stmnt.where(
                col(Pitch.created_at) >= datetime.combine(req.created_from, dtime.min)
            )
        if req.created_to is not None:
            # inclusive of the whole end day -- created_at is a timestamp
            stmnt = stmnt.where(
                col(Pitch.created_at) <= datetime.combine(req.created_to, dtime.max)
            )
        if req.converted is True:
            stmnt = stmnt.where(converted)
        elif req.converted is False:
            stmnt = stmnt.where(~converted)

        total = await count_of(session, stmnt)
        page, pages = clamp_page(total, req.page, req.page_size)

        sort = req.sort
        if sort == "relevance" and not tokens(req.text):
            sort = "created_desc"
        order = {
            "created_desc": col(Pitch.created_at).desc(),
            "created_asc": col(Pitch.created_at).asc(),
            "code_asc": col(Pitch.pitch_code).asc(),
            "code_desc": col(Pitch.pitch_code).desc(),
            "creators_desc": creator_count.desc(),
            "relevance": col(Pitch.campaign_name)
            .ilike(f"{' '.join(tokens(req.text))}%")
            .desc(),
        }.get(sort, col(Pitch.created_at).desc())
        stmnt = stmnt.order_by(order, col(Pitch.id))

        stmnt = stmnt.offset((page - 1) * req.page_size).limit(req.page_size)
        results = (await session.exec(stmnt)).all()

    rows = [
        PitchRow(
            id=p.id,
            pitch_code=p.pitch_code,
            brand=BrandRef(id=b.id, name=b.display_name) if b else None,
            campaign_name=p.campaign_name,
            org_type=p.org_type,
            requirement=p.requirement,
            platform=p.platform or [],
            sales_lead=p.sales_lead,
            list_lead=p.list_lead,
            creator_count=cc,
            converted=conv,
            spreadsheet_link=p.spreadsheet_link,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p, b, cc, conv in results
    ]
    return SearchResponse[PitchRow](
        total=total,
        pages=pages,
        page=page,
        page_size=req.page_size,
        rows=rows,
        took_ms=t.ms,
    )


# --- Facets ---


@router.get("/facets/creators")
async def facets_creators(session: SessionDep, redis: RedisDep, user: CurrentUser):
    async def produce():
        cats, langs = set(), set()
        for cat, lang in (
            await session.exec(select(Category.name, Language.name))
        ).all():
            cats.update(p.strip() for p in (cat or "").split(",") if p.strip())
            langs.update(p.strip() for p in (lang or "").split(",") if p.strip())

        return {
            "platforms": await _distinct(session, Creator.platform),
            "tiers": await _distinct(session, Creator.tier),
            "categories": sorted(cats),
            "languages": sorted(langs),
            "cities": await _distinct(session, Creator.city),
            "genders": await _distinct(session, Creator.gender),
            "total_creators": (
                await session.exec(select(func.count()).select_from(Creator))
            ).one(),
        }

    return await cached(
        redis, cache_key(f"{FACETS_PREFIX}creators"), FACETS_TTL, produce
    )


@router.get("/facets/campaigns")
async def facets_campaigns(session: SessionDep, redis: RedisDep, user: CurrentUser):
    async def produce():
        brands = (
            await session.exec(
                select(Brand.id, Brand.display_name)
                .join(Campaign, col(Campaign.brand_id) == col(Brand.id))
                .distinct()
                .order_by(Brand.display_name)
            )
        ).all()
        return {
            "statuses": await _distinct(session, Campaign.status),
            "report_statuses": await _distinct(session, Campaign.report_status),
            "months": await _distinct(session, Campaign.month_name),
            "years": sorted(await _distinct(session, Campaign.year), reverse=True),
            "managers": await _distinct(session, Campaign.manager),
            "brands": [BrandRef(id=i, name=n).model_dump() for i, n in brands],
            "total_campaigns": (
                await session.exec(select(func.count()).select_from(Campaign))
            ).one(),
        }

    return await cached(
        redis, cache_key(f"{FACETS_PREFIX}campaigns"), FACETS_TTL, produce
    )


@router.get("/facets/brands")
async def facets_brands(session: SessionDep, redis: RedisDep, user: CurrentUser):
    async def produce():
        platforms = set()
        for arr in (
            await session.exec(
                select(Pitch.platform).where(col(Pitch.brand_id).is_not(None))
            )
        ).all():
            platforms.update(arr or [])

        return {
            "org_types": await _distinct(
                session, Pitch.org_type, where=col(Pitch.brand_id).is_not(None)
            ),
            "platforms": sorted(platforms),
            "total_brands": (
                await session.exec(select(func.count()).select_from(Brand))
            ).one(),
        }

    return await cached(redis, cache_key(f"{FACETS_PREFIX}brands"), FACETS_TTL, produce)


@router.get("/facets/pitches")
async def facets_pitches(session: SessionDep, redis: RedisDep, user: CurrentUser):
    async def produce():
        platforms = set()
        for arr in (await session.exec(select(Pitch.platform))).all():
            platforms.update(arr or [])
        brands = (
            await session.exec(
                select(Brand.id, Brand.display_name)
                .join(Pitch, col(Pitch.brand_id) == col(Brand.id))
                .distinct()
                .order_by(Brand.display_name)
            )
        ).all()
        return {
            "org_types": await _distinct(session, Pitch.org_type),
            "requirements": await _distinct(session, Pitch.requirement),
            "platforms": sorted(platforms),
            "sales_leads": await _distinct(session, Pitch.sales_lead),
            "list_leads": await _distinct(session, Pitch.list_lead),
            "brands": [BrandRef(id=i, name=n).model_dump() for i, n in brands],
            "total_pitches": (
                await session.exec(select(func.count()).select_from(Pitch))
            ).one(),
        }

    return await cached(
        redis, cache_key(f"{FACETS_PREFIX}pitches"), FACETS_TTL, produce
    )


# --- Global search ---


@router.get("")
async def global_search(
    redis: RedisDep,
    user: CurrentUser,
    q: str = Query(..., min_length=2),
    limit: int = Query(default=5, ge=1, le=20),
):
    async def produce():
        async def run(
            handler: Callable[[BaseModel, AsyncSession, User], Awaitable[Any]],
            req: BaseModel,
        ):
            async with Session_Factory() as session:
                return await handler(req, session, user)

        with Timer() as t:
            creators, brands, campaigns, pitches = await asyncio.gather(
                run(
                    search_creators,
                    CreatorSearchRequest(
                        text=q, page=1, page_size=limit, sort="relevance"
                    ),
                ),
                run(
                    search_brands,
                    BrandSearchRequest(
                        text=q, page=1, page_size=limit, sort="relevance"
                    ),
                ),
                run(
                    search_campaigns,
                    CampaignSearchRequest(
                        text=q, page=1, page_size=limit, sort="relevance"
                    ),
                ),
                run(
                    search_pitches,
                    PitchSearchRequest(
                        text=q, page=1, page_size=limit, sort="relevance"
                    ),
                ),
            )

        return {
            "query": q,
            "took_ms": t.ms,
            "groups": {
                name: {
                    "total": res.total,
                    "items": [r.model_dump(mode="json") for r in res.rows],
                }
                for name, res in (
                    ("creators", creators),
                    ("brands", brands),
                    ("campaigns", campaigns),
                    ("pitches", pitches),
                )
            },
        }

    return await cached(
        redis,
        cache_key(f"{SEARCH_PREFIX}global", {"q": q.strip().lower(), "limit": limit}),
        SEARCH_TTL,
        produce,
    )


# --- Search suggestions ---


@router.get("/suggest")
async def suggest(
    session: SessionDep,
    redis: RedisDep,
    user: CurrentUser,
    q: str = Query(..., min_length=1),
    limit: int = Query(default=8, ge=1, le=20),
):
    async def produce():
        prefix = f"{q.strip()}%"
        per = max(1, limit // 4)
        out = []

        for c in (
            await session.exec(
                select(Creator)
                .where(
                    or_(
                        col(Creator.name).ilike(prefix),
                        col(Creator.username).ilike(prefix),
                    )
                )
                .order_by(col(Creator.followers).desc().nullslast())
                .limit(per)
            )
        ).all():
            out.append(
                {
                    "type": "creators",
                    "id": str(c.id),
                    "label": c.name,
                    "sublabel": f"@{c.username} · {c.platform}",
                }
            )

        for b in (
            await session.exec(
                select(Brand)
                .where(col(Brand.display_name).ilike(prefix))
                .order_by(Brand.display_name)
                .limit(per)
            )
        ).all():
            out.append(
                {
                    "type": "brands",
                    "id": str(b.id),
                    "label": b.display_name,
                    "sublabel": None,
                }
            )

        for c, bn in (
            await session.exec(
                select(Campaign, Brand.display_name)
                .join(Brand, col(Brand.id) == col(Campaign.brand_id), isouter=True)
                .where(
                    or_(
                        col(Campaign.campaign_name).ilike(prefix),
                        col(Campaign.campaign_code).ilike(prefix),
                    )
                )
                .order_by(col(Campaign.start_date).desc().nullslast())
                .limit(per)
            )
        ).all():
            out.append(
                {
                    "type": "campaigns",
                    "id": str(c.id),
                    "label": c.campaign_name,
                    "sublabel": f"{c.campaign_code}" + (f" · {bn}" if bn else ""),
                }
            )

        for p, bn in (
            await session.exec(
                select(Pitch, Brand.display_name)
                .join(Brand, col(Brand.id) == col(Pitch.brand_id), isouter=True)
                .where(
                    or_(
                        col(Pitch.campaign_name).ilike(prefix),
                        col(Pitch.pitch_code).ilike(prefix),
                    )
                )
                .order_by(col(Pitch.created_at).desc().nullslast())
                .limit(per)
            )
        ).all():
            out.append(
                {
                    "type": "pitches",
                    "id": str(p.id),
                    "label": p.campaign_name,
                    "sublabel": f"{p.pitch_code}" + (f" · {bn}" if bn else ""),
                }
            )

        return {"query": q, "suggestions": out[:limit]}

    return await cached(
        redis,
        cache_key(SUGGEST_PREFIX, {"q": q.strip().lower(), "limit": limit}),
        SUGGEST_TTL,
        produce,
    )
