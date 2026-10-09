from typing import Generic, Literal, TypeVar, Optional, Any, Union
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
from app.schemas.analytics import MissingField

RowT = TypeVar("RowT")


def docs_link(file_id: Optional[str]) -> Optional[str]:
    return f"https://docs.google.com/open?id={file_id}" if file_id else None


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

    @classmethod
    def of(cls, brand: Any) -> Optional["BrandRef"]:
        return cls(id=brand.id, name=brand.display_name) if brand else None


class CompanyRef(BaseModel):
    id: int
    name: str
    gstin: Optional[str] = None

    @classmethod
    def of(cls, company: Any) -> Optional["CompanyRef"]:
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
    has_package: bool = False
    min_package_cost: Optional[int] = Field(default=None, ge=0)
    max_package_cost: Optional[int] = Field(default=None, ge=0)

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

    @computed_field
    @property
    def profile_url(self) -> Optional[str]:
        handle = (self.username or "").lstrip("@")
        tmpl = _PROFILE_URL.get(self.platform)
        return tmpl.format(h=handle) if (handle and tmpl) else None

    @classmethod
    def of(cls, creator: Any, categories=(), languages=()) -> "CreatorRow":
        # Field by field, never model_validate(creator): that would touch the
        # lazy categories relationship, which raises inside an async session.
        data = {
            f: getattr(creator, f)
            for f in cls.model_fields
            if f not in ("categories", "languages")
        }
        data["emails"], data["phones"] = creator.emails or [], creator.phones or []
        return cls(**data, categories=list(categories), languages=list(languages))


# --- Brands ---


class BrandSearchRequest(Paging):
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

    @classmethod
    def of(cls, c: Any, brand: Any, creator_count: int) -> "CampaignRow":
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

    @classmethod
    def of(cls, p: Any, brand: Any, creator_count: int, converted: bool) -> "PitchRow":
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
