"""Detail pages. Link rows reuse the links tables' own columns, so a column added to
PitchCreatorBase / CampaignCreatorBase shows up here with no second edit.
"""

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
    """A pitch on a creator's page, with that creator's cost on it."""

    pitch_id: UUID
    pitch_code: str
    brand: Optional[BrandRef] = None
    campaign_name: str
    platform: list[PlatformChoices] = []
    final_cost: Optional[int] = None
    brand_cost: Optional[int] = None


class CreatorCampaignSummary(BaseModel):
    """A campaign on a creator's page, with that creator's cost and results on it.

    `views` is reel views on Instagram, video views on YouTube, None elsewhere.
    """

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


class CreatorDetail(CreatorRow):
    """A creator's page: the search row plus bio, tags, brands, and history."""

    bio: Optional[str] = None
    tags: list[str] = []
    brands: list[BrandRef] = []
    stats_refreshed_at: Optional[datetime] = None
    pitches: list[CreatorPitchSummary] = []
    campaigns: list[CreatorCampaignSummary] = []


# === creators on a pitch / campaign ========================================================================


class _CreatorOnLink(BaseModel):
    """Who the creator is, shown beside each pitch or campaign link row."""

    creator_id: UUID
    name: str
    username: str
    platform: PlatformChoices
    tier: TierChoices
    followers: Optional[int] = None

    @classmethod
    def of(cls, link: Any, creator: Any):
        """The link row's own columns (minus its keys) plus the creator's details."""
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
    """A creator row on a pitch page."""

    pass


class CampaignCreatorRow(_CreatorOnLink, CampaignCreatorLinkBase):
    """A creator row on a campaign page, dropped ones included."""

    model_config = ConfigDict(ser_json_timedelta="float")  # watch times as seconds


class CampaignTotals(BaseModel):
    """Campaign page totals; the sums and average CPV leave dropped creators out."""

    creator_count: int = 0
    dropped_count: int = 0
    total_final_cost: Optional[int] = None
    total_brand_cost: Optional[int] = None
    total_views: Optional[int] = None
    avg_cpv: Optional[Decimal] = None


class PitchRef(BaseModel):
    """The pitch a campaign was made from."""

    id: UUID
    pitch_code: str
    brand: Optional[BrandRef] = None


class CampaignDetail(CampaignRow):
    """A campaign's page: its search row, source pitch, creators and totals."""

    pitch: Optional[PitchRef] = None
    creators: list[CampaignCreatorRow] = []
    totals: CampaignTotals = CampaignTotals()


class CampaignRef(BaseModel):
    """The campaign a pitch turned into."""

    id: UUID
    campaign_code: str
    campaign_name: str


class PitchTotals(BaseModel):
    """Pitch page totals over every creator on it."""

    creator_count: int = 0
    total_final_cost: Optional[int] = None
    total_brand_cost: Optional[int] = None


class PitchDetail(PitchRow):
    """A pitch's page: its search row, campaign, company, creators and totals."""

    campaign: Optional[CampaignRef] = None
    company: Optional[CompanyRef] = None
    creators: list[PitchCreatorRow] = []
    totals: PitchTotals = PitchTotals()


class BrandDetail(BrandRow):
    """A brand's page: its search row plus recent campaigns, pitches, top creators.

    Top creators are ranked by final cost across the brand's campaigns. Dropped
    creator rows count neither there nor in `total_brand_cost`.
    """

    total_brand_cost: Optional[int] = None
    campaigns: list[CampaignRow] = []
    pitches: list[PitchRow] = []
    top_creators: list[CreatorRow] = []
