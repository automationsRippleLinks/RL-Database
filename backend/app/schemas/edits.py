"""Request and respone shapes for editing.

The PATCH bodies are generate from the table models, so a new column becomes
editable without touching this file. Every fiedl may be left out (only what is
sent changes); if the table doesn't allow a field to be null, it can't be sent as
null either. Unknown fields are rejected, so a typo in the frontend shows up
as a 422 instead of being silently ignored.
"""

from typing import Any, Optional, Annotated, Literal
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, create_model, ConfigDict, EmailStr, AfterValidator, Field

from app.services.ingest.direct import DeliverableType
from app.services.ingest.creators import REGIONS
from app.models import Creator, Brand, Company, Pitch, Campaign
from app.models.link_models import PitchCreatorLinkBase, CampaignCreatorLinkBase
from app.services.locks import LockHolder

_ALWAYS_FIXED = {"id", "version", "created_at", "updated_at"}

def update_model(name: str, table: type, *, fixed: set[str] = frozenset(), **overrides) -> type[BaseModel]:
    """PATCH body for `table`: its columns minus `fixed`, all optional, plus `version`."""
    fields: dict[str, Any] = {
        # the form sends back the version it loaded; leave it out to skip the check
        "version": (Optional[int], None),
    }
    for field, info in table.model_fields.items():
        if field in _ALWAYS_FIXED | set(fixed):
            continue
        fields[field] = (info.annotation, None)
    for field, spec in overrides.items():
        fields[field] = spec
    return create_model(name, __config__=ConfigDict(extra="forbid"), **fields)


# === creators ===================================================================================================

Email = Annotated[EmailStr, AfterValidator(lambda e: e.strip().lower())]
Phone = Annotated[str, AfterValidator(lambda p: "".join(p.split()))]


class PackageItemWrite(BaseModel):
    deliverable_type: DeliverableType
    quantity: int = Field(default=1, ge=1)
    price: int = Field(default=0, ge=0)


class PackageWrite(BaseModel):
    """The creator's standard package. A change starts a new version; the old one is kept."""

    cost: int = Field(gt=0)
    items: list[PackageItemWrite] = []

CreatorUpdate = update_model(
    "CreatorUpdate",
    Creator,
    fixed={"stats_refreshed_at"},   # only an Apify refresh sets this
    gender=(Optional[Literal["Female", "Male", "Couple", "Community"]], None),
    region=(Optional[Literal[REGIONS]], None),
    emails=(list[Email], None),
    phones=(list[Phone], None),
    # links, each replaced as a whole list
    categories=(list[int], None),
    languages=(list[int], None),
    brands=(list[int], None),
    tags=(list[str], None), # names; new ones are created
    # null closed the current package (the creator no longer has one)
    package=(Optional[PackageWrite], None),
)

BrandUpdate = update_model("BrandUpdate", Brand)
CompanyUpdate = update_model("CompanyUpdate", Company)
PitchUpdate = update_model("PitchUpdate", Pitch)
CampaignUpdate = update_model("CampaignUpdate", Campaign)

# === creators on a pitch / campaign ===============================================

PitchCreatorUpdate = update_model("PitchCreatorUpdate", PitchCreatorLinkBase)
CampaignCreatorUpdate = update_model("CampaignCreatorUpdate", CampaignCreatorLinkBase)


class PitchCreatorAdd(PitchCreatorLinkBase):
    """Add an existing creator to a pitch. Every number defaults to 0."""

    model_config = ConfigDict(extra="forbid")
    creator_id: UUID
    payment_terms: str = "Under 45 days."

class CampaignCreatorAdd(CampaignCreatorLinkBase):
    """Add an existing creator to a campaign."""

    model_config = ConfigDict(extra="forbid")
    creator_id: UUID


# === responses =====================================================================

class EditRecord(BaseModel):
    """A row as the edit form needs it: raw column values (ids, not names) + version."""

    kind: str
    id: str
    version: int
    data: dict[str, Any]


class EditSession(BaseModel):
    """Returned when a form is opened: the lock you now hold and the record to fill it with."""

    lock: LockHolder
    record: EditRecord

class HistoryEntry(BaseModel):
    id: int
    kind: str
    record_id: str
    action: Literal["create", "update", "delete"]
    #: {"field": {"from": old, "to": new}}
    changes: dict[str, Any]
    user_id: Optional[int] = None
    user_name: str
    at: datetime

class CompanyRow(BaseModel):
    id: int
    name: str
    gstin: Optional[str] = None
    brand_count: int = 0