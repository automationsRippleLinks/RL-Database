from datetime import date, datetime
from uuid import UUID
from typing import Optional, Any
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.schemas.search import (
    CompanyRef,
    BrandRef,
    CreatorRow,
    CampaignRow,
    PitchRow,
    BrandRow,
)
from app.models.enums import (
    PlatformChoices,
    MonthChoices,
    CampaignStatusChoices,
    TierChoices,
)
from app.models.link_models import PitchCreatorLinkBase, CampaignCreatorLinkBase

# === a creator's own page =====================================================================================


class CreatorPitchSummary(BaseModel):
    pitch_id: UUID
    pitch_code: str
    brand: Optional[BrandRef] = None
    campaign_name: str
    platform: list[PlatformChoices] = []
    final_cost: Optional[int] = None
    brand_cost: Optional[int] = None


class CreatorCampaignSummary(BaseModel):
    campaign_id: UUID
    campaign_code: str
    campaign_name: str
    brand: Optional[BrandRef] = None
    month_name: MonthChoices
    year: int
    status: CampaignStatusChoices
    is_dropped: bool
    live_date: Optional[date] = None
    final_cost: Optional[int] = None
    views: Optional[int] = None
    cpv: Optional[Decimal] = None


class PackageItem(BaseModel):
    deliverable_type: str
    quantity: int = 1
    price: int = 0


class CreatorPackage(BaseModel):
    id: UUID
    name: str
    cost: int
    valid_from: datetime
    items: list[PackageItem] = []


class CreatorDetail(CreatorRow):
    bio: Optional[str] = None
    tags: list[str] = []
    brands: list[BrandRef] = []
    stats_refreshed_at: Optional[datetime] = None
    package: Optional[CreatorPackage] = None
    pitches: list[CreatorPitchSummary] = []
    campaigns: list[CreatorCampaignSummary] = []


# === creators on a pitch / campaign ========================================================================


class _CreatorOnLink(BaseModel):
    creator_id: UUID
    name: str
    username: str
    platform: PlatformChoices
    tier: TierChoices
    followers: Optional[int] = None

    @classmethod
    def of(cls, link: Any, creator: Any):
        keys = {"creator_id", "pitch_id", "campaign_id"}
        return cls(
            **link.model_dump(exclude=keys),
            creator_id=creator.id,
            name=creator.name,
            username=creator.username,
            platform=creator.platform,
            tier=creator.tier,
            followers=creator.followers,
        )


class PitchCreatorRow(_CreatorOnLink, PitchCreatorLinkBase):
    pass


class CampaignCreatorRow(_CreatorOnLink, CampaignCreatorLinkBase):
    model_config = ConfigDict(ser_json_timedelta="float") # watch times as seconds


class CampaignTotals(BaseModel):
    creator_count: int = 0
    dropped_count: int = 0
    total_final_cost: Optional[int] = None
    total_brand_cost: Optional[int] = None
    total_views: Optional[int] = None
    avg_cpv: Optional[Decimal] = None


class PitchRef(BaseModel):
    id: UUID
    pitch_code: str
    brand: Optional[BrandRef] = None


class CampaignDetail(CampaignRow):
    pitch: Optional[PitchRef] = None
    creators: list[CampaignCreatorRow] = []
    totals: CampaignTotals = CampaignTotals()


class CampaignRef(BaseModel):
    id: UUID
    campaign_code: str
    campaign_name: str


class PitchTotals(BaseModel):
    creator_count: int = 0
    total_final_cost: Optional[int] = None
    total_brand_cost: Optional[int] = None


class PitchDetail(PitchRow):
    campaign: Optional[CampaignRef] = None
    company: Optional[CompanyRef] = None
    creators: list[PitchCreatorRow] = []
    totals: PitchTotals = PitchTotals()


class BrandDetail(BrandRow):
    total_brand_cost: Optional[int] = None
    campaigns: list[CampaignRow] = []
    pitches: list[PitchRow] = []
    top_creators: list[CreatorRow] = []
