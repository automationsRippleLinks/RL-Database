from typing import Optional

from pydantic import BaseModel

from app.models.ingest_job import IngestJobBase, IngestSource


class RowError(BaseModel):
    row: int = 0
    field: Optional[str] = None
    message: str

class IngestJobOut(IngestJobBase):
    errors: list[RowError] = []

class IngestJobList(BaseModel):
    jobs: list[IngestJobOut]

class IngestSourceInfo(BaseModel):
    source: IngestSource
    label: str
    row_count: int
    last_job: Optional[IngestJobOut] = None