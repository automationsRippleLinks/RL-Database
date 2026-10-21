"""Ingest jobs: one row per uploaded sheet export, whether dry run or commit.

A commit is a second job pointing at its dry run (`parent_job_id`). It reuses the
dry run's rows and AI output instead of taking a new upload or asking the AI again.
"""

from typing import Optional, Any
from uuid import UUID, uuid4
from datetime import datetime, UTC
from enum import Enum

from pydantic import AwareDatetime
from sqlmodel import SQLModel, String, Field, text, func, Relationship
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB


class JobStatus(str, Enum):
    """Where an ingest job (or an Apify run, which reuses this) stands."""

    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class IngestSource(str, Enum):
    """Which sheet an upload comes from; picks the parser in services/ingest."""

    pitch_master = "pitch_master"
    campaign_master = "campaign_master"
    pitch_creator = "pitch_creator"
    campaign_creator = "campaign_creator"
    creator = "creator"


def _jsonb(nullable: bool, default: str | None = None) -> Column:
    """A JSONB column; `default` is the server default as SQL text, e.g. "[]"."""
    return Column(JSONB, nullable=nullable, server_default=default)


class IngestJobBase(SQLModel):
    """The job columns the API returns (IngestJobOut); the big payloads stay off it."""

    job_id: UUID = Field(
        default_factory=uuid4,
        unique=True,
        index=True,
        sa_column_kwargs={"server_default": text("uuidv4()")},
    )
    source: IngestSource = Field(sa_type=String, nullable=False, index=True)
    origin: str = Field(nullable=False)  # "upload" or "commit"
    status: JobStatus = Field(
        default=JobStatus.QUEUED, sa_type=String, nullable=False, index=True
    )
    dry_run: bool = Field(default=False, sa_column_kwargs={"server_default": "false"})
    # false = judgement cells were matched to allowed values as typed, with no AI call
    use_ai: bool = Field(default=True, sa_column_kwargs={"server_default": "true"})
    file_name: Optional[str] = None
    started_by: Optional[str] = None
    parent_job_id: Optional[UUID] = Field(
        default=None, foreign_key="ingest_job.job_id", nullable=True
    )

    started_at: AwareDatetime = Field(
        default_factory=lambda: datetime.now(UTC),
        nullable=False,
        sa_column_kwargs={"server_default": func.now()},
    )
    finished_at: Optional[AwareDatetime] = Field(default=None, nullable=True)

    received: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    inserted: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    updated: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    skipped: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    failed: int = Field(default=0, sa_column_kwargs={"server_default": "0"})

    errors: list[dict[str, Any]] = Field(
        default_factory=list, sa_column=_jsonb(nullable=False, default="[]")
    )
    # only the first MAX_STORED_ERRORS are kept; this counts the ones dropped
    errors_truncated: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    message: Optional[str] = None
    ai_usage: Optional[dict[str, Any]] = Field(
        default=None, sa_column=_jsonb(nullable=True)
    )


class IngestJob(IngestJobBase, table=True):
    """The job table, with the payloads the API defers.

    `rows` is the uploaded data (upload jobs only; a commit reads its parent's).
    `ai_output` is the AI's answer per row, kept on dry runs for the commit to reuse.
    """

    __tablename__ = "ingest_job"

    id: Optional[int] = Field(default=None, primary_key=True)

    rows: Optional[list[dict[str, Any]]] = Field(
        default=None, sa_column=_jsonb(nullable=True)
    )

    ai_output: Optional[dict[str, Any]] = Field(
        default=None, sa_column=_jsonb(nullable=True)
    )

    parent_job: "IngestJob" = Relationship(
        back_populates="child_jobs",
        sa_relationship_kwargs={"remote_side": "IngestJob.job_id"},
    )
    child_jobs: list["IngestJob"] = Relationship(back_populates="parent_job")
