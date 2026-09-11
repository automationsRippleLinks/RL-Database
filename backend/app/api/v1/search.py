from datetime import datetime, time as dtime
import asyncio
from collections import defaultdict
from typing import Awaitable, Callable, Any, Iterable, Optional, Sequence
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlmodel import select, col, and_, or_, func, exists, union, Column
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.core.cache import cached, cache_key
from app.api.deps import SessionDep, CurrentUser, RedisDep, SessionFactoryDep
from app.models.enums import PlatformChoices
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
from app.services.profile_link import ProfileLink, looks_like_link, parse_profile_link
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
    CategoryCreatorLink,
    LanguageCreatorLink,
    BrandCreatorLink,
)

router = APIRouter()


async def _distinct(session: AsyncSession, column: Column, *, where=None) -> list:
    stmnt = select(column).distinct().where(col(column).is_not(None)).order_by(column)
    if where is not None:
        stmnt = stmnt.where(where)
    return [v for v in (await session.exec(stmnt)).all() if v is not None]


def _tag_exists(link_model, tag_model, fk, predicate):
    return exists(
        select(link_model.creator_id)
        .join(tag_model, col(tag_model.id) == col(fk))
        .where(col(link_model.creator_id) == Creator.id)
        .where(predicate)
        .correlate(Creator)
    )


def _has_any_category(names: Sequence[str]):
    wanted = [n.strip().lower() for n in names if n and n.strip()]
    if not wanted:
        return None
    return _tag_exists(
        CategoryCreatorLink,
        Category,
        CategoryCreatorLink.category_id,
        func.lower(col(Category.name)).in_(wanted),
    )


def _has_any_language(names: Sequence[str]):
    wanted = [n.strip().lower() for n in names if n and n.strip()]
    if not wanted:
        return None
    return _tag_exists(
        LanguageCreatorLink,
        Language,
        LanguageCreatorLink.language_id,
        func.lower(col(Language.name)).in_(wanted),
    )


def _on_campaign(live_only: bool):
    """EXISTS a CampaignCreatorLink for this creator.

    `live_only` narrows it to campaigns that actually ran. A dropped link means
    the creator was listed and then pulled, which is not the same as having
    worked -- detail.py treats it that way everywhere else too.

    The composite PK (creator_id, campaign_id) leads with creator_id, so this
    subquery is index-covered.
    """
    clause = select(CampaignCreatorLink.creator_id).where(
        col(CampaignCreatorLink.creator_id) == Creator.id
    )
    if live_only:
        clause = clause.where(col(CampaignCreatorLink.is_dropped).is_(False))
    return exists(clause.correlate(Creator))


def _has_value(column) -> Any:
    return and_(col(column).is_not(None), col(column) != "")


def _category_token(token: str):
    return _tag_exists(
        CategoryCreatorLink,
        Category,
        CategoryCreatorLink.category_id,
        col(Category.name).ilike(f"%{token}%"),
    )


def _language_token(token: str):
    return _tag_exists(
        LanguageCreatorLink,
        Language,
        LanguageCreatorLink.language_id,
        col(Language.name).ilike(f"%{token}%"),
    )


async def _tags_for_creators(
    session: AsyncSession, creator_ids: Iterable[UUID]
) -> tuple[dict[UUID, list[str]], dict[UUID, list[str]]]:
    """Batch-load tags for one page of results -- two queries, not two per row."""
    ids = list(creator_ids)
    if not ids:
        return {}, {}

    cats: dict[UUID, list[str]] = defaultdict(list)
    langs: dict[UUID, list[str]] = defaultdict(list)

    for creator_id, name in (
        await session.exec(
            select(CategoryCreatorLink.creator_id, Category.name)
            .join(Category, col(Category.id) == col(CategoryCreatorLink.category_id))
            .where(col(CategoryCreatorLink.creator_id).in_(ids))
            .order_by(Category.name)
        )
    ).all():
        cats[creator_id].append(name)

    for creator_id, name in (
        await session.exec(
            select(LanguageCreatorLink.creator_id, Language.name)
            .join(Language, col(Language.id) == col(LanguageCreatorLink.language_id))
            .where(col(LanguageCreatorLink.creator_id).in_(ids))
            .order_by(Language.name)
        )
    ).all():
        langs[creator_id].append(name)

    return cats, langs


async def _creators_by_username(
    session: AsyncSession,
    username: str,
    platform: Optional[PlatformChoices],
    limit: int,
) -> tuple[int, list[CreatorRow]]:
    """Creators whose handle is exactly `username`.

    Exact, not ILIKE: the ingest parser lowercases every handle before writing
    it, so an extracted handle either matches or the creator is not in the
    database. That also makes this a unique-index hit rather than a trigram
    scan. The same handle can legitimately exist on two platforms, so the
    platform narrows rather than being required.
    """
    stmnt = select(Creator).where(col(Creator.username) == username)
    if platform is not None:
        stmnt = stmnt.where(col(Creator.platform) == platform)

    total = await count_of(session, stmnt)
    rows = (
        await session.exec(
            stmnt.order_by(col(Creator.followers).desc().nullslast()).limit(limit)
        )
    ).all()
    cats, langs = await _tags_for_creators(session, (r.id for r in rows))
    return total, [
        CreatorRow.from_creator(
            r, categories=cats.get(r.id, []), languages=langs.get(r.id, [])
        )
        for r in rows
    ]


def _link_payload(link: ProfileLink) -> dict:
    return {
        "detected": True,
        "platform": link.platform.value if link.platform else None,
        "username": link.username,
    }


def _convert_to_link(id: str) -> str:
    return f"https://docs.google.com/open?id={id}"


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
                col(Creator.city),
            ],
            extra=[_category_token, _language_token],
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
        cat_clause = _has_any_category(req.categories)
        if cat_clause is not None:
            stmnt = stmnt.where(cat_clause)
        lang_clause = _has_any_language(req.languages)
        if lang_clause is not None:
            stmnt = stmnt.where(lang_clause)
        if req.has_email:
            stmnt = stmnt.where(_has_value(Creator.email))
        if req.has_phone:
            stmnt = stmnt.where(_has_value(Creator.phone))
        if req.has_contact:
            stmnt = stmnt.where(
                or_(_has_value(Creator.email), _has_value(Creator.phone))
            )

        if req.campaign_involvement == "worked":
            stmnt = stmnt.where(_on_campaign(live_only=True))
        elif req.campaign_involvement == "never":
            stmnt = stmnt.where(~_on_campaign(live_only=False))
        elif req.campaign_involvement == "dropped_only":
            stmnt = stmnt.where(
                _on_campaign(live_only=False), ~_on_campaign(live_only=True)
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
        cats, langs = await _tags_for_creators(session, (r.id for r in rows))

        out = [
            CreatorRow.from_creator(
                r, categories=cats.get(r.id, []), languages=langs.get(r.id, [])
            )
            for r in rows
        ]

    return SearchResponse[CreatorRow](
        total=total,
        pages=pages,
        page=page,
        page_size=req.page_size,
        rows=out,
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
            sort = "code_desc"
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
            spreadsheet_link=_convert_to_link(c.spreadsheet_id),
            report_link=_convert_to_link(c.report_id),
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
            sort = "code_desc"
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
            spreadsheet_link=_convert_to_link(p.spreadsheet_id),
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
        async def _tag_facet(tag_model, link_model, fk) -> list[str]:
            usage = func.count(col(link_model.creator_id))
            return [
                name
                for name, _ in (
                    await session.exec(
                        select(tag_model.name, usage.label("usage"))
                        .join(link_model, col(fk) == col(tag_model.id), isouter=True)
                        .group_by(col(tag_model.id), col(tag_model.name))
                        .order_by(usage.desc(), col(tag_model.name))
                    )
                ).all()
            ]

        return {
            "platforms": await _distinct(session, Creator.platform),
            "tiers": await _distinct(session, Creator.tier),
            "categories": await _tag_facet(
                Category, CategoryCreatorLink, CategoryCreatorLink.category_id
            ),
            "languages": await _tag_facet(
                Language, LanguageCreatorLink, LanguageCreatorLink.language_id
            ),
            "brands": await _tag_facet(
                Brand, BrandCreatorLink, BrandCreatorLink.brand_id
            ),
            "cities": await _distinct(session, Creator.city),
            "states": await _distinct(session, Creator.state),
            "regions": await _distinct(session, Creator.region),
            "genders": await _distinct(session, Creator.gender),
            "total_creators": (
                await session.exec(select(func.count()).select_from(Creator))
            ).one(),
        }

    return await cached(
        redis,
        cache_key(f"{settings.FACETS_PREFIX}creators"),
        settings.FACETS_TTL,
        produce,
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
        redis,
        cache_key(f"{settings.FACETS_PREFIX}campaigns"),
        settings.FACETS_TTL,
        produce,
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

    return await cached(
        redis,
        cache_key(f"{settings.FACETS_PREFIX}brands"),
        settings.FACETS_TTL,
        produce,
    )


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
        redis,
        cache_key(f"{settings.FACETS_PREFIX}pitches"),
        settings.FACETS_TTL,
        produce,
    )


# --- Global search ---


@router.get("")
async def global_search(
    redis: RedisDep,
    session_factory: SessionFactoryDep,
    user: CurrentUser,
    q: str = Query(..., min_length=2),
    limit: int = Query(default=5, ge=1, le=20),
):
    async def produce():
        async def run(
            handler: Callable[[BaseModel, AsyncSession, User], Awaitable[Any]],
            req: BaseModel,
        ):
            async with session_factory() as session:
                return await handler(req, session, user)

        def envelope(took_ms, groups, profile_link=None):
            return {
                "query": q,
                "took_ms": took_ms,
                "profile_link": profile_link,
                "groups": {
                    name: {"total": total, "items": items}
                    for name, (total, items) in groups.items()
                },
            }

        # Someone pasted a profile URL. Fanning that out to brands and campaigns
        # would ILIKE a whole URL against display names -- pure noise -- so this
        # answers the question actually being asked: who is this handle?
        if looks_like_link(q):
            link = parse_profile_link(q)
            with Timer() as t:
                if link.username:
                    async with session_factory() as session:
                        total, items = await _creators_by_username(
                            session, link.username, link.platform, limit
                        )
                else:
                    # A link we cannot read is not a search term either. No
                    # fuzzy fallback: "no results" is the honest answer.
                    total, items = 0, []
            return envelope(
                t.ms,
                {
                    "creators": (total, [r.model_dump(mode="json") for r in items]),
                    "brands": (0, []),
                    "campaigns": (0, []),
                    "pitches": (0, []),
                },
                profile_link=_link_payload(link),
            )

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

        return envelope(
            t.ms,
            {
                name: (res.total, [r.model_dump(mode="json") for r in res.rows])
                for name, res in (
                    ("creators", creators),
                    ("brands", brands),
                    ("campaigns", campaigns),
                    ("pitches", pitches),
                )
            },
        )

    return await cached(
        redis,
        cache_key(
            f"{settings.SEARCH_PREFIX}global", {"q": q.strip().lower(), "limit": limit}
        ),
        settings.SEARCH_TTL,
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
        # A pasted link has to work here too. Without this the grouped results
        # find the creator while the dropdown above them stays empty, which
        # reads as the box being broken.
        if looks_like_link(q):
            link = parse_profile_link(q)
            if not link.username:
                return {"query": q, "suggestions": []}
            _, rows = await _creators_by_username(
                session, link.username, link.platform, limit
            )
            return {
                "query": q,
                "suggestions": [
                    {
                        "type": "creators",
                        "id": str(c.id),
                        "label": c.name,
                        "sublabel": f"@{c.username} · {c.platform.value}",
                    }
                    for c in rows
                ],
            }

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
                    "sublabel": f"@{c.username} · {c.platform.value}",
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
        cache_key(settings.SUGGEST_PREFIX, {"q": q.strip().lower(), "limit": limit}),
        settings.SUGGEST_TTL,
        produce,
    )
