from datetime import timedelta, date
from uuid import UUID
from typing import Optional
from decimal import Decimal

from pydantic import BaseModel, field_serializer

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


class _Seconds(BaseModel):

    @field_serializer("*", when_used="json", check_fields=False)
    def _td(self, v):
        return v.total_seconds() if isinstance(v, timedelta) else v


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
    views: Optional[int] = None
    cpv: Optional[Decimal] = None


class CreatorDetail(CreatorRow):
    additional_emails: list[str] = []
    additional_phones: list[str] = []
    pitches: list[CreatorPitchSummary] = []
    campaigns: list[CreatorCampaignSummary] = []


class CampaignCreatorRow(_Seconds):
    creator_id: UUID
    name: str
    username: str
    platform: PlatformChoices
    tier: TierChoices
    followers: Optional[int] = None
    is_dropped: bool
    deliverables_raw: str
    expected_views: Optional[int] = None
    poc_name: list[str] = []
    initial_cost: Optional[int] = None
    final_cost: Optional[int] = None
    brand_cost: Optional[int] = None
    agency_fee: Optional[int] = None
    payment_terms: Optional[str] = None
    product_status: Optional[str] = None
    content_status: Optional[str] = None
    shoot_date: Optional[date] = None
    live_date: Optional[date] = None
    live_links: Optional[str] = None
    script_links: Optional[str] = None
    ig_reel_views: Optional[int] = None
    ig_reel_likes: Optional[int] = None
    ig_reel_comments: Optional[int] = None
    ig_reel_shares: Optional[int] = None
    ig_reel_saves: Optional[int] = None
    ig_reel_reach: Optional[int] = None
    ig_story_views: Optional[int] = None
    ig_story_reach: Optional[int] = None
    ig_avg_watch_time: Optional[timedelta] = None
    ig_total_watch_time: Optional[timedelta] = None
    ig_reels_ir_perc: Optional[Decimal] = None
    ig_reels_er_perc: Optional[Decimal] = None
    ig_male_perc: Optional[Decimal] = None
    ig_female_perc: Optional[Decimal] = None
    yt_views: Optional[int] = None
    yt_likes: Optional[int] = None
    yt_comments: Optional[int] = None
    yt_er_perc: Optional[Decimal] = None
    yt_total_impressions: Optional[int] = None
    yt_total_watch_time: Optional[timedelta] = None
    cpv: Optional[Decimal] = None


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


class PitchCreatorRow(BaseModel):
    creator_id: UUID
    name: str
    username: str
    platform: PlatformChoices
    tier: TierChoices
    followers: Optional[int] = None
    reel_count: int = 0
    reel_story_count: int = 0
    video_story_count: int = 0
    static_carousel_count: int = 0
    event_store_visit: bool = False
    short_form_videos_count: int = 0
    reshare_short_form_videos_count: int = 0
    dedicated_video_count: int = 0
    integrated_video_count: int = 0
    usage_rights: Optional[str] = None
    ad_promo_rights: Optional[str] = None
    boosting: Optional[str] = None
    payment_terms: Optional[str] = None
    reel_cost: int = 0
    reel_story_cost: int = 0
    video_story_cost: int = 0
    static_carousel_cost: int = 0
    short_form_videos_cost: int = 0
    reshare_short_form_videos_cost: int = 0
    dedicated_video_cost: int = 0
    integrated_video_cost: int = 0
    rights_cost: int = 0
    boosting_cost: int = 0
    package_cost: int = 0
    final_cost: int = 0
    brand_cost: int = 0


class CampaignRefLite(BaseModel):
    id: UUID
    campaign_code: str
    campaign_name: str


class PitchTotals(BaseModel):
    creator_count: int = 0
    total_final_cost: Optional[int] = None
    total_brand_cost: Optional[int] = None


class PitchDetail(PitchRow):
    campaign: Optional[CampaignRefLite] = None
    company: Optional[CompanyRef] = None
    creators: list[PitchCreatorRow] = []
    totals: PitchTotals = PitchTotals()


class BrandDetail(BrandRow):
    total_brand_cost: Optional[int] = None
    campaigns: list[CampaignRow] = []
    pitches: list[PitchRow] = []
    top_creators: list[CreatorRow] = []
