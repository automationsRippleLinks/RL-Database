"""One page per record: creator, campaign, pitch, brand."""

from uuid import UUID
from typing import Optional
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select, col

from app.core.config import settings
from app.api.deps import SessionDep, CurrentUser
from app.services import search
from app.models import *
from app.models.enums import PlatformChoices
from app.schemas.search import (
    CampaignRow,
    PitchRow,
    BrandRef,
    CompanyRef,
    CampaignSearchRequest,
    PitchSearchRequest,
    BrandSearchRequest,
)
from app.schemas.detail import (
    CreatorDetail,
    CreatorPitchSummary,
    CreatorCampaignSummary,
    CampaignRef,
    CampaignDetail,
    PitchRef,
    CampaignCreatorRow,
    CampaignTotals,
    PitchDetail,
    PitchCreatorRow,
    PitchTotals,
    BrandDetail,
)

router = APIRouter()


def _views(platform: PlatformChoices, link: CampaignCreatorLink) -> Optional[int]:
    """The creator row's views column for its platform; None for other platforms."""

    return {
        PlatformChoices.INSTAGRAM: link.ig_reel_views,
        PlatformChoices.YOUTUBE: link.yt_views,
    }.get(platform)


async def _get_or_404(session, model, id_, label: str):
    """Row by primary key, or 404 "<label> not found"."""

    row = await session.get(model, id_)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} not found"
        )
    return row


def _sum(values) -> Optional[int]:
    """Sum ignoring Nones; None (not 0) when there is nothing to add up."""

    vals = [v for v in values if v is not None]
    return sum(vals) if vals else None


@router.get("/creators/{creator_id}", response_model=CreatorDetail)
async def creator_detail(creator_id: UUID, session: SessionDep, user: CurrentUser):
    """Creator page: the search row (with its latest cost and when it's from), tags, brands and
    every pitch and campaign they were on (newest first)."""
    creator = (
        await session.exec(
            select(Creator)
            .where(Creator.id == creator_id)
        )
    ).first()

    if creator is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Creator not found"
        )

    # same builder as the search table, so latest cost and cpv match it exactly
    row = (await search.creator_rows(session, [creator]))[0]
    tags = (await search.terms_for(session, [creator_id], "tag")).get(creator_id, [])
    brands = (
        await session.exec(
            select(Brand)
            .join(
                BrandCreatorLink,
                col(BrandCreatorLink.brand_id) == col(Brand.id),
            )
            .where(col(BrandCreatorLink.creator_id) == creator_id)
            .order_by(Brand.display_name)
        )
    ).all()
    pitch_rows = (
        await session.exec(
            select(PitchCreatorLink, Pitch, Brand)
            .join(
                Pitch,
                col(Pitch.id) == col(PitchCreatorLink.pitch_id),
            )
            .join(Brand, col(Brand.id) == col(Pitch.brand_id), isouter=True)
            .where(col(PitchCreatorLink.creator_id) == creator_id)
            .order_by(col(Pitch.created_at).desc())
        )
    ).all()
    campaign_rows = (
        await session.exec(
            select(CampaignCreatorLink, Campaign, Brand)
            .join(
                Campaign,
                col(Campaign.id) == col(CampaignCreatorLink.campaign_id),
            )
            .join(Brand, col(Brand.id) == col(Campaign.brand_id), isouter=True)
            .where(col(CampaignCreatorLink.creator_id) == creator_id)
            .order_by(col(Campaign.start_date).desc().nullslast())
        )
    ).all()

    return CreatorDetail(
        **row.model_dump(exclude={"profile_url", "cpv"}),
        bio=creator.bio,
        tags=tags,
        brands=[BrandRef.of(b) for b in brands],
        stats_refreshed_at=creator.stats_refreshed_at,
        pitches=[
            CreatorPitchSummary(
                pitch_id=p.id,
                pitch_code=p.pitch_code,
                brand=BrandRef.of(b),
                campaign_name=p.campaign_name,
                platform=p.platform or [],
                final_cost=link.final_cost,
                brand_cost=link.brand_cost,
            )
            for link, p, b in pitch_rows
        ],
        campaigns=[
            CreatorCampaignSummary(
                campaign_id=c.id,
                campaign_code=c.campaign_code,
                campaign_name=c.campaign_name,
                brand=BrandRef.of(b),
                month_name=c.month_name,
                year=c.year,
                status=c.status,
                is_dropped=link.is_dropped,
                live_date=link.live_date,
                final_cost=link.final_cost,
                views=_views(creator.platform, link),
                cpv=link.cpv,
            )
            for link, c, b in campaign_rows
        ],
    )


@router.get("/campaigns/{campaign_id}", response_model=CampaignDetail)
async def campaign_detail(campaign_id: UUID, session: SessionDep, user: CurrentUser):
    """Campaign page: the campaign, its pitch, all creator rows and the totals.
    
        Cost, view and CPV totals leave out dropped creator rows; the counts don't.
    """

    campaign: Campaign = await _get_or_404(session, Campaign, campaign_id, "Campaign")
    brand = await session.get(Brand, campaign.brand_id) if campaign.brand_id else None

    pitch_ref = None
    pitch = await session.get(Pitch, campaign.pitch_id) if campaign.pitch_id else None
    if pitch:
        pitch_brand = (
            await session.get(Brand, pitch.brand_id) if pitch.brand_id else None
        )
        pitch_ref = PitchRef(
            id=pitch.id, pitch_code=pitch.pitch_code, brand=BrandRef.of(pitch_brand)
        )

    links = (
        await session.exec(
            select(CampaignCreatorLink, Creator)
            .join(Creator, col(Creator.id) == col(CampaignCreatorLink.creator_id))
            .where(col(CampaignCreatorLink.campaign_id) == campaign_id)
            .order_by(col(Creator.followers).desc().nullslast())
        )
    ).all()
    live = [(lnk, cr) for lnk, cr in links if not lnk.is_dropped]
    cpvs = [lnk.cpv for lnk, _ in live if lnk.cpv is not None]

    return CampaignDetail(
        **CampaignRow.of(campaign, brand, len(links)).model_dump(),
        pitch=pitch_ref,
        creators=[CampaignCreatorRow.of(link, cr) for link, cr in links],
        totals=CampaignTotals(
            creator_count=len(links),
            dropped_count=len(links) - len(live),
            total_final_cost=_sum(link.final_cost for link, _ in live),
            total_brand_cost=_sum(link.brand_cost for link, _ in live),
            total_views=_sum(_views(cr.platform, link) for link, cr in live),
            # plain mean of each row's CPV, not total cost / total views
            avg_cpv=(sum(cpvs) / len(cpvs)).quantize(Decimal("0.01")) if cpvs else None,
        ),
    )


@router.get("/pitches/{pitch_id}", response_model=PitchDetail)
async def pitch_detail(pitch_id: UUID, session: SessionDep, user: CurrentUser):
    """Pitch page: the pitch, its brand's company, the campaign it became (if any),
        its creator rows and their cost totals."""

    pitch: Pitch = await _get_or_404(session, Pitch, pitch_id, "Pitch")
    brand = await session.get(Brand, pitch.brand_id) if pitch.brand_id else None
    company = (
        await session.get(Company, brand.company_id)
        if brand and brand.company_id
        else None
    )
    campaign = (
        await session.exec(select(Campaign).where(col(Campaign.pitch_id) == pitch_id))
    ).first()

    links = (
        await session.exec(
            select(PitchCreatorLink, Creator)
            .join(Creator, col(Creator.id) == col(PitchCreatorLink.creator_id))
            .where(col(PitchCreatorLink.pitch_id) == pitch_id)
            .order_by(col(Creator.followers).desc().nullslast())
        )
    ).all()

    return PitchDetail(
        **PitchRow.of(
            pitch, brand, len(links), converted=campaign is not None
        ).model_dump(),
        campaign=(
            CampaignRef(
                id=campaign.id,
                campaign_code=campaign.campaign_code,
                campaign_name=campaign.campaign_name,
            )
            if campaign
            else None
        ),
        company=CompanyRef.of(company),
        creators=[PitchCreatorRow.of(link, cr) for link, cr in links],
        totals=PitchTotals(
            creator_count=len(links),
            total_final_cost=_sum(lnk.final_cost for lnk, _ in links),
            total_brand_cost=_sum(lnk.brand_cost for lnk, _ in links),
        ),
    )


@router.get("/brands/{brand_id}", response_model=BrandDetail)
async def brand_detail(brand_id: int, session: SessionDep, user: CurrentUser):
    """Brand page: its list-row counts, recent campaigns and pitches, and top creators.
    
        Top creators are ranked by summed final cost across the brand's campaigns.
    """

    await _get_or_404(session, Brand, brand_id, "Brand")

    limit = settings.BRAND_DETAIL_LIMIT
    campaigns = await search.campaigns(
        session,
        CampaignSearchRequest(
            brand_ids=[brand_id],
            page_size=limit,
            sort="start_date_desc",
        ),
    )
    pitches = await search.pitches(
        session,
        PitchSearchRequest(
            brand_ids=[brand_id],
            page_size=limit,
            sort="created_desc",
        ),
    )
    # the same counts the brand list shows, not a second calculation of them
    row = (
        await search.brands(session, BrandSearchRequest(ids=[brand_id], page_size=1))
    ).rows[0]

    # Top creators by what the brand spent on them (dropped links excluded).
    spend_rows = (
        await session.exec(
            select(CampaignCreatorLink, Creator)
            .join(Creator, col(Creator.id) == col(CampaignCreatorLink.creator_id))
            .join(Campaign, col(Campaign.id) == col(CampaignCreatorLink.campaign_id))
            .where(
                col(Campaign.brand_id) == brand_id,
                col(CampaignCreatorLink.is_dropped).is_(False),
            )
        )
    ).all()
    spend: dict[UUID, int] = {}
    by_id: dict[UUID, Creator] = {}
    for link, cr in spend_rows:
        by_id[cr.id] = cr
        spend[cr.id] = spend.get(cr.id, 0) + (link.final_cost or 0)
    top = sorted(spend, key=lambda cid: spend[cid], reverse=True)[
        : settings.TOP_CREATORS_LIMIT
    ]

    return BrandDetail(
        **row.model_dump(),
        total_brand_cost=_sum(link.brand_cost for link, _ in spend_rows),
        campaigns=campaigns.rows,
        pitches=pitches.rows,
        top_creators=await search.creator_rows(session, [by_id[cid] for cid in top]),
    )
