from uuid import UUID
from typing import Optional
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select, col, func
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.api.deps import SessionDep, CurrentUser
from app.api.v1.search import search_campaigns, search_pitches, _tags_for_creators, _convert_to_link
from app.models import *
from app.models.enums import PlatformChoices
from app.schemas.search import (
    CreatorRow,
    CampaignRow,
    PitchRow,
    BrandRef,
    CompanyRef,
    CampaignSearchRequest,
    PitchSearchRequest,
)
from app.schemas.detail import (
    CreatorPackage,
    CreatorPackageItem,
    CreatorDetail,
    CreatorPitchSummary,
    CreatorCampaignSummary,
    CampaignDetail,
    PitchRef,
    CampaignCreatorRow,
    CampaignTotals,
    PitchDetail,
    PitchCreatorRow,
    CampaignRefLite,
    PitchTotals,
    BrandDetail,
)

router = APIRouter()


def _views_for(platform: PlatformChoices, link: CampaignCreatorLink) -> Optional[int]:
    if platform == PlatformChoices.INSTAGRAM:
        return link.ig_reel_views
    if platform == PlatformChoices.YOUTUBE:
        return link.yt_views
    return None


def _brand_ref(brand: Optional[Brand]) -> Optional[BrandRef]:
    return BrandRef(id=brand.id, name=brand.display_name) if brand else None


def _sum(values) -> Optional[int]:
    vals = [v for v in values if v is not None]
    return sum(vals) if vals else None


STANDARD_PACKAGE = "standard"


def _package_for(creator: Creator) -> Optional[CreatorPackage]:
    live = sorted(
        (
            p
            for p in creator.commercial_packages
            if p.valid_to is None and p.name.strip().lower() == STANDARD_PACKAGE
        ),
        key=lambda p: p.valid_from,
        reverse=True,
    )
    if not live:
        return None

    p = live[0]
    return CreatorPackage(
        id=p.id,
        name=p.name,
        cost=p.cost,
        valid_from=p.valid_from,
        items=[
            CreatorPackageItem(
                deliverable_type=d.deliverable_type,
                quantity=d.quantity,
                price=d.price,
            )
            for d in sorted(p.deliverables, key=lambda d: d.deliverable_type)
        ],
    )


@router.get("/creators/{creator_id}", response_model=CreatorDetail)
async def creator_detail(creator_id: UUID, session: SessionDep, user: CurrentUser):
    # creator = await session.get(Creator, creator_id)
    creator = (
        await session.exec(
            select(Creator)
            .where(Creator.id == creator_id)
            .options(
                selectinload(Creator.commercial_packages).selectinload(
                    CommercialPackage.deliverables
                )
            )
        )
    ).first()

    if creator is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Creator not found"
        )

    categories = (
        await session.exec(
            select(Category.name)
            .join(
                CategoryCreatorLink,
                col(CategoryCreatorLink.category_id) == col(Category.id),
            )
            .where(col(CategoryCreatorLink.creator_id) == creator_id)
            .order_by(Category.name)
        )
    ).all()

    languages = (
        await session.exec(
            select(Language.name)
            .join(
                LanguageCreatorLink,
                col(LanguageCreatorLink.language_id) == col(Language.id),
            )
            .where(col(LanguageCreatorLink.creator_id) == creator_id)
            .order_by(Language.name)
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
        **CreatorRow.from_creator(
            creator, categories=list(categories), languages=list(languages)
        ).model_dump(),
        package=_package_for(creator),
        pitches=[
            CreatorPitchSummary(
                pitch_id=p.id,
                pitch_code=p.pitch_code,
                brand=_brand_ref(b),
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
                brand=_brand_ref(b),
                month_name=c.month_name,
                year=c.year,
                status=c.status,
                is_dropped=link.is_dropped,
                live_date=link.live_date,
                final_cost=link.final_cost,
                views=_views_for(creator.platform, link),
                cpv=link.cpv,
            )
            for link, c, b in campaign_rows
        ],
    )


@router.get("/campaigns/{campaign_id}", response_model=CampaignDetail)
async def campaign_detail(campaign_id: UUID, session: SessionDep, user: CurrentUser):
    campaign = await session.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found"
        )

    brand = await session.get(Brand, campaign.brand_id) if campaign.brand_id else None

    pitch_ref = None
    if campaign.pitch_id:
        pitch = await session.get(Pitch, campaign.pitch_id)
        if pitch:
            pb = await session.get(Brand, pitch.brand_id) if pitch.brand_id else None
            pitch_ref = PitchRef(
                id=pitch.id, pitch_code=pitch.pitch_code, brand=_brand_ref(pb)
            )

    links = (
        await session.exec(
            select(CampaignCreatorLink, Creator)
            .join(Creator, col(Creator.id) == col(CampaignCreatorLink.creator_id))
            .where(col(CampaignCreatorLink.campaign_id) == campaign_id)
            .order_by(col(Creator.followers).desc().nullslast())
        )
    ).all()

    creators = [
        CampaignCreatorRow(
            creator_id=cr.id,
            name=cr.name,
            username=cr.username,
            platform=cr.platform,
            tier=cr.tier,
            followers=cr.followers,
            **{
                f: getattr(lnk, f)
                for f in CampaignCreatorRow.model_fields
                if f
                not in {
                    "creator_id",
                    "name",
                    "username",
                    "platform",
                    "tier",
                    "followers",
                }  # got these from creator entry
            },
        )
        for lnk, cr in links
    ]

    live = [(lnk, cr) for lnk, cr in links if not lnk.is_dropped]
    cpvs = [lnk.cpv for lnk, _ in live if lnk.cpv is not None]

    totals = CampaignTotals(
        creator_count=len(links),
        dropped_count=len(links) - len(live),
        total_final_cost=_sum(lnk.final_cost for lnk, _ in live),
        total_brand_cost=_sum(lnk.brand_cost for lnk, _ in live),
        total_views=_sum(_views_for(cr.platform, lnk) for lnk, cr in live),
        avg_cpv=(sum(cpvs) / len(cpvs)).quantize(Decimal("0.01")) if cpvs else None,
    )

    return CampaignDetail(
        **CampaignRow(
            id=campaign.id,
            campaign_code=campaign.campaign_code,
            campaign_name=campaign.campaign_name,
            brand=_brand_ref(brand),
            manager=campaign.manager,
            member_names=campaign.member_names or [],
            month_name=campaign.month_name,
            year=campaign.year,
            status=campaign.status,
            report_status=campaign.report_status,
            start_date=campaign.start_date,
            expected_end_date=campaign.expected_end_date,
            end_date=campaign.end_date,
            report_completion_date=campaign.report_completion_date,
            creator_count=len(links),
            spreadsheet_link=_convert_to_link(campaign.spreadsheet_id),
            report_link=_convert_to_link(campaign.report_id),
        ).model_dump(),
        pitch=pitch_ref,
        creators=creators,
        totals=totals,
    )


@router.get("/pitches/{pitch_id}", response_model=PitchDetail)
async def pitch_detail(pitch_id: UUID, session: SessionDep, user: CurrentUser):
    pitch = await session.get(Pitch, pitch_id)
    if pitch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pitch not found"
        )

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

    creators = [
        PitchCreatorRow(
            creator_id=cr.id,
            name=cr.name,
            username=cr.username,
            platform=cr.platform,
            tier=cr.tier,
            followers=cr.followers,
            **{
                f: getattr(lnk, f)
                for f in PitchCreatorRow.model_fields
                if f
                not in {
                    "creator_id",
                    "name",
                    "username",
                    "platform",
                    "tier",
                    "followers",
                }
            },
        )
        for lnk, cr in links
    ]
    return PitchDetail(
        **PitchRow(
            id=pitch.id,
            pitch_code=pitch.pitch_code,
            brand=_brand_ref(brand),
            campaign_name=pitch.campaign_name,
            org_type=pitch.org_type,
            requirement=pitch.requirement,
            platform=pitch.platform or [],
            sales_lead=pitch.sales_lead,
            list_lead=pitch.list_lead,
            creator_count=len(links),
            converted=campaign is not None,
            spreadsheet_link=_convert_to_link(pitch.spreadsheet_id),
            created_at=pitch.created_at,
            updated_at=pitch.updated_at,
        ).model_dump(),
        campaign=(
            CampaignRefLite(
                id=campaign.id,
                campaign_code=campaign.campaign_code,
                campaign_name=campaign.campaign_name,
            )
            if campaign
            else None
        ),
        company=(
            CompanyRef(id=company.id, name=company.name, gstin=company.gstin)
            if company
            else None
        ),
        creators=creators,
        totals=PitchTotals(
            creator_count=len(links),
            total_final_cost=_sum(lnk.final_cost for lnk, _ in links),
            total_brand_cost=_sum(lnk.brand_cost for lnk, _ in links),
        ),
    )


@router.get("/brands/{brand_id}", response_model=BrandDetail)
async def brand_detail(brand_id: int, session: SessionDep, user: CurrentUser):
    brand = await session.get(Brand, brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found"
        )

    company = await session.get(Company, brand.company_id) if brand.company_id else None

    campaigns = await search_campaigns(
        CampaignSearchRequest(
            brand_ids=[brand_id],
            page=1,
            page_size=settings.BRAND_DETAIL_LIMIT,
            sort="start_date_desc",
        ),
        session,
        user,
    )

    pitches = await search_pitches(
        PitchSearchRequest(
            brand_ids=[brand_id],
            page=1,
            page_size=settings.BRAND_DETAIL_LIMIT,
            sort="created_desc",
        ),
        session,
        user,
    )

    org_types, platforms = set(), set()
    for org_type, plats in (
        await session.exec(
            select(Pitch.org_type, Pitch.platform).where(
                col(Pitch.brand_id) == brand_id
            )
        )
    ).all():
        org_types.add(org_type)
        platforms.update(plats or [])

    latest_campaign = (
        await session.exec(
            select(func.max(Campaign.start_date)).where(
                col(Campaign.brand_id) == brand_id
            )
        )
    ).one()
    latest_pitch = (
        await session.exec(
            select(func.max(func.date(Pitch.created_at))).where(
                col(Pitch.brand_id) == brand_id
            )
        )
    ).one()
    latest_activity = max(
        [d for d in (latest_campaign, latest_pitch) if d is not None], default=None
    )

    campaign_links = (
        await session.exec(
            select(CampaignCreatorLink, Creator)
            .join(Creator, col(Creator.id) == col(CampaignCreatorLink.creator_id))
            .join(Campaign, col(Campaign.id) == col(CampaignCreatorLink.campaign_id))
            .where(
                col(Campaign.brand_id) == brand_id,
                col(CampaignCreatorLink.is_dropped) == False,
            )
        )
    ).all()

    pitch_link_creators = (
        await session.exec(
            select(PitchCreatorLink.creator_id)
            .join(Pitch, col(Pitch.id) == col(PitchCreatorLink.pitch_id))
            .where(col(Pitch.brand_id) == brand_id)
        )
    ).all()

    spend = dict()
    creators_by_id = dict()
    for lnk, cr in campaign_links:
        creators_by_id[cr.id] = cr
        spend[cr.id] = spend.get(cr.id, 0) + (
            lnk.final_cost or 0
        )  # highest spend. ALT: spend[cr.id] = spend.get(cr.id, 0) + 1

    top_ids = sorted(spend, key=lambda cid: spend[cid], reverse=True)[
        : settings.TOP_CREATORS_LIMIT
    ]
    top_cats, top_langs = await _tags_for_creators(session, top_ids)

    return BrandDetail(
        id=brand.id,
        name=brand.display_name,
        gstin=brand.gstin,
        company=(
            CompanyRef(id=company.id, name=company.name, gstin=company.gstin)
            if company
            else None
        ),
        pitch_count=pitches.total,
        campaign_count=campaigns.total,
        creator_count=len(
            {cr.id for _, cr in campaign_links} | set(pitch_link_creators)
        ),
        org_types=sorted(org_types),
        platforms=sorted(platforms),
        latest_activity=latest_activity,
        total_brand_cost=_sum(lnk.brand_cost for lnk, _ in campaign_links),
        campaigns=campaigns.rows,
        pitches=pitches.rows,
        # from_creator, not model_validate: the latter walks every field on the
        # model, and touching the lazy `categories` relationship inside an async
        # session raises MissingGreenlet for any brand with campaign creators.
        top_creators=[
            CreatorRow.from_creator(
                creators_by_id[cid],
                categories=top_cats.get(cid, []),
                languages=top_langs.get(cid, []),
            )
            for cid in top_ids
        ],
    )
