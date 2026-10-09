"""Numbers for the Creators data dashboard (Analytics -> Creators).

Three queries, all counted by the database:
  1. one row per platform, with every field's applicable / missing counts;
     the dashboard's totals and field bars are those rows added up;
  2. creators per category, 3. creators per language, for the dropdown counts.

Each dropdown's counts ignore that dropdown's own filter (otherwise ticking
"Beauty" would make every other category read 0). The platform rows ignore the
platform filter, so the heatmap always shows every platform.
"""

from sqlmodel import col, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Creator

from app.schemas.analytics import (
    CreatorSummary,
    CreatorSummaryRequest,
    FieldTotal,
    MissingCell,
    PlatformSummary,
    SummaryOption,
    SummaryOptions,
    Totals,
)
from app.services import creator_gaps as gaps


def _scope(
    req: CreatorSummaryRequest, *, platforms=False, categories=True, languages=True
):
    """The WHERE conditions for the filters that apply to this query."""
    conds = [
        col(Creator.is_active) == req.is_active if req.is_active is not None else None,
        (
            col(Creator.platform).in_(req.platforms)
            if platforms and req.platforms
            else None
        ),
        gaps.term_filter("categories", req.categories) if categories else None,
        gaps.term_filter("languages", req.languages) if languages else None,
    ]
    return [c for c in conds if c is not None]


async def _by_term(session: AsyncSession, req, kind: str) -> list[SummaryOption]:
    link, term, fk = gaps._TERMS[kind]
    conds = _scope(
        req,
        platforms=True,
        categories=kind != "categories",
        languages=kind != "languages",
    )
    rows = (
        await session.exec(
            select(col(term.name), func.count(func.distinct(Creator.id)))
            .select_from(Creator)
            .join(link, col(link.creator_id) == Creator.id)
            .join(term, col(term.id) == col(fk))
            .where(*conds)
            .group_by(col(term.name))
        )
    ).all()
    none_count = (
        await session.exec(
            select(func.count())
            .select_from(Creator)
            .where(*conds, gaps.is_missing(kind))
        )
    ).one()
    out = [
        SummaryOption(value=n, count=c)
        for n, c in sorted(rows, key=lambda r: (-r[1], r[0]))
    ]
    if none_count:
        out.append(SummaryOption(value=gaps.NONE_VALUE, count=none_count))
    return out


async def creator_summary(
    session: AsyncSession, req: CreatorSummaryRequest
) -> CreatorSummary:
    columns = [
        col(Creator.platform),
        func.count().label("total"),
        func.count().filter(gaps.any_missing()).label("with_gaps"),
    ]
    for f in gaps.FIELDS:
        columns.append(func.count().filter(gaps.applies(f)).label(f"{f}__applicable"))
        columns.append(func.count().filter(gaps.is_missing(f)).label(f"{f}__missing"))

    result = (
        await session.exec(
            select(*columns).where(*_scope(req)).group_by(col(Creator.platform))
        )
    ).all()

    platforms = [
        PlatformSummary(
            platform=r[0],
            total=r[1],
            with_gaps=r[2],
            cells={
                f: MissingCell(applicable=r[3 + 2 * i], missing=r[4 + 2 * i])
                for i, f in enumerate(gaps.FIELDS)
            },
        )
        for r in result
    ]
    platforms.sort(key=lambda p: -p.total)

    shown = [p for p in platforms if not req.platforms or p.platform in req.platforms]
    return CreatorSummary(
        platforms=platforms,
        totals=Totals(
            total=sum(p.total for p in shown), with_gaps=sum(p.with_gaps for p in shown)
        ),
        fields=[
            FieldTotal(
                key=f,
                applicable=sum(p.cells[f].applicable for p in shown),
                missing=sum(p.cells[f].missing for p in shown),
            )
            for f in gaps.FIELDS
        ],
        options=SummaryOptions(
            platforms=[
                SummaryOption(value=p.platform.value, count=p.total) for p in platforms
            ],
            categories=await _by_term(session, req, "categories"),
            languages=await _by_term(session, req, "languages"),
        ),
    )
