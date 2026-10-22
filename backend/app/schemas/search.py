"""Search requests and the row shapes both search and detail return.

Creator, campaign and pitch rows each have one `of(...)` builder, so a campaign,
looks the same whether it comes from /search/campaigns, a brand page or its own page.
"""

from typing import Generic, Literal, TypeVar, Optional, Any, Union
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP

from pydantic import BaseModel, Field, computed_field

from app.models.enums import (
    PlatformChoices,
    TierChoices,
    OrgTypeChoices,
    CampaignStatusChoices,
    MonthChoices,
    PitchRequirementChoices,
)
from app.core.config import settings
from app.schemas.analytics import MissingField

RowT = TypeVar("RowT")


def docs_link(file_id: Optional[str]) -> Optional[str]:
    """Drive file id -> a link that opens it (sheet or doc alike)."""
    return f"https://docs.google.com/open?id={file_id}" if file_id else None


class Paging(BaseModel):
    """Page number and size, shared by every seach request."""

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=settings.MAX_PAGE_SIZE)


class SearchResponse(BaseModel, Generic[RowT]):
    """One page of results; `took_ms` is how long the server spent on it."""

    total: int
    pages: int
    page: int
    page_size: int
    rows: list[RowT]
    took_ms: Optional[int] = None


class BrandRef(BaseModel):
    """A brand to link to: its id and display name."""

    id: int
    name: str

    @classmethod
    def of(cls, brand: Any) -> Optional["BrandRef"]:
        """None in, None out; `name` is the display name, not the match key."""
        return cls(id=brand.id, name=brand.display_name) if brand else None


class CompanyRef(BaseModel):
    """A company to link to, with its GSTIN."""

    id: int
    name: str
    gstin: Optional[str] = None

    @classmethod
    def of(cls, company: Any) -> Optional["CompanyRef"]:
        """None in, None out."""
        return (
            cls(id=company.id, name=company.name, gstin=company.gstin)
            if company
            else None
        )


# --- Creators ---


#: How a creator relates to the campaigns they appear on.
#:   worked       -- on at least one campaign that actually ran
#:   never        -- on no campaign at all
#:   dropped_only -- only ever on campaigns they were dropped from
CampaignInvolvement = Literal["worked", "never", "dropped_only"]


class CreatorSearchRequest(Paging):
    """Filters for the Creators table. A list matches any of its entries.

    `text` can also be a pasted profile link, which matches that exact username.
    `sort`: relevance, or followers / avg_views / name / package_cost / gaps with
    _asc or _desc; anything else sorts by followers.
    `missing`: a field or "any".
    """

    text: Optional[str] = None
    platforms: list[PlatformChoices] = []
    tiers: list[TierChoices] = []
    genders: list[str] = []
    categories: list[str] = []
    languages: list[str] = []
    brand_ids: list[int] = []
    tags: list[str] = []
    cities: list[str] = []
    has_email: bool = False
    has_phone: bool = False
    #: email OR phone (ticking has_email and has_phone means both)
    has_contact: bool = False
    campaign_involvement: Optional[CampaignInvolvement] = None
    min_followers: Optional[int] = None
    max_followers: Optional[int] = None
    min_avg_views: Optional[int] = None
    max_avg_views: Optional[int] = None
    #:  has a latest cost from a pitch/campaign
    has_commercial: bool = False
    min_commercial_cost: Optional[int] = Field(default=None, ge=0)
    max_commercial_cost: Optional[int] = Field(default=None, ge=0)
    #: on cpv = latest cost / avg views; creators without a cpv are excluded
    min_cpv: Optional[Decimal] = Field(
        default=None, ge=Decimal("0.00"), decimal_places=2
    )
    max_cpv: Optional[Decimal] = Field(
        default=None, ge=Decimal("0.00"), decimal_places=2
    )

    # true = active profiles only (default), false = inactive only, null = both
    is_active: Optional[bool] = True
    sort: str = "relevance"
    missing: Optional[Union[MissingField, Literal["any"]]] = None


_PROFILE_URL = {
    PlatformChoices.INSTAGRAM: "https://www.instagram.com/{h}",
    PlatformChoices.YOUTUBE: "https://www.youtube.com/@{h}",
    PlatformChoices.LINKEDIN: "https://linkedin.com/in/{h}",
    PlatformChoices.FACEBOOK: "https://www.facebook.com/{h}",
}


class CreatorRow(BaseModel):
    """A creator in Creators table, and the top of creator page."""

    id: UUID
    name: str
    username: str
    platform: PlatformChoices
    tier: TierChoices
    followers: Optional[int] = None
    avg_views: Optional[int] = None
    city: Optional[str] = None
    state: Optional[str] = None
    region: Optional[str] = None
    gender: Optional[str] = None
    categories: list[str] = []
    languages: list[str] = []
    emails: list[str] = []
    phones: list[str] = []
    is_active: bool = True
    latest_cost: Optional[int] = None
    latest_cost_source: Optional[str] = None
    latest_cost_month: Optional[int] = None # 1-12
    latest_cost_year: Optional[int] = None
    latest_cost_deliverables: Optional[str] = None  # what that cost was quoted for

    @computed_field
    @property
    def cpv(self) -> Optional[Decimal]:
        """Cost per view: latest cost / avg views, to 2 places; None without both.
        Rounds half-up like Postgres round(), so it agrees with min_cpv / max_cpv."""
        if not self.latest_cost or not self.avg_views:
            return None
        return (Decimal(self.latest_cost) / self.avg_views).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

    @computed_field
    @property
    def profile_url(self) -> Optional[str]:
        """Link to the profile, built from the username; None for others / NA."""
        handle = (self.username or "").lstrip("@")
        tmpl = _PROFILE_URL.get(self.platform)
        return tmpl.format(h=handle) if (handle and tmpl) else None

    @classmethod
    def of(cls, creator: Any, categories=(), languages=()) -> "CreatorRow":
        """Build from a Creator plus its category and language names, loaded apart."""
        # Field by field, never model_validate(creator): that would touch the
        # lazy categories relationship, which raises inside an async session.
        data = {
            f: getattr(creator, f)
            for f in cls.model_fields
            if f not in ("categories", "languages") and not f.startswith("latest_cost")
        }
        data["emails"], data["phones"] = creator.emails or [], creator.phones or []
        return cls(**data, categories=list(categories), languages=list(languages))


# --- Brands ---


class BrandSearchRequest(Paging):
    """Filters for the Brands table.

    `org_types` and `platforms` match a brand with at least one such pitch.
    `sort`: name_asc / name_desc, campaigns_desc, pitches_desc, recent_desc or relevance.
    (by name when there is no text).
    """

    text: Optional[str] = None
    ids: list[int] = []
    org_types: list[OrgTypeChoices] = []
    platforms: list[PlatformChoices] = []
    has_company: bool = False
    has_gstin: bool = False
    min_campaigns: Optional[int] = None
    min_pitches: Optional[int] = None
    sort: str = "relevance"


class BrandRow(BaseModel):
    """A brand in the Brands table, and the top of the brand page.

    `creator_count` is distinct creators across its pitches and campaigns.
    `latest_activity` is its newest campaign start or pitch date. `org_types` and
    `platforms` are gathered from its pitches.
    """

    id: int
    name: str
    gstin: Optional[str] = None
    company: Optional[CompanyRef] = None
    pitch_count: int = 0
    campaign_count: int = 0
    creator_count: int = 0
    org_types: list[OrgTypeChoices] = []
    platforms: list[PlatformChoices] = []
    latest_activity: Optional[date] = None


# --- Campaigns ---


class CampaignSearchRequest(Paging):
    """Filters for the Campaigns table.

    `sort`: start_date_desc / start_date_asc, code_desc / code_asc, creators_desc
    or relevance (by code when there is no text).
    """

    text: Optional[str] = None
    statuses: list[CampaignStatusChoices] = []
    report_statuses: list[CampaignStatusChoices] = []
    months: list[MonthChoices] = []
    years: list[int] = []
    managers: list[str] = []
    brand_ids: list[int] = []
    start_date_from: Optional[date] = None
    start_date_to: Optional[date] = None
    sort: str = "start_date_desc"


class CampaignRow(BaseModel):
    """A campaign in the Campaigns table; `creator_count` includes dropped creators."""

    id: UUID
    campaign_code: str
    campaign_name: str
    brand: Optional[BrandRef] = None
    manager: str
    member_names: list[str] = []
    month_name: MonthChoices
    year: int
    status: CampaignStatusChoices
    report_status: CampaignStatusChoices
    start_date: Optional[date] = None
    expected_end_date: Optional[date] = None
    end_date: Optional[date] = None
    report_completion_date: Optional[date] = None
    creator_count: int = 0
    spreadsheet_link: Optional[str] = None
    report_link: Optional[str] = None

    @classmethod
    def of(cls, c: Any, brand: Any, creator_count: int) -> "CampaignRow":
        """Build from a Campaign; its Drive file ids become links."""

        return cls(
            id=c.id,
            campaign_code=c.campaign_code,
            campaign_name=c.campaign_name,
            brand=BrandRef.of(brand),
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
            creator_count=creator_count,
            spreadsheet_link=docs_link(file_id=c.spreadsheet_id),
            report_link=docs_link(file_id=c.report_id),
        )


# --- Pitches ---


class PitchSearchRequest(Paging):
    """Filters for the Pitches table.

    `created_to` includes that whole day. `converted`: true / false, null for both.
    `sort`: created_desc / created_asc, code_desc / code_asc, creators_desc or
    relevance (by code when there is no text).
    """

    text: Optional[str] = None
    org_types: list[OrgTypeChoices] = []
    requirements: list[PitchRequirementChoices] = []
    platforms: list[PlatformChoices] = []
    sales_leads: list[str] = []
    list_leads: list[str] = []
    brand_ids: list[int] = []
    created_from: Optional[date] = None
    created_to: Optional[date] = None
    converted: Optional[bool] = None
    sort: str = "created_desc"


class PitchRow(BaseModel):
    """A pitch in the Pitches table; `converted` means a campaign was made from it."""

    id: UUID
    pitch_code: str
    brand: Optional[BrandRef] = None
    campaign_name: str
    org_type: OrgTypeChoices
    requirement: PitchRequirementChoices
    platform: list[PlatformChoices] = []
    sales_lead: str
    list_lead: Optional[str] = None
    creator_count: int = 0
    converted: bool = False
    spreadsheet_link: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def of(cls, p: Any, brand: Any, creator_count: int, converted: bool) -> "PitchRow":
        """Build from a Pitch; the count and `converted` come from the caller."""

        return cls(
            id=p.id,
            pitch_code=p.pitch_code,
            brand=BrandRef.of(brand),
            campaign_name=p.campaign_name,
            org_type=p.org_type,
            requirement=p.requirement,
            platform=p.platform or [],
            sales_lead=p.sales_lead,
            list_lead=p.list_lead,
            creator_count=creator_count,
            converted=converted,
            spreadsheet_link=docs_link(file_id=p.spreadsheet_id),
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
