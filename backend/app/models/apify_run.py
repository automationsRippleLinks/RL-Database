"""One row per Apify scraper run we start, and how it ended.

`status` reuses the ingest job's JobStatus; `apify_status` is Apify's own word for
the run (READY, RUNNING, SUCCEEDED, ...).
"""

from enum import Enum
from typing import Optional, Any
from datetime import datetime, UTC

from pydantic import AwareDatetime
from sqlmodel import SQLModel, Field, String, func

from .ingest_job import JobStatus, _jsonb


class RunTrigger(str, Enum):
    """Who started a run: someone on the Apify page, or the scheduled stats refresh."""
    MANUAL = "manual"
    SCHEDULE = "schedule"


class ApifyRunBase(SQLModel):
    """The run columns the API returns (ApifyRunOut); the table adds internal ones."""
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

    # itmes = dataset items Apify returned, updated = creators the handler changed
    items: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    updated: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    errors: list[dict[str, Any]] = Field(
        default_factory=list, sa_column=_jsonb(nullable=False, default="[]")
    )
    message: Optional[str] = None


class ApifyRun(ApifyRunBase, table=True):
    """The run table, plus what the API leaves out: the worker's claim, the input."""
    __tablename__ = "apify_run"

    id: Optional[int] = Field(default=None, primary_key=True)

    # set while a worker processes the run; a claim older than STALE_RUNNING_MINUTES
    # counts as abandoned and can be taken again
    claimed_at: Optional[AwareDatetime] = Field(default=None, nullable=True)
    run_input: dict[str, Any] = Field(
        default_factory=dict, sa_column=_jsonb(nullable=False, default="{}")
    )
