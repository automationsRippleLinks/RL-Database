"""Who changed what, and when -- one row per save, delete or add.

'changes' holds only the field(s) that changed, ex: {"followers": {"from": 1200, "to": 1500}}.
A delete stores the whole row as "from", so nothing is lost for good.
'user_name' is copied in so the history still reads right after a rename.
"""

from typing import Optional, Any
from datetime import datetime, UTC

from pydantic import AwareDatetime
from sqlmodel import SQLModel, Field, text, func, Index
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB


class EditLog(SQLModel, table=True):
    __tablename__ = "edit_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    kind: str = Field(nullable=False)  # "creator", "campaign_creator", "user", ...
    record_id: str = Field(nullable=False)  # "<id>" or "<parent id>/<creator id>"
    action: str = Field(nullable=False)  # "create" | "update" | "delete"
    changes: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=text("'{}'::jsonb")),
    )
    user_id: Optional[int] = Field(
        default=None, foreign_key="user.id", nullable=True, ondelete="SET NULL"
    )
    user_name: str = Field(nullable=False)
    at: AwareDatetime = Field(
        default_factory=lambda: datetime.now(UTC),
        nullable=False,
        sa_column_kwargs={"server_default": func.now()},
    )

    __table_args__ = (
        Index("ix_edit_log_record", "kind", "record_id", "at"),
        Index("ix_edit_log_at", "at"),
    )
