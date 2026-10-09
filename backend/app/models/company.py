from typing import Optional, TYPE_CHECKING
import re

from sqlmodel import Field, Relationship
from sqlalchemy import CheckConstraint
from pydantic import field_validator

from app.core.config import settings
from .versioned import Versioned

if TYPE_CHECKING:
    from .brand import Brand


class Company(Versioned, table=True):

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
        unique=True,
        schema_extra={"placeholder": "27AAAAA1111A1Z1"},
        nullable=True,
    )

    @field_validator("gstin")
    @classmethod
    def validate_gstin(cls, value: Optional[str]) -> str:
        if value is None:
            return None
        upper_val = value.upper().strip()
        if upper_val == "":
            return upper_val
        if not re.match(settings.GSTIN_REGEX, upper_val):
            raise ValueError("Invalid GSTIN format structure")
        return upper_val

    brands: list["Brand"] = Relationship(back_populates="company")
