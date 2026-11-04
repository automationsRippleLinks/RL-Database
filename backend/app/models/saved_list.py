"""Lists: named groups of creators that a person saves, tracks and shares."""

from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime, timezone

from sqlmodel import SQLModel, Field, func, Column, DateTime, String
from sqlalchemy import CheckConstraint, UniqueConstraint, Index

VISIBILITIES = ("private", "people","team","everyone")
AUDIENCE_LEVEL = ("view", "edit")
LIST_STATUSES = ("shortlisted", "contacted","confirmed", "rejected")

MAX_CREATORS_PER_LIST = 2000
MAX_NOTE_LENGTH = 500

def _in(column: str, choices: tuple[str, ...]) -> str:
    """ sql ctext for a check : 'column IN ('a' , 'b').'"""
    return f"{column} IN ({', '.join(repr(c) for c in choices)})"
def _now() -> datetime:
    return datetime.now(timezone.utc)

        
        
class SavedList(SQLModel, table=  True):
    """ one list . ewho may open it is decided by visibility plus list share rowa."""
    
    __tablename__="list"
    __table_args__ = (
        UniqueConstraint("owner_id", "name", name="uq_list_owner_name"),
        CheckConstraint(_in("visibility", VISIBILITIES), name="ck_list_visibility"),
        CheckConstraint(
            _in("audience_level", AUDIENCE_LEVEL), name="ck_list_audience_level"
        ),
    )
    
    id: UUID=Field(default_factory=uuid4, primary_key=True)
    name: str = Field(nullable=False)
    description: Optional[str]= Field(default=None, nullable=True)
    owner_id: int=Field(foreign_key="user.id", nullable=False, index=True)

    visibility: str =Field(default="team", nullable=False, sa_column_kwargs={"server_default": "team"})
    
    audience_level: str= Field( default="view", nullable=False, sa_column_kwargs={"server_default": "view"})

    team_id: Optional[int] = Field(
        default=None, foreign_key="team.id", nullable=True ,ondelete="SET NULL"
    )

    created_at :datetime= Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=func.now()
        ),
        default_factory=_now,
    )
    
    updated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=func.now()
        ),
        default_factory=_now,
    )
    
    
class ListCreator(SQLModel, table= True):
    """ a creator on a list , with where they stand and short note."""

    __tablename__="list_creator"
    __table_args__ = (
        CheckConstraint(_in("status", LIST_STATUSES), name="ck_list_creator_status"),
        Index("ix_list_creator_creator_id", "creator_id"),
    )
    
    list_id: UUID = Field(
        foreign_key="list.id", primary_key=True, ondelete="CASCADE"
    )
    creator_id: UUID = Field(
        foreign_key="creator.id", primary_key=True, ondelete="CASCADE"
    )
    
    status: str = Field(
        default="shortlisted",
        nullable=False,
        sa_column_kwargs={"server_default": "shortlisted"},
    )
    
    note: Optional[str] = Field(
        default=None, sa_column=Column(String(MAX_NOTE_LENGTH), nullable=True)
    )
    
    added_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=func.now()
        ),
        default_factory=_now,
    )
    added_by_id: int = Field(foreign_key="user.id", nullable=False)

class ListShare(SQLModel, table=True):
    """One person a list is shared with ("people" visibility), and at what level."""

    __tablename__ = "list_share"
    __table_args__ = (
        CheckConstraint(_in("level", AUDIENCE_LEVEL), name="ck_list_share_level"),
        Index("ix_list_share_user_id", "user_id"),
    )

    list_id: UUID = Field(
        foreign_key="list.id", primary_key=True, ondelete="CASCADE"
    )
    user_id: int = Field(foreign_key="user.id", primary_key=True, ondelete="CASCADE")
    level: str = Field(
        default="view", nullable=False, sa_column_kwargs={"server_default": "view"}
    )


class ListTag(SQLModel, table=True):
    """A free label on a list, stored lowercase without the leading #."""

    __tablename__ = "list_tag"

    list_id: UUID = Field(
        foreign_key="list.id", primary_key=True, ondelete="CASCADE"
    )
    tag: str = Field(primary_key=True)