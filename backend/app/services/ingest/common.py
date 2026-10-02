from dataclasses import dataclass, field
from types import UnionType
from typing import Any, Callable, get_args, get_origin, Union, Iterable
from decimal import Decimal
from datetime import timedelta, date
from uuid import UUID

from sqlmodel import SQLModel, select, col
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.config import settings
from app.schemas.ingest import RowError
from app.models import Category, Language, Brand, Creator
from . import cells


@dataclass
class Record:
    row: int
    data: dict[str, Any]
    ai_input: dict[str, Any]
    ai: dict[str, Any] = field(default_factory=dict)


class RowReader:
    def __init__(self, raw: dict, row: int, errors: list[RowError]):
        self.raw, self.row, self.errors = raw, row, errors

    def get(
        self, key: str, parse: Callable = cells.text, required: bool = False, **kw
    ) -> Any:
        try:
            value = parse(self.raw.get(key), **kw)
        except ValueError as e:
            return self.fail(key, str(e))
        if required and value in ("", None, 0, []):
            return self.fail(key, "missing")
        return value

    def fail(self, field_name: str, message: str) -> None:
        self.errors.append(RowError(row=self.row, field=field_name, message=message))
        return None


_BY_TYPE: dict[type, Callable] = {
    int: cells.whole,
    bool: cells.flag,
    Decimal: cells.decimal,
    timedelta: cells.duration,
    date: cells.day,
    list: cells.names,
    str: cells.text,
}


def _base_type(annotation: Any) -> type:
    args = [a for a in get_args(annotation) if a is not type(None)]
    if get_origin(annotation) in (UnionType, Union) and len(args) == 1:
        annotation = args[0]
    return get_origin(annotation) or annotation


def read_columns(r: RowReader, model: type[SQLModel], skip: set[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for column in model.__table__.columns:
        if column.name in skip:
            continue
        kind = _base_type(model.model_fields[column.name].annotation)
        kw = {}
        if kind is Decimal and column.name.endswith(("_perc", "_rate_content")):
            kw["max_value"] = 100
        value = r.get(column.name, _BY_TYPE[kind], **kw)
        if kind is str and value == "" and column.nullable:
            value = None
        out[column.name] = value
    return out


@dataclass
class Taxonomy:
    categories: dict[str, int]
    languages: dict[str, int]


async def load_taxonomy(session: AsyncSession) -> Taxonomy:
    async def names(model) -> dict[str, int]:
        return {
            n: i for i, n in (await session.exec(select(model.id, model.name))).all()
        }

    return Taxonomy(categories=await names(Category), languages=await names(Language))


async def bulk_insert(
    session: AsyncSession, model, rows: list[dict], **conflict
) -> int:
    if not rows:
        return 0
    chunk = max(1, settings.PG_MAX_PARAMS // len(rows[0]))
    written = 0
    for i in range(0, len(rows), chunk):
        stmnt = pg_insert(model).values(rows[i : i + chunk])
        if conflict:
            pk = list(model.__table__.primary_key.columns)[0]
            stmnt = stmnt.on_conflict_do_nothing(**conflict).returning(pk)
            written += len((await session.exec(stmnt)).all())
        else:
            await session.exec(stmnt)
            written += len(rows[i : i + chunk])
    return written


async def brand_ids(
    session: AsyncSession, brands: dict[str, str]
) -> tuple[dict[str, int], int]:
    if not brands:
        return {}, 0
    created = await bulk_insert(
        session,
        Brand,
        [{"name": k, "display_name": v} for k, v in sorted(brands.items())],
        index_elements=["name"],
    )
    rows = await session.exec(
        select(Brand.name, Brand.id).where(col(Brand.name).in_(brands))
    )
    return dict(rows.all()), created


async def creator_ids(
    session: AsyncSession, creators: dict[tuple, dict]
) -> tuple[dict[tuple, UUID], int]:
    if not creators:
        return {}, 0
    created = await bulk_insert(
        session,
        Creator,
        [creators[k] for k in sorted(creators, key=lambda k: (k[0].value, k[1]))],
        index_elements=["platform", "username"],
    )

    usernames = sorted({u for _, u in creators})
    found: dict[tuple, UUID] = {}
    for i in range(0, len(usernames), 1000):
        stmnt = select(Creator.platform, Creator.username, Creator.id).where(
            col(Creator.username).in_(usernames[i : i + 1000])
        )
        for platform, username, cid in (await session.exec(stmnt)).all():
            if (platform, username) in creators:
                found[(platform, username)] = cid
    return found, created


async def link_taxonomy(
    session: AsyncSession, link_model, fk: str, pairs: Iterable[tuple[UUID, int]]
) -> int:
    rows = [
        {"creator_id": c, fk: t}
        for c, t in sorted(set(pairs), key=lambda p: (str(p[0]), p[1]))
    ]
    return await bulk_insert(
        session, link_model, rows, index_elements=["creator_id", fk]
    )


def duplicates(
    records: list[Record], key: Callable[[Record], Any], what: str
) -> list[RowError]:
    first: dict[Any, int] = {}
    errors = []
    for rec in records:
        k = key(rec)
        if k in first:
            errors.append(
                RowError(
                    row=rec.row, field=what, message=f"same {what} as row {first[k]}"
                )
            )
        else:
            first[k] = rec.row
    return errors
