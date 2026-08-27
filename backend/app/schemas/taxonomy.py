from typing import Literal

from pydantic import BaseModel, Field, field_validator


#: Which table a request is about. Both are the same shape -- an id and a unique
#: name -- so one set of handlers serves both rather than four near-identical
#: copies drifting apart.
TaxonomyKind = Literal["categories", "languages"]


class TaxonomyTerm(BaseModel):
    id: int
    name: str
    #: How many creators are linked. Drives the "N creators still use this"
    #: message when a delete is refused, and orders the list by usefulness.
    creator_count: int = 0


class TaxonomyList(BaseModel):
    kind: TaxonomyKind
    terms: list[TaxonomyTerm]


class TaxonomyTermWrite(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def _tidy(cls, v: str) -> str:
        """Collapse whitespace and reject a blank.

        Names are matched case-insensitively everywhere, but the casing typed
        here is what gets stored and displayed, so it is preserved as-is.
        """
        cleaned = " ".join(v.split())
        if not cleaned:
            raise ValueError("name cannot be blank")
        return cleaned
