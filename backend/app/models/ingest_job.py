from typing import Optional, Any
from uuid import UUID, uuid4
from datetime import datetime, UTC
from enum import Enum

from pydantic import AwareDatetime
from sqlmodel import SQLModel, String, Field, text, func, Relationship
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class IngestSource(str, Enum):
    pitch_master = "pitch_master"
    campaign_master = "campaign_master"
    pitch_creator = "pitch_creator"
    campaign_creator = "campaign_creator"
    creator = "creator"

def _jsonb(nullable: bool, default: str | None = None) -> Column:
    return Column(JSONB, nullable=nullable, server_default=default)


class IngestJobBase(SQLModel):
    job_id: UUID = Field(
        default_factory=uuid4,
        unique=True,
        index=True,
        sa_column_kwargs={"server_default": text("uuidv4()")},
    )
    source: IngestSource = Field(sa_type=String, nullable=False, index=True)
    origin: str = Field(nullable=False)
    status: JobStatus = Field(
        default=JobStatus.QUEUED, sa_type=String, nullable=False, index=True
    )
    dry_run: bool = Field(default=False, sa_column_kwargs={"server_default": "false"})
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
    errors_truncated: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    message: Optional[str] = None
    ai_usage: Optional[dict[str, Any]] = Field(
        default=None, sa_column=_jsonb(nullable=True)
    )


class IngestJob(IngestJobBase, table=True):
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
