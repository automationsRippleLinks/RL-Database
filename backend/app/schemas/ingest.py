"""Ingest page shapes: jobs, their row errors, and the upload sources."""

from typing import Optional

from pydantic import BaseModel

from app.models.ingest_job import IngestJobBase, IngestSource


class RowError(BaseModel):
    """One problem found by an ingest job or an Apify run.

    For uploads `row` counts from 1, and 0 means the whole file.
    """

    row: int = 0
    field: Optional[str] = None
    message: str


class IngestJobOut(IngestJobBase):
    """A job without its rows and AI output, with its stored errors typed."""

    errors: list[RowError] = []


class IngestJobList(BaseModel):
    """Recent jobs, newest first."""

    jobs: list[IngestJobOut]


class IngestSourceInfo(BaseModel):
    """An upload source: its label, rows in its table now, and its latest job."""

    source: IngestSource
    label: str
    row_count: int
    last_job: Optional[IngestJobOut] = None
