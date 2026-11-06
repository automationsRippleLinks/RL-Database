"""Shapes for Lists: what the browser sends and what the backend sends back.

Field names match the frontend's types/api.ts exactly (ListSummary, ListDetail ...),
so the JSON can be used as is. Request bodies reject unknown fields, so a typo in
the frontend shows up as a 422 instead of being silently ignored.
"""

from typing import Literal, Optional
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import PlatformChoices
from app.models.saved_list import MAX_CREATORS_PER_LIST, MAX_NOTE_LENGTH

# the same words as the CHECK constraints in models/saved_list.py
Visibility = Literal["private", "people", "team", "everyone"]
AudienceLevel = Literal["view", "edit"]
Access = Literal["view", "edit", "manage"]
ListStatus = Literal["shortlisted", "contacted", "confirmed", "rejected"]

_MAX_TAGS = 20


def _clean_tags(tags: list[str]) -> list[str]:
    """Lowercase, no leading #, no blanks, no repeats, order kept."""
    seen: dict[str, None] = {}
    for t in tags:
        t = t.strip().lstrip("#").strip().lower()
        if t:
            seen[t[:30]] = None
    return list(seen)


# ---------- small shared pieces ----------


class UserRef(BaseModel):
    """Just enough of a person to show a name."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class TeamRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class Team(TeamRef):
    member_count: int = 0


class PersonRef(UserRef):
    """A colleague in the share dialog's picker."""

    email: str
    team: Optional[TeamRef] = None


class ListShareOut(BaseModel):
    """One person a list is shared with."""

    user: UserRef
    level: AudienceLevel


# ---------- what comes back ----------


class PreviewCreator(BaseModel):
    """A creator for the card's avatar stack."""

    id: UUID
    name: str
    platform: PlatformChoices


class PlatformCount(BaseModel):
    platform: PlatformChoices
    count: int


class ListStats(BaseModel):
    """The numbers in a single list's header."""

    creator_count: int = 0
    total_followers: int = 0
    missing_followers: int = 0
    median_views: Optional[float] = None
    est_cost: float = 0
    missing_cost: int = 0
    median_cpv: Optional[float] = None
    with_gaps: int = 0
    status_counts: dict[ListStatus, int] = {}
    platforms: list[PlatformCount] = []


class ListSummary(BaseModel):
    """A list as a card shows it. `access`, `can_*` are for the person asking."""

    id: UUID
    name: str
    description: Optional[str] = None
    owner: UserRef
    created_at: datetime
    updated_at: datetime
    creator_count: int = 0
    preview: list[PreviewCreator] = []
    visibility: Visibility
    audience_level: AudienceLevel
    shares: list[ListShareOut] = []
    tags: list[str] = []
    access: Access
    health: Optional[int] = None  # 0-100, null for an empty list
    team: Optional[TeamRef] = None
    can_delete: bool
    can_manage: bool
    can_edit: bool


class ListMember(BaseModel):
    """A creator on the list, with where they stand."""

    creator_id: UUID
    status: ListStatus
    note: Optional[str] = None
    added_at: datetime
    added_by: UserRef


class ListDetail(ListSummary):
    """One list opened: the card plus header numbers and the members."""

    stats: ListStats
    members: list[ListMember] = []

class ListIndex(BaseModel):
    """GET /lists: the lists the person can see."""

    lists: list[ListSummary]
    
class PeopleIndex(BaseModel):
    """GET /people: colleagues you can share a list with."""

    people: list[PersonRef]

class ListAddResult(BaseModel):
    added: int
    skipped: int  # already on the list, so left as they were


class ListRemoveResult(BaseModel):
    removed: int
    
class CreatorListRef(BaseModel):
    """One line of a creator's "In lists" section."""

    id: UUID
    name: str
    status: ListStatus


# ---------- what the browser sends ----------


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ListCreateRequest(_Body):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    creator_ids: list[UUID] = Field(default_factory=list, max_length=MAX_CREATORS_PER_LIST)
    tags: list[str] = Field(default_factory=list, max_length=_MAX_TAGS)
    # left out = "team" (or "everyone" for someone with no team)
    visibility: Optional[Visibility] = None

    @field_validator("tags")
    @classmethod
    def _clean(cls, v):
        return _clean_tags(v)


class ListUpdateRequest(_Body):
    """Only what is sent changes."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    tags: Optional[list[str]] = Field(default=None, max_length=_MAX_TAGS)

    @field_validator("tags")
    @classmethod
    def _clean(cls, v):
        return None if v is None else _clean_tags(v)


class CreatorIds(_Body):
    """Body of "add creators" and "remove creators"."""

    creator_ids: list[UUID] = Field(min_length=1, max_length=MAX_CREATORS_PER_LIST)


class ListMemberUpdate(_Body):
    """Only what is sent changes; a note of null (or "") clears the note."""

    status: Optional[ListStatus] = None
    note: Optional[str] = Field(default=None, max_length=MAX_NOTE_LENGTH)


class ShareEntry(_Body):
    user_id: int
    level: AudienceLevel


class ListSharingUpdate(_Body):
    """Replaces the whole sharing setup at once."""

    visibility: Visibility
    audience_level: AudienceLevel = "view"
    shares: list[ShareEntry] = Field(default_factory=list, max_length=200)

    @field_validator("shares")
    @classmethod
    def _no_repeats(cls, v):
        ids = [s.user_id for s in v]
        if len(ids) != len(set(ids)):
            raise ValueError("the same person is listed twice")
        return v
    


class CreatorListsIndex(BaseModel):
    """GET /creators/{id}/lists."""

    lists: list[CreatorListRef]