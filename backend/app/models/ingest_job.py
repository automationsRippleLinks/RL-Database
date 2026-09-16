from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime, timezone

from sqlmodel import SQLModel, Field, text, func
from sqlalchemy import Column, DateTime
from sqlalchemy.dialects.postgresql import JSONB


class IngestJob(SQLModel, table=True):
    __tablename__ = "ingest_job"

    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: UUID = Field(
        default_factory=uuid4,
        unique=True,
        index=True,
        sa_column_kwargs={"server_default": text("uuidv4()")},
    )
    source: str = Field(nullable=False, index=True)
    origin: str = Field(nullable=False)
    status: str = Field(nullable=False, index=True)
    dry_run: bool = Field(
        default=False, nullable=False, sa_column_kwargs={"server_default": "false"}
    )
    file_name: Optional[str] = Field(default=None, nullable=True)

    started_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=func.now()
        ),
        default_factory=lambda: datetime.now(timezone.utc),
    )
    finished_at: Optional[datetime] = Field(
        sa_column=Column(DateTime(timezone=True), nullable=True, default=None)
    )
    started_by: Optional[str] = Field(default=None, nullable=True)

    received: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    inserted: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    updated: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    skipped: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )
    failed: int = Field(
        default=0, nullable=False, sa_column_kwargs={"server_default": "0"}
    )

    errors: list[dict] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default="[]"),
    )
    errors_truncated: int = Field(default=0, nullable=False)
    message: Optional[str] = Field(default=None, nullable=True)
