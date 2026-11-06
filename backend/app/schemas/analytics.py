"""Request and response shapes for the Creators data dashboard.

The counts are built in services/creator_summary.py; what counts as missing is
defined in services/creator_gaps.py.
"""

from typing import Literal, Optional
from uuid import UUID

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
    list_id: Optional[UUID] = None
    


class MissingCell(BaseModel):
    """One field on one platform: creators it applies to, and how many lack it."""

    applicable: int
    missing: int


class PlatformSummary(BaseModel):
    """One heatmap row: a platform's count, how many have gaps, a cell per field."""

    platform: PlatformChoices
    total: int
    with_gaps: int
    cells: dict[MissingField, MissingCell]


class Totals(BaseModel):
    """Creators on the selected platforms, and how many have at least one gap."""

    total: int
    with_gaps: int


class FieldTotal(BaseModel):
    """One field bar: that field's cells added up over the selected platforms."""

    key: MissingField
    applicable: int
    missing: int


class SummaryOption(BaseModel):
    """A dropdown entry and how many creators it matches."""

    value: str
    count: int


class SummaryOptions(BaseModel):
    """Entries and counts for the platform, category and language dropdowns."""

    platforms: list[SummaryOption]
    categories: list[SummaryOption]
    languages: list[SummaryOption]


class CreatorSummary(BaseModel):
    """Everything the Creators dashboard shows, in one response.

    `platforms` always lists every platform (the heatmap rows); `totals` and
    `fields` add up only the selected ones.
    """

    platforms: list[PlatformSummary]
    totals: Totals
    fields: list[FieldTotal]
    options: SummaryOptions
