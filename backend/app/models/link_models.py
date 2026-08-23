from typing import Optional, TYPE_CHECKING
from uuid import UUID, uuid4
from datetime import date, timedelta
from decimal import Decimal

if TYPE_CHECKING:
    from .creator import Creator
    from .pitch import Pitch
    from .campaign import Campaign

from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, ARRAY, String


class CategoryCreatorLink(SQLModel, table=True):
    creator_id: Optional[UUID] = Field(
        default=None, foreign_key="creator.id", primary_key=True
    )
    category_id: Optional[int] = Field(
        default=None, foreign_key="category.id", primary_key=True
    )


class LanguageCreatorLink(SQLModel, table=True):
    creator_id: Optional[UUID] = Field(
        default=None, foreign_key="creator.id", primary_key=True
    )
    language_id: Optional[int] = Field(
        default=None, foreign_key="language.id", primary_key=True
    )


class PitchCreatorLink(SQLModel, table=True):
    creator_id: Optional[UUID] = Field(
        default=None, foreign_key="creator.id", primary_key=True
    )
    pitch_id: Optional[UUID] = Field(
        default=None, foreign_key="pitch.id", primary_key=True
    )

    # deliverables count

    # IG
    reel_count: int = Field(default=0, nullable=False)
    reel_story_count: int = Field(default=0, nullable=False)
    video_story_count: int = Field(default=0, nullable=False)
    static_carousel_count: int = Field(default=0, nullable=False)
    event_store_visit: bool = Field(default=False, nullable=False)

    # YT
    short_form_videos_count: int = Field(default=0, nullable=False)
    reshare_short_form_videos_count: int = Field(default=0, nullable=False)
    dedicated_video_count: int = Field(default=0, nullable=False)
    integrated_video_count: int = Field(default=0, nullable=False)

    # common
    usage_rights: str = Field(nullable=True)
    ad_promo_rights: str = Field(nullable=True)
    boosting: str = Field(nullable=True)

    payment_terms: str = Field(nullable=False)

    # deliverables costs

    # IG
    reel_cost: int = Field(default=0, nullable=False)
    reel_story_cost: int = Field(default=0, nullable=False)
    video_story_cost: int = Field(default=0, nullable=False)
    static_carousel_cost: int = Field(default=0, nullable=False)

    # YT
    short_form_videos_cost: int = Field(default=0, nullable=False)
    reshare_short_form_videos_cost: int = Field(default=0, nullable=False)
    dedicated_video_cost: int = Field(default=0, nullable=False)
    integrated_video_cost: int = Field(default=0, nullable=False)

    # common
    rights_cost: int = Field(default=0, nullable=False)
    boosting_cost: int = Field(default=0, nullable=False)
    package_cost: int = Field(default=0, nullable=False)

    # campaign related cost
    final_cost: int = Field(default=0, nullable=False)
    brand_cost: int = Field(default=0, nullable=False)

    pitch: "Pitch" = Relationship(back_populates="creators")
    creator: "Creator" = Relationship(back_populates="affiliated_pitches")


class CampaignCreatorLink(SQLModel, table=True):
    creator_id: Optional[UUID] = Field(
        default=None, foreign_key="creator.id", primary_key=True
    )
    campaign_id: Optional[UUID] = Field(
        default=None, foreign_key="campaign.id", primary_key=True
    )

    is_dropped: bool = Field(default=False)
    expected_views: int = Field(default=0, nullable=False)
    poc_name: list[str] = Field(default=[], sa_column=Column(ARRAY(String)))

    deliverables_raw: str
    initial_cost: int
    final_cost: int = Field(nullable=True)
    payment_terms: str = Field(nullable=True)
    brand_cost: int = Field(default=0, nullable=False)
    agency_fee: int = Field(default=0, nullable=False)

    product_status: str = Field(default="", nullable=False)
    product_ordered_by: str = Field(default="", nullable=False)

    product_cost: int = Field(default=0, nullable=False)
    shipping_cost: int = Field(default=0, nullable=False)
    promotion_cost: int = Field(default=0, nullable=False)
    reimbursement_cost: int = Field(default=0, nullable=False)
    additional_cost: int = Field(default=0, nullable=False)

    script_links: str = Field(default="", nullable=True)
    shoot_date: date = Field(nullable=True)
    content_status: str = Field(default="", nullable=True)
    live_date: date = Field(nullable=True)
    live_links: str = Field(default="", nullable=True)

    # tracker data

    # Instagram
    ig_reel_views: int = Field(default=0, nullable=False)
    ig_reel_likes: int = Field(default=0, nullable=False)
    ig_reel_comments: int = Field(default=0, nullable=False)
    ig_reel_shares: int = Field(default=0, nullable=False)
    ig_reel_saves: int = Field(default=0, nullable=False)
    ig_story_views: int = Field(default=0, nullable=False)
    ig_reel_reach: int = Field(default=0, nullable=False)
    ig_story_reach: int = Field(default=0, nullable=False)
    ig_avg_watch_time: timedelta = Field(default=timedelta())
    ig_total_watch_time: timedelta = Field(default=timedelta())
    ig_skip_rate_content: Decimal = Field(default=Decimal("0.00"), nullable=False)
    ig_followers_view_perc: Decimal = Field(default=Decimal("0.00"), nullable=False)
    ig_non_followers_view_perc: Decimal = Field(default=Decimal("0.00"), nullable=False)
    ig_male_perc: Decimal = Field(default=Decimal("0.00"), nullable=False)
    ig_female_perc: Decimal = Field(default=Decimal("0.00"), nullable=False)
    ig_age_13_17_perc: Decimal = Field(default=Decimal("0.00"), nullable=False)
    ig_age_18_24_perc: Decimal = Field(default=Decimal("0.00"), nullable=False)
    ig_age_25_34_perc: Decimal = Field(default=Decimal("0.00"), nullable=False)
    ig_age_35_44_perc: Decimal = Field(default=Decimal("0.00"), nullable=False)
    ig_age_45_54_perc: Decimal = Field(default=Decimal("0.00"), nullable=False)
    ig_age_55_64_perc: Decimal = Field(default=Decimal("0.00"), nullable=False)
    ig_age_over_65_perc: Decimal = Field(default=Decimal("0.00"), nullable=False)
    ig_reels_ir_perc: Decimal = Field(default=Decimal("0.00"), nullable=False)
    ig_reels_er_perc: Decimal = Field(default="0.00", nullable=False)
    cpv: Decimal = Field(default=Decimal("0.00"), decimal_places=2)

    # YT
    yt_views: int = Field(default=0, nullable=False)
    yt_likes: int = Field(default=0, nullable=False)
    yt_comments: int = Field(default=0, nullable=False)
    yt_er_perc: Decimal = Field(default=Decimal("0.00"), nullable=False)
    yt_total_impressions: int = Field(default=0, nullable=False)
    yt_total_watch_time: timedelta = Field(default=timedelta())

    creator: "Creator" = Relationship(back_populates="affiliated_campaigns")
    campaign: "Campaign" = Relationship(back_populates="creator_data")
