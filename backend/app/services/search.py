"""The search queries. Routes only caching and auth on top of these, and the
detail pages reuse them instead of reaching into another route module."""

from typing import Callable, Optional, Sequence, Iterable, Any
from datetime import datetime, time as dtime
import time
from uuid import UUID
from collections import defaultdict
import asyncio

from sqlalchemy import ColumnElement
from sqlmodel import and_, or_, select, func, col, exists, union
from sqlmodel.sql.expression import Select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.db import SessionFactory
from app.schemas.search import (
    Paging,
    SearchResponse,
    CreatorRow,
    CreatorSearchRequest,
    BrandRow,
    BrandSearchRequest,
    BrandRef,
    CampaignRow,
    CampaignSearchRequest,
    CompanyRef,
    PitchRow,
    PitchSearchRequest,
)
from app.models import (
    Category,
    CategoryCreatorLink,
    Language,
    LanguageCreatorLink,
    Tag,
    TagCreatorLink,
    Creator,
    Campaign,
    CampaignCreatorLink,
    Brand,
    BrandCreatorLink,
    Pitch,
    PitchCreatorLink,
    Company,
    CommercialPackage,
)
from app.services.ingest.direct import PACKAGE_NAME
from app.services import creator_gaps
from app.models.enums import PlatformChoices
from app.services.profile_link import parse_profile_link, looks_like_link

# === building blocks ===================================================


def tokens(text: Optional[str]) -> list[str]:
    return [t for t in (text or "").split() if t]


def text_clause(
    text: Optional[str],
    fields: Sequence[ColumnElement],
    extra: Sequence[Callable[[str], ColumnElement]] = (),
) -> Optional[ColumnElement]:
    """Every word must match at least one of the fields (or extra clauses)"""
    words = tokens(text)
    if not words:
        return None
    return and_(
        *[
            or_(
                *[f.ilike(f"%{w}%") for f in fields],
                *[make(w) for make in extra],
            )
            for w in words
        ]
    )


def _starts_with(column, text: Optional[str]):
    return col(column).ilike(f"{' '.join(tokens(text))}%").desc()


async def _page(
    session: AsyncSession, stmnt: Select, req: Paging, *order
) -> tuple[int, int, int, list]:
    """(total, page, pages, rows) -- counts, clamps the page, orders, slices."""
    sub = stmnt.order_by(None).subquery()
    total = (await session.exec(select(func.count()).select_from(sub))).one()
    pages = max(1, (total + req.page_size - 1) // req.page_size)
    page = min(req.page, pages)
    stmnt = (
        stmnt.order_by(*order).offset((page - 1) * req.page_size).limit(req.page_size)
    )
    return total, page, pages, (await session.exec(stmnt)).all()


def _response(
    t0: float, total: int, page: int, pages: int, req: Paging, rows: list
) -> SearchResponse:
    return SearchResponse(
        total=total,
        pages=pages,
        page=page,
        page_size=req.page_size,
        rows=rows,
        took_ms=int((time.perf_counter() - t0) * 1000),
    )


# The three creator<->term tables are the same shape: (link, term, fk column).
_TERMS = {
    "category": (CategoryCreatorLink, Category, CategoryCreatorLink.category_id),
    "language": (LanguageCreatorLink, Language, LanguageCreatorLink.language_id),
    "tag": (TagCreatorLink, Tag, TagCreatorLink.tag_id),
}


def _has_term(kind: str, predicate) -> ColumnElement:
    link, term, fk = _TERMS[kind]
    return exists(
        select(link.creator_id)
        .join(term, col(term.id) == col(fk))
        .where(col(link.creator_id) == Creator.id, predicate)
        .correlate(Creator)
    )


def _has_any(kind: str, names: Sequence[str]) -> Optional[ColumnElement]:
    """Linked to at least one these names (case-sensitive)."""
    wanted = [n.strip().lower() for n in names if n and n.strip()]
    if not wanted:
        return None
    return _has_term(kind, func.lower(col(_TERMS[kind][1].name)).in_(wanted))


def _term_like(kind: str) -> Callable[[str], ColumnElement]:
    return lambda word: _has_term(kind, col(_TERMS[kind][1].name).ilike(f"%{word}%"))


def _not_empty(array_column) -> ColumnElement:
    # cardinality, not IS NOT NULL: since arrays default to {} rather than NULL,
    # so basically check its length
    return func.cardinality(col(array_column)) > 0


def _package_cost():
    """The creator's current standard package cost; NULL when they have non.

    At most one row can match: a unique index allows one open package per creator and name
    """
    return (
        select(CommercialPackage.cost)
        .where(
            col(CommercialPackage.creator_id) == Creator.id,
            col(CommercialPackage.name) == PACKAGE_NAME,
            col(CommercialPackage.valid_to).is_(None),
        )
        .correlate(Creator)
        .scalar_subquery()
    )


def _on_campaign(live_only: bool):
    """A dropped link means listed then pulled -- not the same as having worked."""
    clause = select(CampaignCreatorLink.creator_id).where(
        col(CampaignCreatorLink.creator_id) == Creator.id
    )
    if live_only:
        clause = clause.where(col(CampaignCreatorLink.is_dropped).is_(False))
    return exists(clause.correlate(Creator))


async def terms_for(
    session: AsyncSession, creator_ids: Iterable[UUID], kind: str = "category"
) -> dict[UUID, list[str]]:
    """Names of one term kind for a page of creators --  one query, not per row"""
    ids = list(creator_ids)
    out: dict[UUID, list[str]] = defaultdict(list)
    if not ids:
        return out
    link, term, fk = _TERMS[kind]
    stmnt = (
        select(link.creator_id, term.name)
        .join(term, col(term.id) == col(fk))
        .where(col(link.creator_id).in_(ids))
        .order_by(term.name)
    )
    for creator_id, name in (await session.exec(stmnt)).all():
        out[creator_id].append(name)
    return out


async def creator_rows(
    session: AsyncSession, creators: Sequence[Creator]
) -> list[CreatorRow]:
    cats = await terms_for(session, (c.id for c in creators), "category")
    langs = await terms_for(session, (c.id for c in creators), "language")
    return [CreatorRow.of(c, cats.get(c.id, []), langs.get(c.id, [])) for c in creators]


# === Four search endpoints logic =============================================================================


async def creators(
    session: AsyncSession, req: CreatorSearchRequest
) -> SearchResponse[CreatorRow]:
    t0 = time.perf_counter()
    stmnt = select(Creator)

    link = parse_profile_link(req.text) if looks_like_link(req.text) else None
    if link is not None and link.username:
        stmnt = stmnt.where(col(Creator.username) == link.username)
        if link.platform is not None:
            stmnt = stmnt.where(col(Creator.platform) == link.platform)
    else:
        tc = text_clause(
            req.text,
            [col(Creator.name), col(Creator.username), col(Creator.city)],
            extra=[_term_like("category"), _term_like("language")],
        )
        if tc is not None:
            stmnt = stmnt.where(tc)

    filters = [
        col(Creator.is_active) == req.is_active if req.is_active is not None else None,
        col(Creator.platform).in_(req.platforms) if req.platforms else None,
        col(Creator.tier).in_(req.tiers) if req.tiers else None,
        col(Creator.gender).in_(req.genders) if req.genders else None,
        (
            or_(*[col(Creator.city).ilike(f"%{c}%") for c in req.cities])
            if req.cities
            else None
        ),
        creator_gaps.term_filter("categories", req.categories),
        creator_gaps.term_filter("languages", req.languages),
        _has_any("tag", req.tags),
        creator_gaps.missing_filter(req.missing),
        (
            exists(
                select(BrandCreatorLink.creator_id)
                .where(
                    col(BrandCreatorLink.creator_id) == Creator.id,
                    col(BrandCreatorLink.brand_id).in_(req.brand_ids),
                )
                .correlate(Creator)
            )
            if req.brand_ids
            else None
        ),
        _not_empty(Creator.emails) if req.has_email else None,
        _not_empty(Creator.phones) if req.has_phone else None,
        (
            or_(_not_empty(Creator.phones), _not_empty(Creator.emails))
            if req.has_contact
            else None
        ),
        {
            "worked": _on_campaign(live_only=True),
            "never": ~_on_campaign(live_only=False),
            "dropped_only": and_(
                _on_campaign(live_only=False), ~_on_campaign(live_only=True)
            ),
        }.get(req.campaign_involvement or ""),
        (
            col(Creator.followers) >= req.min_followers
            if req.min_followers is not None
            else None
        ),
        (
            col(Creator.followers) <= req.max_followers
            if req.max_followers is not None
            else None
        ),
        (
            col(Creator.avg_views) >= req.min_avg_views
            if req.min_avg_views is not None
            else None
        ),
        (
            col(Creator.avg_views) <= req.max_avg_views
            if req.max_avg_views is not None
            else None
        ),
        _package_cost().is_not(None) if req.has_package else None,
        (
            _package_cost() >= req.min_package_cost
            if req.min_package_cost is not None
            else None
        ),
        (
            _package_cost() <= req.max_package_cost
            if req.max_package_cost is not None
            else None
        ),
    ]
    stmnt = stmnt.where(*[f for f in filters if f is not None])

    sort = req.sort
    if sort == "relevance" and (link is not None or not tokens(req.text)):
        sort = "followers_desc"
    if sort == "relevance":
        q = " ".join(tokens(req.text))
        order = [
            col(Creator.username).ilike(f"{q}%").desc(),  # username prefix
            col(Creator.name).ilike(f"{q}%").desc(),  # name prefix
            col(Creator.name).ilike(f"%{q}%").desc(),  # name contains
            col(Creator.followers).desc().nullslast(),
        ]
    else:
        order = [
            {
                "followers_desc": col(Creator.followers).desc().nullslast(),
                "followers_asc": col(Creator.followers).asc().nullsfirst(),
                "avg_views_desc": col(Creator.avg_views).desc().nullslast(),
                "avg_views_asc": col(Creator.avg_views).asc().nullsfirst(),
                "name_desc": col(Creator.name).desc(),
                "name_asc": col(Creator.name).asc(),
                "package_cost_desc": _package_cost().desc().nullslast(),
                "package_cost_asc": _package_cost().asc().nullslast(),
                "gaps_desc": creator_gaps.gap_count().desc(),
                "gaps_desc": creator_gaps.gap_count().asc(),
            }.get(sort, col(Creator.followers).desc().nullslast())
        ]

    total, page, pages, rows = await _page(session, stmnt, req, *order, col(Creator.id))
    return _response(t0, total, page, pages, req, await creator_rows(session, rows))


def _brand_counts():
    """Correlated per-brand aggregates, shared by search and the brand page"""
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
    latest = func.greatest(
        select(func.max(Campaign.start_date))
        .where(col(Campaign.brand_id) == Brand.id)
        .correlate(Brand)
        .scalar_subquery(),
        select(func.max(func.date(Pitch.created_at)))
        .where(col(Pitch.brand_id) == Brand.id)
        .correlate(Brand)
        .scalar_subquery(),
    )
    return pitch_count, campaign_count, creator_count, latest


async def _brand_pitch_facts(
    session: AsyncSession, brand_ids: list[int]
) -> dict[int, tuple[set, set]]:
    """brand id -> (org types, platforms) across its pitches"""
    facts: dict[int, tuple[set, set]] = {b: (set(), set()) for b in brand_ids}
    if brand_ids:
        stmnt = select(Pitch.brand_id, Pitch.org_type, Pitch.platform).where(
            col(Pitch.brand_id).in_(brand_ids)
        )
        for bid, org_type, platforms in (await session.exec(stmnt)).all():
            facts[bid][0].add(org_type)
            facts[bid][1].update(platforms or [])
    return facts


async def brands(
    session: AsyncSession, req: BrandSearchRequest
) -> SearchResponse[BrandRow]:
    t0 = time.perf_counter()
    pitch_count, campaign_count, creator_count, latest = _brand_counts()
    stmnt = select(
        Brand,
        Company,
        pitch_count.label("pitch_count"),
        campaign_count.label("campaign_count"),
        creator_count.label("creator_count"),
        latest.label("latest_activity"),
    ).join(Company, col(Company.id) == col(Brand.company_id), isouter=True)

    def pitch_exists(clause):
        return exists(select(Pitch.id).where(col(Pitch.brand_id) == Brand.id, clause))

    filters = [
        text_clause(
            req.text, [col(Brand.display_name), col(Company.name), col(Brand.gstin)]
        ),
        col(Brand.id).in_(req.ids) if req.ids else None,
        col(Brand.company_id).is_not(None) if req.has_company else None,
        (
            and_(col(Brand.gstin).is_not(None), col(Brand.gstin) != "")
            if req.has_gstin
            else None
        ),
        pitch_exists(col(Pitch.org_type).in_(req.org_types)) if req.org_types else None,
        (
            pitch_exists(col(Pitch.platform).overlap(req.platforms))
            if req.platforms
            else None
        ),
        pitch_count >= req.min_pitches if req.min_pitches is not None else None,
        campaign_count >= req.min_campaigns if req.min_campaigns is not None else None,
    ]
    stmnt = stmnt.where(*[f for f in filters if f is not None])

    sort = "name_asc" if req.sort == "relevance" and not tokens(req.text) else req.sort
    order = {
        "name_asc": col(Brand.display_name).asc(),
        "name_desc": col(Brand.display_name).desc(),
        "campaigns_desc": campaign_count.desc(),
        "pitches_desc": pitch_count.desc(),
        "recent_desc": latest.desc().nullslast(),
        "relevance": _starts_with(Brand.display_name, req.text),
    }.get(sort, col(Brand.display_name).asc())

    total, page, pages, results = await _page(session, stmnt, req, order, col(Brand.id))
    facts = await _brand_pitch_facts(session, [b.id for b, *_ in results])
    rows = [
        BrandRow(
            id=b.id,
            name=b.display_name,
            gstin=b.gstin,
            company=CompanyRef.of(c),
            pitch_count=pc,
            campaign_count=cc,
            creator_count=crc,
            org_types=sorted(facts[b.id][0]),
            platforms=sorted(facts[b.id][1]),
            latest_activity=la,
        )
        for b, c, pc, cc, crc, la in results
    ]
    return _response(t0, total, page, pages, req, rows)


async def campaigns(
    session: AsyncSession, req: CampaignSearchRequest
) -> SearchResponse[CampaignRow]:
    t0 = time.perf_counter()
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
    filters = [
        text_clause(
            req.text,
            [
                col(Campaign.campaign_code),
                col(Campaign.campaign_name),
                col(Campaign.manager),
                col(Brand.display_name),
                func.array_to_string(col(Campaign.member_names), " "),
            ],
        ),
        col(Campaign.status).in_(req.statuses) if req.statuses else None,
        (
            col(Campaign.report_status).in_(req.report_statuses)
            if req.report_statuses
            else None
        ),
        col(Campaign.month_name).in_(req.months) if req.months else None,
        col(Campaign.year).in_(req.years) if req.years else None,
        col(Campaign.manager).in_(req.managers) if req.managers else None,
        col(Campaign.brand_id).in_(req.brand_ids) if req.brand_ids else None,
        (
            col(Campaign.start_date) >= req.start_date_from
            if req.start_date_from
            else None
        ),
        col(Campaign.start_date) <= req.start_date_to if req.start_date_to else None,
    ]
    stmnt = stmnt.where(*[f for f in filters if f is not None])

    sort = "code_desc" if req.sort == "relevance" and not tokens(req.text) else req.sort
    order = {
        "start_date_desc": col(Campaign.start_date).desc().nullslast(),
        "start_date_asc": col(Campaign.start_date).asc().nullsfirst(),
        "code_desc": col(Campaign.campaign_code).desc(),
        "code_asc": col(Campaign.campaign_code).asc(),
        "creators_desc": creator_count.desc(),
        "relevance": _starts_with(Campaign.campaign_name, req.text),
    }.get(sort, col(Campaign.start_date).desc().nullslast())

    total, page, pages, results = await _page(
        session, stmnt, req, order, col(Campaign.id)
    )
    return _response(
        t0, total, page, pages, req, [CampaignRow.of(c, b, cc) for c, b, cc in results]
    )


async def pitches(
    session: AsyncSession, req: PitchSearchRequest
) -> SearchResponse[PitchRow]:
    t0 = time.perf_counter()
    creator_count = (
        select(func.count())
        .select_from(PitchCreatorLink)
        .where(col(PitchCreatorLink.pitch_id) == Pitch.id)
        .correlate(Pitch)
        .scalar_subquery()
    )
    converted = exists(
        select(Campaign.id).where(col(Campaign.pitch_id) == Pitch.id)
    ).correlate(Pitch)
    stmnt = select(
        Pitch, Brand, creator_count.label("creator_count"), converted.label("converted")
    ).join(Brand, col(Brand.id) == col(Pitch.brand_id), isouter=True)
    filters = [
        text_clause(
            req.text,
            [
                col(Pitch.pitch_code),
                col(Pitch.campaign_name),
                col(Pitch.sales_lead),
                col(Pitch.list_lead),
                col(Brand.display_name),
            ],
        ),
        col(Pitch.org_type).in_(req.org_types) if req.org_types else None,
        col(Pitch.requirement).in_(req.requirements) if req.requirements else None,
        col(Pitch.platform).overlap(req.platforms) if req.platforms else None,
        col(Pitch.sales_lead).in_(req.sales_leads) if req.sales_leads else None,
        col(Pitch.list_lead).in_(req.list_leads) if req.list_leads else None,
        col(Pitch.brand_id).in_(req.brand_ids) if req.brand_ids else None,
        (
            col(Pitch.created_at) >= datetime.combine(req.created_from, dtime.min)
            if req.created_from
            else None
        ),
        # inclusive of the whole end day -- created_at is a timestamp
        (
            col(Pitch.created_at) <= datetime.combine(req.created_to, dtime.max)
            if req.created_to
            else None
        ),
        {True: converted, False: ~converted}.get(req.converted),
    ]
    stmnt = stmnt.where(*[f for f in filters if f is not None])

    sort = "code_desc" if req.sort == "relevance" and not tokens(req.text) else req.sort
    order = {
        "created_desc": col(Pitch.created_at).desc(),
        "created_asc": col(Pitch.created_at).asc(),
        "code_desc": col(Pitch.pitch_code).desc(),
        "code_asc": col(Pitch.pitch_code).asc(),
        "creators_desc": creator_count.desc(),
        "relevance": _starts_with(Pitch.campaign_name, req.text),
    }.get(sort, col(Pitch.created_at).desc())

    total, page, pages, results = await _page(session, stmnt, req, order, col(Pitch.id))
    return _response(
        t0,
        total,
        page,
        pages,
        req,
        [PitchRow.of(p, b, cc, conv) for p, b, cc, conv in results],
    )


# === Facets ==============================================================================================================


async def _distinct(session: AsyncSession, column, where=None) -> list:
    stmnt = select(column).distinct().where(col(column).is_not(None)).order_by(column)
    if where is not None:
        stmnt = stmnt.where(where)
    return list((await session.exec(stmnt)).all())


async def _terms_by_use(session: AsyncSession, kind: str) -> list[str]:
    """Every term, most-used first (unused ones includes, at the end)"""
    link, term, fk = _TERMS[kind]
    usage = func.count(col(link.creator_id))
    stmnt = (
        select(term.name, usage)
        .join(link, col(fk) == col(term.id), isouter=True)
        .group_by(col(term.id), col(term.name))
        .order_by(usage.desc(), col(term.name))
    )
    return [name for name, _ in (await session.exec(stmnt)).all()]


async def _brand_refs(session: AsyncSession, stmnt) -> list[dict]:
    return [
        BrandRef(id=i, name=n).model_dump()
        for i, n in (await session.exec(stmnt)).all()
    ]


async def _count(session: AsyncSession, model) -> int:
    return (await session.exec(select(func.count()).select_from(model))).one()


async def facets_creators(session: AsyncSession) -> dict:
    usage = func.count(col(BrandCreatorLink.creator_id))
    return {
        "platforms": await _distinct(session, Creator.platform),
        "tiers": await _distinct(session, Creator.tier),
        "categories": await _terms_by_use(session, "category"),
        "languages": await _terms_by_use(session, "language"),
        "tags": await _terms_by_use(session, "tag"),
        "brands": await _brand_refs(
            session,
            select(Brand.id, Brand.display_name)
            .join(BrandCreatorLink, col(BrandCreatorLink.brand_id) == col(Brand.id))
            .group_by(col(Brand.id), col(Brand.display_name))
            .order_by(usage.desc(), col(Brand.display_name)),
        ),
        "cities": await _distinct(session, Creator.city),
        "states": await _distinct(session, Creator.state),
        "regions": await _distinct(session, Creator.region),
        "genders": await _distinct(session, Creator.gender),
        "total_creators": await _count(session, Creator),
    }


async def _pitch_platforms(session: AsyncSession, where=None) -> list:
    stmnt = select(Pitch.platform)
    if where is not None:
        stmnt = stmnt.where(where)
    found = set()
    for arr in (await session.exec(stmnt)).all():
        found.update(arr or [])
    return sorted(found)


async def facets_campaigns(session: AsyncSession) -> dict:
    return {
        "statuses": await _distinct(session, Campaign.status),
        "report_statuses": await _distinct(session, Campaign.report_status),
        "months": await _distinct(session, Campaign.month_name),
        "years": sorted(await _distinct(session, Campaign.year), reverse=True),
        "managers": await _distinct(session, Campaign.manager),
        "brands": await _brand_refs(
            session,
            select(Brand.id, Brand.display_name)
            .join(Campaign, col(Campaign.brand_id) == col(Brand.id))
            .distinct()
            .order_by(Brand.display_name),
        ),
        "total_campaigns": await _count(session, Campaign),
    }


async def facets_brands(session: AsyncSession) -> dict:
    has_brand = col(Pitch.brand_id).is_not(None)
    return {
        "org_types": await _distinct(session, Pitch.org_type, where=has_brand),
        "platforms": await _pitch_platforms(session, where=has_brand),
        "total_brands": await _count(session, Brand),
    }


async def facets_pitches(session: AsyncSession) -> dict:
    return {
        "org_types": await _distinct(session, Pitch.org_type),
        "requirements": await _distinct(session, Pitch.requirement),
        "platforms": await _pitch_platforms(session),
        "sales_leads": await _distinct(session, Pitch.sales_lead),
        "list_leads": await _distinct(session, Pitch.list_lead),
        "brands": await _brand_refs(
            session,
            select(Brand.id, Brand.display_name)
            .join(Pitch, col(Pitch.brand_id) == col(Brand.id))
            .distinct()
            .order_by(Brand.display_name),
        ),
        "total_pitches": await _count(session, Pitch),
    }


# === Global search and suggestions ================================================================================================


async def creators_by_username(
    session: AsyncSession,
    username: str,
    platform: Optional[PlatformChoices],
    limit: int,
) -> tuple[int, list[CreatorRow]]:
    """Exact handle match (ingest lowercases every handle, so this is an index hit).
    The same handle can exist on two platforms, so platform narrows, not requires."""
    stmnt = select(Creator).where(col(Creator.username) == username)
    if platform is not None:
        stmnt = stmnt.where(col(Creator.platform) == platform)
    total = (
        await session.exec(select(func.count()).select_from(stmnt.subquery()))
    ).one()
    rows = (
        await session.exec(
            stmnt.order_by(col(Creator.followers).desc().nullslast()).limit(limit)
        )
    ).all()
    return total, await creator_rows(session, rows)


def _envelope(
    q: str, t0: float, groups: dict[str, tuple[int, list]], profile_link=None
) -> dict:
    return {
        "query": q,
        "took_ms": int((time.perf_counter() - t0) * 1000),
        "profile_link": profile_link,
        "groups": {
            name: {"total": total, "items": items}
            for name, (total, items) in groups.items()
        },
    }


async def global_search(sf: SessionFactory, q: str, limit: int) -> dict:
    t0 = time.perf_counter()
    empty = {"brands": (0, []), "campaigns": (0, []), "pitches": (0, [])}

    # a pasted profile URL answers "who is this handle?" -- fanning a whole URL
    # out to brand and campaign names would only produce noise.
    if looks_like_link(q):
        link = parse_profile_link(q)
        total, items = 0, []
        if link.username:  # an unreadable link gets no fuzzy fallback
            async with sf() as session:
                total, items = await creators_by_username(
                    session, link.username, link.platform, limit
                )
        payload = {
            "detected": True,
            "platform": link.platform.value if link.platform else None,
            "username": link.username,
        }
        groups = {
            "creators": (total, [r.model_dump(mode="json") for r in items]),
            **empty,
        }
        return _envelope(q, t0, groups, profile_link=payload)

    async def run(search: Callable, req: Paging) -> SearchResponse:
        async with sf() as session:  # one session each: a shared one would serialise them
            return await search(session, req)

    common = {"text": q, "page": 1, "page_size": limit, "sort": "relevance"}
    results = await asyncio.gather(
        run(creators, CreatorSearchRequest(**common)),
        run(brands, BrandSearchRequest(**common)),
        run(campaigns, CampaignSearchRequest(**common)),
        run(pitches, PitchSearchRequest(**common)),
    )
    names = ("creators", "brands", "campaigns", "pitches")
    return _envelope(
        q,
        t0,
        {
            n: (r.total, [row.model_dump(mode="json") for row in r.rows])
            for n, r in zip(names, results)
        },
    )


def _suggestion(kind: str, id_: Any, label: str, sublabel: Optional[str]) -> dict:
    return {"type": kind, "id": str(id_), "label": label, "sublabel": sublabel}


async def suggest(session: AsyncSession, q: str, limit: int) -> dict:
    if looks_like_link(q):
        link = parse_profile_link(q)
        rows = (
            (await creators_by_username(session, link.username, link.platform, limit))[
                1
            ]
            if link.username
            else []
        )
        return {
            "query": q,
            "suggestions": [
                _suggestion(
                    "creators", c.id, c.name, f"@{c.username} · {c.platform.value}"
                )
                for c in rows
            ],
        }

    prefix, per = f"{q.strip()}%", max(1, limit // 4)
    out: list[dict] = []

    stmnt = (
        select(Creator)
        .where(
            col(Creator.is_active),
            or_(col(Creator.name).ilike(prefix), col(Creator.username).ilike(prefix)),
        )
        .order_by(col(Creator.followers).desc().nullslast())
        .limit(per)
    )
    out += [
        _suggestion("creators", c.id, c.name, f"@{c.username} · {c.platform.value}")
        for c in (await session.exec(stmnt)).all()
    ]

    stmnt = (
        select(Brand)
        .where(col(Brand.display_name).ilike(prefix))
        .order_by(Brand.display_name)
        .limit(per)
    )
    out += [
        _suggestion("brands", b.id, b.display_name, None)
        for b in (await session.exec(stmnt)).all()
    ]

    stmnt = (
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
    out += [
        _suggestion(
            "campaigns",
            c.id,
            c.campaign_name,
            c.campaign_code + (f" · {bn}" if bn else ""),
        )
        for c, bn in (await session.exec(stmnt)).all()
    ]

    stmnt = (
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
    out += [
        _suggestion(
            "pitches", p.id, p.campaign_name, p.pitch_code + (f" · {bn}" if bn else "")
        )
        for p, bn in (await session.exec(stmnt)).all()
    ]
    return {"query": q, "suggestions": out[:limit]}
