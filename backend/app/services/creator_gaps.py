"""What counts as a missing detail on a creator, written once.

The dashboard's counts (services/creator_summary.py) and the table's `missing`
filter and `gaps_*` sorts (services/search.py) both build their SQL from here,
so a number on the dashboard and the rows behind it can never disagree.

The rules:
  followers  missing when empty or < 1            (0 is how an unknown value is stored)
  avg_views  same, but only for Instagram and YouTube (elsewhere it does not apply)
  emails / phones      missing when the list is empty
  gender / city / state missing when empty or only spaces
  categories / languages missing when the creator has none linked
"""

from typing import Optional, Sequence

from sqlalchemy import ColumnElement, Integer, case, cast, literal
from sqlmodel import and_, col, exists, func, or_, select

from app.models import (
    Category,
    CategoryCreatorLink,
    Creator,
    Language,
    LanguageCreatorLink,
)
from app.models.enums import PlatformChoices

#: Order matters: it is the order of the heatmap columns.
FIELDS = (
    "followers",
    "avg_views",
    "emails",
    "phones",
    "gender",
    "city",
    "state",
    "categories",
    "languages",
)

#: Wire value the filters use for "creators with none of these".
NONE_VALUE = "__none__"

_VIEWS_PLATFORMS = (PlatformChoices.INSTAGRAM, PlatformChoices.YOUTUBE)

_TERMS = {
    "categories": (CategoryCreatorLink, Category, CategoryCreatorLink.category_id),
    "languages": (LanguageCreatorLink, Language, LanguageCreatorLink.language_id),
}


def _blank(column) -> ColumnElement:
    return func.coalesce(func.btrim(col(column)), "") == ""


def _no_items(array_column) -> ColumnElement:
    return func.coalesce(func.cardinality(col(array_column)), 0) == 0


def _has_none(kind: str) -> ColumnElement:
    link = _TERMS[kind][0]
    return ~exists(
        select(link.creator_id)
        .where(col(link.creator_id) == Creator.id)
        .correlate(Creator)
    )


def applies(field: str) -> ColumnElement:
    """Does this detail make sense for the creator at all?"""
    if field == "avg_views":
        return col(Creator.platform).in_(_VIEWS_PLATFORMS)
    return literal(True)


def is_missing(field: str) -> ColumnElement:
    """True when the creator is missing this detail (and it applies to them)."""
    if field == "followers":
        return func.coalesce(col(Creator.followers), 0) < 1
    if field == "avg_views":
        return and_(applies(field), func.coalesce(col(Creator.avg_views), 0) < 1)
    if field == "emails":
        return _no_items(Creator.emails)
    if field == "phones":
        return _no_items(Creator.phones)
    if field in ("gender", "city", "state"):
        return _blank(getattr(Creator, field))
    if field in _TERMS:
        return _has_none(field)
    raise ValueError(f"unknown field {field!r}")


def any_missing() -> ColumnElement:
    return or_(*[is_missing(f) for f in FIELDS])


def gap_count() -> ColumnElement:
    """How many details this creator is missing (0..9)."""
    return sum(
        (cast(case((is_missing(f), 1), else_=0), Integer) for f in FIELDS),
        start=literal(0),
    )


def missing_filter(value: Optional[str]) -> Optional[ColumnElement]:
    """The table's `missing` filter: 'any', or one field's name. None = no filter."""
    if not value:
        return None
    if value == "any":
        return any_missing()
    return is_missing(value) if value in FIELDS else None


def term_filter(kind: str, names: Sequence[str]) -> Optional[ColumnElement]:
    """Category / language filter that also understands '__none__' (= has none).

    Ticking several means ANY of them, like the rest of the creator filters.
    """
    link, term, fk = _TERMS[kind]
    wanted = [n.strip().lower() for n in names if n and n.strip() and n != NONE_VALUE]
    parts: list[ColumnElement] = []
    if wanted:
        parts.append(
            exists(
                select(link.creator_id)
                .join(term, col(term.id) == col(fk))
                .where(
                    col(link.creator_id) == Creator.id,
                    func.lower(col(term.name)).in_(wanted),
                )
                .correlate(Creator)
            )
        )
    if NONE_VALUE in names:
        parts.append(_has_none(kind))
    if not parts:
        return None
    return parts[0] if len(parts) == 1 else or_(*parts)
