"""Request and response shapes for the Apify routes."""

from typing import Any

from pydantic import BaseModel

from app.models.apify_run import ApifyRunBase
from app.schemas.ingest import RowError


class ApifyRunCreate(BaseModel):
    """Start a run: an actor we have a result handler for, and its input."""

    actor: str
    run_input: dict[str, Any] = {}


class ApifyRunOut(ApifyRunBase):
    """An Apify run as the API returns it, with its stored errors typed."""

    errors: list[RowError] = []
