from typing import Optional, TYPE_CHECKING
from uuid import UUID, uuid4
from datetime import date

from sqlmodel import Field, Relationship, text
from sqlalchemy import Enum as SaEnum, String, Column
from sqlalchemy.dialects.postgresql import ARRAY
from pydantic import ConfigDict

from .enums import CampaignStatusChoices, MonthChoices
from .versioned import Versioned

if TYPE_CHECKING:
    from .pitch import Pitch
    from .link_models import CampaignCreatorLink
    from .brand import Brand


class Campaign(Versioned, table=True):
    model_config = ConfigDict(validate_assignment=True)

    id: Optional[UUID] = Field(
        default_factory=uuid4,
        primary_key=True,
        sa_column_kwargs={"server_default": text("uuidv4()")},
    )
    campaign_code: str = Field(nullable=False, unique=True, index=True)

    month_name: MonthChoices = Field(sa_type=SaEnum(MonthChoices), nullable=False)
    year: int

    brand_id: Optional[int] = Field(default=None, foreign_key="brand.id")
    brand: Optional["Brand"] = Relationship(back_populates="campaigns")

    campaign_name: str = Field(nullable=False, index=True)
    manager: str = Field(nullable=False)
    member_names: list[str] = Field(
        default_factory=list,
        sa_column=Column(ARRAY(String), server_default=text("ARRAY[]::VARCHAR[]")),
    )

    pitch_id: UUID | None = Field(default=None, foreign_key=("pitch.id"))
    pitch: "Pitch" = Relationship(
        back_populates="campaign", sa_relationship_kwargs={"uselist": False}
    )

    spreadsheet_id: str = Field(nullable=False, unique=True)
    report_id: str = Field(nullable=False, unique=True)

    status: CampaignStatusChoices = Field(
        default=CampaignStatusChoices.WIP,
        sa_type=SaEnum(CampaignStatusChoices),
        nullable=False,
    )

    expected_end_date: date = Field(nullable=False)
    start_date: date = Field(nullable=False)
    end_date: Optional[date] = Field(nullable=True)

    report_status: CampaignStatusChoices = Field(
        default=CampaignStatusChoices.WIP,
        sa_type=SaEnum(CampaignStatusChoices),
        nullable=False,
    )
    report_completion_date: Optional[date] = Field(nullable=True)

    creator_data: list["CampaignCreatorLink"] = Relationship(back_populates="campaign")
