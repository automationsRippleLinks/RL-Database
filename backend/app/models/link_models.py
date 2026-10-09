from typing import Optional, TYPE_CHECKING
from uuid import UUID
from datetime import date, timedelta
from decimal import Decimal

if TYPE_CHECKING:
    from .creator import Creator
    from .pitch import Pitch
    from .campaign import Campaign

from sqlmodel import SQLModel, Field, Relationship, text
from sqlalchemy import Column, ARRAY, String

from .versioned import Versioned


class BrandCreatorLink(SQLModel, table=True):
    creator_id: Optional[UUID] = Field(
        default=None, foreign_key="creator.id", primary_key=True
    )
    brand_id: Optional[int] = Field(
        default=None, foreign_key="brand.id", primary_key=True
    )


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


class TagCreatorLink(SQLModel, table=True):
    creator_id: Optional[UUID] = Field(
        default=None, foreign_key="creator.id", primary_key=True
    )
    tag_id: Optional[int] = Field(default=None, foreign_key="tag.id", primary_key=True)


class PitchCreatorLinkBase(Versioned):
    # deliverables count

    # IG
    reel_count: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    reel_story_count: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    video_story_count: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    static_carousel_count: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    event_store_visit: bool = Field(
        default=False, nullable=False, sa_column_kwargs={"server_default": "false"}
    )

    # YT
    short_form_videos_count: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    reshare_short_form_videos_count: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    dedicated_video_count: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    integrated_video_count: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )

    # common
    usage_rights: Optional[str] = Field(default=None, nullable=True)
    ad_promo_rights: Optional[str] = Field(default=None, nullable=True)
    boosting: Optional[str] = Field(default=None, nullable=True)

    payment_terms: str = Field(
        nullable=False, sa_column_kwargs={"server_default": "Under 45 days."}
    )

    # deliverables costs

    # IG
    reel_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    reel_story_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    video_story_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    static_carousel_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )

    # YT
    short_form_videos_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    reshare_short_form_videos_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    dedicated_video_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    integrated_video_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )

    # common
    rights_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    boosting_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    package_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )

    # campaign related cost
    final_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    brand_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )


class PitchCreatorLink(PitchCreatorLinkBase, table=True):
    creator_id: Optional[UUID] = Field(
        default=None, foreign_key="creator.id", primary_key=True
    )
    pitch_id: Optional[UUID] = Field(
        default=None, foreign_key="pitch.id", primary_key=True
    )

    pitch: "Pitch" = Relationship(back_populates="creators")
    creator: "Creator" = Relationship(back_populates="affiliated_pitches")


class CampaignCreatorLinkBase(Versioned):
    is_dropped: bool = Field(
        default=False, sa_column_kwargs={"server_default": "false"}
    )
    expected_views: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    poc_name: list[str] = Field(
        default_factory=list,
        sa_column=Column(ARRAY(String), server_default=text("ARRAY[]::VARCHAR[]")),
    )

    deliverables_raw: str
    initial_cost: int
    final_cost: Optional[int] = Field(default=None, nullable=True)
    payment_terms: Optional[str] = Field(default=None, nullable=True)
    brand_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    agency_fee: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )

    product_status: Optional[str] = Field(default=None, nullable=True)
    product_ordered_by: Optional[str] = Field(default=None, nullable=True)

    product_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    shipping_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    promotion_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    reimbursement_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    additional_cost: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )

    script_links: Optional[str] = Field(default=None, nullable=True)
    shoot_date: Optional[date] = Field(default=None, nullable=True)
    content_status: Optional[str] = Field(default=None, nullable=True)
    live_date: Optional[date] = Field(default=None, nullable=True)
    live_links: Optional[str] = Field(default=None, nullable=True)

    # tracker data

    # Instagram
    ig_reel_views: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    ig_reel_likes: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    ig_reel_comments: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    ig_reel_shares: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    ig_reel_saves: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    ig_story_views: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    ig_reel_reach: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    ig_story_reach: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    ig_avg_watch_time: timedelta = Field(
        default=timedelta(), sa_column_kwargs={"server_default": text("'0'::interval")}
    )
    ig_total_watch_time: timedelta = Field(
        default=timedelta(), sa_column_kwargs={"server_default": text("'0'::interval")}
    )
    ig_skip_rate_content: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )
    ig_followers_view_perc: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )
    ig_non_followers_view_perc: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )
    ig_male_perc: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )
    ig_female_perc: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )
    ig_age_13_17_perc: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )
    ig_age_18_24_perc: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )
    ig_age_25_34_perc: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )
    ig_age_35_44_perc: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )
    ig_age_45_54_perc: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )
    ig_age_55_64_perc: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )
    ig_age_over_65_perc: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )
    ig_reels_ir_perc: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )
    ig_reels_er_perc: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )
    cpv: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )

    # YT
    yt_views: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    yt_likes: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    yt_comments: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    yt_er_perc: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        nullable=False,
        sa_column_kwargs={"server_default": "0.00"},
    )
    yt_total_impressions: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    yt_total_watch_time: timedelta = Field(
        default=timedelta(), sa_column_kwargs={"server_default": text("'0'::interval")}
    )


class CampaignCreatorLink(CampaignCreatorLinkBase, table=True):
    creator_id: Optional[UUID] = Field(
        default=None, foreign_key="creator.id", primary_key=True
    )
    campaign_id: Optional[UUID] = Field(
        default=None, foreign_key="campaign.id", primary_key=True
    )

    creator: "Creator" = Relationship(back_populates="affiliated_campaigns")
    campaign: "Campaign" = Relationship(back_populates="creator_data")
