from typing import Optional, TYPE_CHECKING

from sqlmodel import SQLModel, Field, Relationship, Index, text
from sqlalchemy import CheckConstraint
from pydantic import field_validator, ConfigDict

from app.core.config import settings

if TYPE_CHECKING:
    from .company import Company
    from .pitch import Pitch
    from .campaign import Campaign


class Brand(SQLModel, table=True):
    model_config = ConfigDict(validate_assignment=True)

    __table_args__ = (
        CheckConstraint(
            f"gstin = '' OR gstin ~ '{settings.GSTIN_REGEX}'",
            name="ck_brand_gstin_format",
        ),
        Index(
            "ix_brand_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, nullable=False)
    display_name: str = Field(nullable=False)
    gstin: Optional[str] = Field(
        default=None,
        unique=True,
        schema_extra={"placeholder": "27AAAAA1111A1Z1"},
        nullable=True,
    )

    company_id: Optional[int] = Field(default=None, foreign_key="company.id")
    company: Optional["Company"] = Relationship(back_populates="brands")

    pitches: list["Pitch"] = Relationship(back_populates="brand")
    campaigns: list["Campaign"] = Relationship(back_populates="brand")

    @field_validator("name", mode="after")
    @classmethod
    def lowercase_name(cls, v: str) -> str:
        return v.lower().strip()
