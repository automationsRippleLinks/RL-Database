"""Pitches: proposals made to a client, imported from the pitch master sheet."""

from uuid import uuid4, UUID
from typing import TYPE_CHECKING, Optional
from datetime import datetime, timezone

from sqlmodel import Field, Relationship, func, DateTime
from sqlalchemy import Enum as SaEnum, Column
from sqlalchemy.dialects.postgresql import ARRAY
from pydantic import ConfigDict

from .enums import PlatformChoices, OrgTypeChoices, PitchRequirementChoices
from .versioned import Versioned

if TYPE_CHECKING:
    from .link_models import PitchCreatorLink
    from .brand import Brand
    from .campaign import Campaign


class Pitch(Versioned, table=True):
    """A pitch to a client; `campaign` is the campaign made from it, if any.
    
    Ingest stores `pitch_code` uppercase with a -YYYY suffix. `platform` is a list:
    one pitch can cover several platforms.
    """
    
    model_config = ConfigDict(validate_assignment=True)

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
    spreadsheet_id: str = Field(unique=True, nullable=False)

    creators: list["PitchCreatorLink"] = Relationship(
        back_populates="pitch",
    )

    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=func.now()
        ),
        default_factory=lambda: datetime.now(timezone.utc),
    )
    updated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=func.now(),
            onupdate=func.now(),
        ),
        default_factory=lambda: datetime.now(timezone.utc),
    )

    campaign: Optional["Campaign"] = Relationship(
        back_populates="pitch", sa_relationship_kwargs={"uselist": False}
    )
