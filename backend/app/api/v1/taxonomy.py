"""CRUD for the category and language vocabularies.

Ingest used to create these rows on demand, so a typo in one spreadsheet became
a permanent facet. It now rejects anything it doesn't recognise, which only
works if there is a way to add the terms that *are* real -- this is it.

Both tables are (id, unique name) and are used identically, so one set of
handlers is parameterised over them rather than duplicated.
"""

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select, col, func
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import SessionDep, CurrentUser, IngestUser, CSRFProtected, RedisDep
from app.core.cache import invalidate
from app.core.config import settings
from app.models import (
    Category,
    Language,
    CategoryCreatorLink,
    LanguageCreatorLink,
)
from app.schemas.taxonomy import (
    TaxonomyKind,
    TaxonomyList,
    TaxonomyTerm,
    TaxonomyTermWrite,
)

router = APIRouter()

#: kind -> (term model, link model, foreign key column name, singular label)
_TABLES = {
    "categories": (Category, CategoryCreatorLink, "category_id", "category"),
    "languages": (Language, LanguageCreatorLink, "language_id", "language"),
}


def _tables(kind: TaxonomyKind) -> dict:
    return _TABLES[kind]


def _usage(link_model, fk_name: str, term_model):
    """Correlated count of creators linked to each term."""
    return (
        select(func.count())
        .select_from(link_model)
        .where(col(getattr(link_model, fk_name)) == term_model.id)
        .correlate(term_model)
        .scalar_subquery()
    )


async def _get_or_404(session: AsyncSession, model, term_id: int, label: str):
    term = await session.get(model, term_id)
    if term is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"No such {label}"
        )
    return term


async def _reject_duplicate(
    session: AsyncSession, model, name: str, label: str, exclude_id: int | None = None
) -> None:
    """Names are matched case-insensitively by ingest, so guard the same way.

    A UNIQUE index on `name` would happily accept "Comedy" alongside "comedy",
    and the two would then compete for every row the sheets produce.
    """
    stmnt = select(model.id).where(func.lower(col(model.name)) == name.lower())
    if exclude_id is not None:
        stmnt = stmnt.where(col(model.id) != exclude_id)
    if (await session.exec(stmnt)).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A {label} named {name!r} already exists",
        )


async def _invalidate(redis) -> None:
    """The creator facets are cached for 24h; a rename would otherwise linger."""
    await invalidate(
        redis, settings.FACETS_PREFIX, settings.SEARCH_PREFIX, settings.SUGGEST_PREFIX
    )


@router.get("/{kind}", response_model=TaxonomyList)
async def list_terms(kind: TaxonomyKind, session: SessionDep, user: CurrentUser):
    model, link_model, fk_name, _ = _tables(kind)
    usage = _usage(link_model, fk_name, model).label("creator_count")

    rows = (
        await session.exec(
            select(model.id, model.name, usage).order_by(
                usage.desc(), col(model.name)
            )
        )
    ).all()
    return TaxonomyList(
        kind=kind,
        terms=[
            TaxonomyTerm(id=i, name=n, creator_count=c or 0) for i, n, c in rows
        ],
    )


@router.post(
    "/{kind}",
    response_model=TaxonomyTerm,
    status_code=status.HTTP_201_CREATED,
    dependencies=[CSRFProtected],
)
async def create_term(
    kind: TaxonomyKind,
    body: TaxonomyTermWrite,
    session: SessionDep,
    redis: RedisDep,
    user: IngestUser,
):
    model, _, _, label = _tables(kind)
    await _reject_duplicate(session, model, body.name, label)

    term = model(name=body.name)
    session.add(term)
    await session.commit()
    await session.refresh(term)
    await _invalidate(redis)
    return TaxonomyTerm(id=term.id, name=term.name, creator_count=0)


@router.patch(
    "/{kind}/{term_id}", response_model=TaxonomyTerm, dependencies=[CSRFProtected]
)
async def rename_term(
    kind: TaxonomyKind,
    term_id: int,
    body: TaxonomyTermWrite,
    session: SessionDep,
    redis: RedisDep,
    user: IngestUser,
):
    model, link_model, fk_name, label = _tables(kind)
    term = await _get_or_404(session, model, term_id, label)
    await _reject_duplicate(session, model, body.name, label, exclude_id=term_id)

    # Renaming keeps every creator link -- the id is what they point at. That is
    # the whole reason this is a table and not a string column.
    term.name = body.name
    session.add(term)
    await session.commit()
    await session.refresh(term)
    await _invalidate(redis)

    count = (
        await session.exec(
            select(func.count())
            .select_from(link_model)
            .where(col(getattr(link_model, fk_name)) == term_id)
        )
    ).one()
    return TaxonomyTerm(id=term.id, name=term.name, creator_count=count)


@router.delete(
    "/{kind}/{term_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[CSRFProtected],
)
async def delete_term(
    kind: TaxonomyKind,
    term_id: int,
    session: SessionDep,
    redis: RedisDep,
    user: IngestUser,
):
    model, link_model, fk_name, label = _tables(kind)
    await _get_or_404(session, model, term_id, label)

    count = (
        await session.exec(
            select(func.count())
            .select_from(link_model)
            .where(col(getattr(link_model, fk_name)) == term_id)
        )
    ).one()
    if count:
        # Deleting would orphan the links and silently strip the term from every
        # one of those creators. Rename it or clear the links first.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{count} creator{'s' if count != 1 else ''} still use this "
                f"{label}. Rename it instead, or unlink those creators first."
            ),
        )

    await session.delete(await session.get(model, term_id))
    await session.commit()
    await _invalidate(redis)
