from typing import Generic, Literal, TypeVar, Optional
from uuid import UUID
from datetime import date, datetime

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

RowT = TypeVar("RowT")


class Paging(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=settings.MAX_PAGE_SIZE)


class SearchResponse(BaseModel, Generic[RowT]):
    total: int
    pages: int
    page: int
    page_size: int
    rows: list[RowT]
    took_ms: Optional[int] = None


class BrandRef(BaseModel):
    id: int
    name: str


class CompanyRef(BaseModel):
    id: int
    name: str
    gstin: Optional[str] = None


#: Fields on CreatorRow that shadow a lazy relationship on the ORM Creator.
_TAG_FIELDS = frozenset({"categories", "languages"})


# --- Creators ---


#: How a creator relates to the campaigns they appear on.
#:   worked       -- on at least one campaign that actually ran
#:   never        -- on no campaign at all
#:   dropped_only -- only ever on campaigns they were dropped from
CampaignInvolvement = Literal["worked", "never", "dropped_only"]


class CreatorSearchRequest(Paging):
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
    #: "at least one of the two". has_email and has_phone each add their own
    #: clause, so ticking both means email AND phone -- this is the OR.
    has_contact: bool = False
    campaign_involvement: Optional[CampaignInvolvement] = None
    min_followers: Optional[int] = None
    max_followers: Optional[int] = None
    min_avg_views: Optional[int] = None
    max_avg_views: Optional[int] = None
    sort: str = "relevance"


_PROFILE_URL = {
    PlatformChoices.INSTAGRAM: "https://www.instagram.com/{h}",
    PlatformChoices.YOUTUBE: "https://www.youtube.com/@{h}",
    PlatformChoices.LINKEDIN: "https://linkedin.com/in/{h}",
    PlatformChoices.FACEBOOK: "https://www.facebook.com/{h}",
}


class CreatorRow(BaseModel):
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

    @computed_field
    @property
    def profile_url(self) -> Optional[str]:
        handle = (self.username or "").lstrip("@")
        tmpl = _PROFILE_URL.get(self.platform)
        return tmpl.format(h=handle) if (handle and tmpl) else None

    @classmethod
    def from_creator(
        cls,
        creator,
        *,
        categories: list[str] = [],
        languages: list[str] = [],
    ) -> "CreatorRow":
        data = {
            name: getattr(creator, name)
            for name in cls.model_fields
            if name not in _TAG_FIELDS and name not in ("emails", "phones")
        }
        emails = getattr(creator, "emails")
        phones = getattr(creator, "phones")
        merged = {
            **data,
            "emails": emails if emails else [],
            "phones": phones if phones else [],
        }
        return cls(**merged, categories=list(categories), languages=list(languages))


# --- Brands ---


class BrandSearchRequest(Paging):
    text: Optional[str] = None
    org_types: list[OrgTypeChoices] = []
    platforms: list[PlatformChoices] = []
    has_company: bool = False
    has_gstin: bool = False
    min_campaigns: Optional[int] = None
    min_pitches: Optional[int] = None
    sort: str = "relevance"


class BrandRow(BaseModel):
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


# --- Campaign ---


class CampaignSearchRequest(Paging):
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


# --- Pitches ---


class PitchSearchRequest(Paging):
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
