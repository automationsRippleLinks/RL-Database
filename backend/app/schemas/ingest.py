from typing import Literal, Optional, Annotated, Union
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, EmailStr, HttpUrl, field_serializer
from pydantic_extra_types.phone_numbers import PhoneNumberValidator

from app.models.enums import *

IndianPhoneNumber = Annotated[
    str,
    PhoneNumberValidator(
        default_region="IN", number_format="E164", supported_regions=["IN"]
    ),
]

#: A real number, or "" when the sheet has none.
#:
#: The union matters. `IndianPhoneNumber` alone rejects "", and the parser passes
#: the field explicitly, so pydantic validated it rather than falling back to the
#: default -- meaning every creator row with an empty phone cell failed
#: validation and was silently dropped from the batch.
BlankOrPhone = Union[Literal[""], IndianPhoneNumber]

#: A real address, or "" when the sheet has none -- nothing in between.
#:
#: `str` accepted anything, so "rahul@" and "call me" landed in Creator.email and
#: looked reachable. The parser blanks-and-reports bad cells before a record is
#: built (services/parser.py::_email); this type is the backstop for any path
#: that doesn't go through it.
BlankOrEmail = Union[Literal[""], EmailStr]


class IngestSource(str, Enum):
    pitch_master = "pitch_master"
    pitch_creator = "pitch_creator"
    campaign_master = "campaign_master"
    campaign_creator = "campaign_creator"
    brands = "brands"


class IngestJobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    PARTIAL_SUCCESS = "partial_success"
    FAILED = "failed"


class IngestCounts(BaseModel):
    received: int
    inserted: int
    updated: int
    skipped: int
    failed: int
    errors_truncated: int = 0


class IngestRowError(BaseModel):
    row: int
    field: Optional[str] = None
    message: str
    code: Optional[str] = None
    severity: str = "error"


class IngestJob(BaseModel):
    job_id: UUID
    source: IngestSource
    origin: Literal["apps_script", "upload"]
    status: IngestJobStatus
    dry_run: bool
    started_at: datetime
    finished_at: Optional[datetime] = None
    started_by: Optional[str] = None
    counts: IngestCounts
    errors: list[IngestRowError]
    message: Optional[str] = None


class IngestJobList(BaseModel):
    jobs: list[IngestJob]


class IngestSourceInfo(BaseModel):
    source: IngestSource
    label: str
    apps_script_supported: bool = False
    upload_supported: bool = False
    last_job: Optional[IngestJob] = None
    row_count: Optional[int] = None


##############################################################################################################################
##############################################################################################################################


# Pitch Master
class Pitch(BaseModel):
    pitch_code: str
    org_type: OrgTypeChoices
    brand_name: str
    brand_display_name: str
    campaign_name: str
    requirement: PitchRequirementChoices
    platform: list[PlatformChoices]
    sales_lead: str
    list_lead: str
    spreadsheet_link: HttpUrl

    @field_serializer("spreadsheet_link")
    def _ser_url(self, v: HttpUrl) -> str:
        return str(v)


##############################################################################################################################
##############################################################################################################################


# Campaign Master
class Campaign(BaseModel):
    campaign_code: str
    month_name: MonthChoices
    year: int
    brand_name: str
    brand_display_name: str
    campaign_name: str
    manager: str
    member_names: list[str]
    spreadsheet_link: HttpUrl
    report_link: HttpUrl
    status: CampaignStatusChoices
    expected_end_date: date
    start_date: date
    end_date: date | None = None
    report_status: CampaignStatusChoices
    report_completion_date: date | None = None

    pitch_code: str

    @field_serializer("spreadsheet_link", "report_link")
    def _ser_url(self, v: HttpUrl) -> str:
        return str(v)


##############################################################################################################################
##############################################################################################################################


# Pitch Creator


class CreatorLinkRecord(BaseModel):
    """One sheet row: a Creator plus its PitchCreatorLink."""

    source_file_id: str
    sheet_row: int
    platform: PlatformChoices
    username: str
    name: str
    followers: Optional[int] = None
    avg_views: Optional[int] = None
    tier: TierChoices = TierChoices.NA
    gender: str = ""
    city: str = ""
    categories_raw: str = ""
    languages_raw: str = ""
    email: BlankOrEmail = ""
    phone: BlankOrPhone = ""
    reel_count: int = 0
    reel_story_count: int = 0
    video_story_count: int = 0
    static_carousel_count: int = 0
    event_store_visit: bool = False
    short_form_videos_count: int = 0
    reshare_short_form_videos_count: int = 0
    dedicated_video_count: int = 0
    integrated_video_count: int = 0
    usage_rights: str = ""
    ad_promo_rights: str = ""
    boosting: str = ""
    payment_terms: str = ""
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


##############################################################################################################################
##############################################################################################################################


# Campaign Creator


class CampaignCreatorLinkRecord(BaseModel):
    # --- routing ---
    campaign_code: str
    sheet_row: Optional[int] = None

    # --- creator columns (excluded from the link insert) ---
    platform: PlatformChoices
    username: str
    name: str
    followers: Optional[int] = None
    avg_views: Optional[int] = None
    tier: TierChoices = TierChoices.NA
    gender: str = ""
    city: str = ""
    categories_raw: str = ""
    languages_raw: str = ""
    email: BlankOrEmail = ""
    phone: BlankOrPhone = ""

    # --- link columns ---
    is_dropped: bool = False
    expected_views: int = 0
    poc_name: list[str] = []

    deliverables_raw: str = ""
    initial_cost: int = 0
    final_cost: int = 0
    payment_terms: str = ""
    brand_cost: int = 0
    agency_fee: int = 0

    product_status: str = ""
    product_ordered_by: str = ""

    product_cost: int = 0
    shipping_cost: int = 0
    promotion_cost: int = 0
    reimbursement_cost: int = 0
    additional_cost: int = 0

    script_links: Optional[str] = None
    shoot_date: Optional[date] = None
    content_status: Optional[str] = None
    live_date: Optional[date] = None
    live_links: Optional[str] = None

    # Instagram tracker
    ig_reel_views: int = 0
    ig_reel_likes: int = 0
    ig_reel_comments: int = 0
    ig_reel_shares: int = 0
    ig_reel_saves: int = 0
    ig_story_views: int = 0
    ig_reel_reach: int = 0
    ig_story_reach: int = 0
    ig_avg_watch_time: timedelta = timedelta()
    ig_total_watch_time: timedelta = timedelta()
    ig_skip_rate_content: Decimal = Decimal("0.00")
    ig_followers_view_perc: Decimal = Decimal("0.00")
    ig_non_followers_view_perc: Decimal = Decimal("0.00")
    ig_male_perc: Decimal = Decimal("0.00")
    ig_female_perc: Decimal = Decimal("0.00")
    ig_age_13_17_perc: Decimal = Decimal("0.00")
    ig_age_18_24_perc: Decimal = Decimal("0.00")
    ig_age_25_34_perc: Decimal = Decimal("0.00")
    ig_age_35_44_perc: Decimal = Decimal("0.00")
    ig_age_45_54_perc: Decimal = Decimal("0.00")
    ig_age_55_64_perc: Decimal = Decimal("0.00")
    ig_age_over_65_perc: Decimal = Decimal("0.00")
    ig_reels_ir_perc: Decimal = Decimal("0.00")
    ig_reels_er_perc: Decimal = Decimal("0.00")
    cpv: Decimal = Decimal("0.00")

    # YouTube tracker
    yt_views: int = 0
    yt_likes: int = 0
    yt_comments: int = 0
    yt_er_perc: Decimal = Decimal("0.00")
    yt_total_impressions: int = 0
    yt_total_watch_time: timedelta = timedelta()


#: Fields on CreatorLinkRecord that belong to Creator (or to routing) and must
#: NOT be forwarded into the PitchCreatorLink insert.
PITCH_CREATOR_ONLY_FIELDS: set[str] = {
    "source_file_id",
    "sheet_row",
    "platform",
    "username",
    "name",
    "followers",
    "avg_views",
    "tier",
    "gender",
    "city",
    "categories_raw",
    "languages_raw",
    "email",
    "phone",
}


#: Fields on CampaignCreatorLinkRecord that belong to Creator (or to routing)
#: and must NOT be forwarded into the CampaignCreatorLink insert.
CAMPAIGN_CREATOR_ONLY_FIELDS: set[str] = {
    "campaign_code",
    "sheet_row",
    "platform",
    "username",
    "name",
    "followers",
    "avg_views",
    "tier",
    "gender",
    "city",
    "categories_raw",
    "languages_raw",
    "email",
    "phone",
}
