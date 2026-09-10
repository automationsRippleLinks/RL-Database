from typing import Optional, TYPE_CHECKING
import re

from sqlmodel import SQLModel, Field, text, Relationship
from sqlalchemy import CheckConstraint
from pydantic import field_validator

from app.core.config import settings

if TYPE_CHECKING:
    from .brand import Brand


class Company(SQLModel, table=True):

    __table_args__ = (
        CheckConstraint(
            f"gstin = '' OR gstin ~ '{settings.GSTIN_REGEX}'",
            name="ck_company_gstin_format",
        ),
    )
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    gstin: Optional[str] = Field(
        default=None,
        sa_column_kwargs={
            "server_default": text("NULL"),
        },
        schema_extra={"placeholder": "27AAAAA1111A1Z1"},
        nullable=True
    )

    @field_validator("gstin")
    @classmethod
    def validate_gstin(cls, value: str) -> str:
        upper_val = value.upper().strip()
        if upper_val == "":
            return upper_val
        if not re.match(settings.GSTIN_REGEX, upper_val):
            raise ValueError("Invalid GSTIN format structure")
        return upper_val

    brands: list["Brand"] = Relationship(back_populates="company")
