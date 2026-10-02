from enum import Enum
from typing import Optional, Any
from datetime import datetime, UTC

from pydantic import AwareDatetime
from sqlmodel import SQLModel, Field, String, func

from .ingest_job import JobStatus, _jsonb


class RunTrigger(str, Enum):
    MANUAL = "manual"
    SCHEDULE = "schedule"


class ApifyRunBase(SQLModel):
    run_id: str = Field(unique=True, index=True)
    actor: str = Field(index=True)
    trigger: RunTrigger = Field(sa_type=String)

    status: JobStatus = Field(default=JobStatus.RUNNING, sa_type=String, index=True)
    apify_status: Optional[str] = None
    started_by: Optional[str] = None
    started_at: AwareDatetime = Field(
        default_factory=lambda: datetime.now(UTC),
        nullable=False,
        sa_column_kwargs={"server_default": func.now()},
    )
    finished_at: Optional[AwareDatetime] = Field(default=None, nullable=True)

    items: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    updated: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    errors: list[dict[str, Any]] = Field(
        default_factory=list, sa_column=_jsonb(nullable=False, default="[]")
    )
    message: Optional[str] = None


class ApifyRun(ApifyRunBase, table=True):
    __tablename__ = "apify_run"

    id: Optional[int] = Field(default=None, primary_key=True)

    claimed_at: Optional[AwareDatetime] = Field(default=None, nullable=True)
    run_input: dict[str, Any] = Field(
        default_factory=dict, sa_column=_jsonb(nullable=False, default="{}")
    )
