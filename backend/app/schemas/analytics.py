from typing import Literal, Optional

from pydantic import BaseModel

from app.models.enums import PlatformChoices

MissingField = Literal[
    "followers",
    "avg_views",
    "emails",
    "phones",
    "gender",
    "city",
    "state",
    "categories",
    "languages",
]

class CreatorSummaryRequest(BaseModel):
    platforms: list[PlatformChoices] = []
    categories: list[str] = []
    languages: list[str] = []
    is_active: Optional[bool] = True

class MissingCell(BaseModel):
    applicable: int
    missing: int

class PlatformSummary(BaseModel):
    platform: PlatformChoices
    total: int
    with_gaps: int
    cells: dict[MissingField, MissingCell]

class Totals(BaseModel):

    total: int
    with_gaps: int

class FieldTotal(BaseModel):
    key: MissingField
    applicable: int
    missing: int

class SummaryOption(BaseModel):
    value: str
    count: int

class SummaryOptions(BaseModel):
    platforms: list[SummaryOption]
    categories: list[SummaryOption]
    languages: list[SummaryOption]

class CreatorSummary(BaseModel):
    platforms: list[PlatformSummary]
    totals: Totals
    fields: list[FieldTotal]
    options: SummaryOptions