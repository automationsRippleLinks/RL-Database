from typing import Any

from pydantic import BaseModel

from app.models.apify_run import ApifyRunBase
from app.schemas.ingest import RowError

class ApifyRunCreate(BaseModel):
    actor: str
    run_input: dict[str, Any] = {}

class ApifyRunOut(ApifyRunBase):
    errors: list[RowError] = []