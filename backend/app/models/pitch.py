from uuid import uuid4, UUID
from typing import TYPE_CHECKING, Optional
from datetime import datetime, timezone

from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Enum as SaEnum, Column, String, DateTime
from sqlalchemy.dialects.postgresql import ARRAY
from pydantic import ConfigDict, HttpUrl, field_validator

from .enums import PlatformChoices, OrgTypeChoices, PitchRequirementChoices

if TYPE_CHECKING:
    from .link_models import PitchCreatorLink
    from .brand import Brand
    from .campaign import Campaign


class Pitch(SQLModel, table=True):
    model_config = ConfigDict(
        validate_assignment=True
    )

    id: UUID | None = Field(default_factory=uuid4, primary_key=True)
    pitch_code: str = Field(default=None, nullable=False, unique=True)
    org_type: OrgTypeChoices = Field(sa_type=SaEnum(OrgTypeChoices), nullable=False)

    brand_id: Optional[int] = Field(default=None, foreign_key="brand.id")
    brand: Optional["Brand"] = Relationship(back_populates="pitches")

    campaign_name: str = Field(nullable=False, index=True)

    requirement: PitchRequirementChoices = Field(
        sa_type=SaEnum(PitchRequirementChoices), nullable=False
    )
    platform: list["PlatformChoices"] = Field(
        sa_column=Column(ARRAY(SaEnum(PlatformChoices)), nullable=False)
    )
    sales_lead: str = Field(nullable=False)
    list_lead: str
    spreadsheet_link: str = Field(sa_column=Column(String, unique=True, nullable=False))

    creators: list["PitchCreatorLink"] = Relationship(
        back_populates="pitch",
    )

    created_at: datetime | None = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    updated_at: datetime | None = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )

    campaign: Optional["Campaign"] = Relationship(back_populates="pitch", sa_relationship_kwargs={"uselist": False})

    @field_validator("spreadsheet_link", mode="before")
    @classmethod
    def _validate_and_stringify_url(cls, v: str | HttpUrl) -> str:
        # HttpUrl(...) raises pydantic.ValidationError if v isn't a valid URL
        return str(HttpUrl(v))
