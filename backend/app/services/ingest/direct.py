from typing import Any
from datetime import datetime, UTC
from uuid import uuid4

from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select, col

from app.models import (
    Creator,
    Brand,
    Tag,
    CategoryCreatorLink,
    LanguageCreatorLink,
    BrandCreatorLink,
    TagCreatorLink,
    CommercialPackage,
    PackageDeliverables,
)
from app.schemas.ingest import RowError
from .creators import CREATOR_AI, creator_fields
from .common import Record, RowReader, duplicates, Taxonomy, bulk_insert, link_taxonomy
from . import cells

PACKAGE_NAME = "Standard"

_DELIVERABLES = {
    name: (f"{name}_count", f"{name}_cost")
    for name in (
        "reel",
        "reel_story",
        "video_story",
        "static_carousel",
        "short_form_videos",
        "reshare_short_form_videos",
        "dedicated_video",
        "integrated_video",
    )
}

_EXTRAS = ("rights", "boosting")

_FILLABLE = (
    "name",
    "followers",
    "avg_views",
    "gender",
    "city",
    "state",
    "region",
    "bio",
)


def _package(r: RowReader) -> tuple[int, list[tuple[str, int, int]]] | None:
    items = []
    for name, (count_key, cost_key) in _DELIVERABLES.items():
        count, cost = (
            r.get(count_key, cells.whole) or 0,
            r.get(cost_key, cells.whole) or 0,
        )
        if count or cost:
            items.append((name, count or 1, cost))
    for name in _EXTRAS:
        cost = r.get(f"{name}_cost", cells.whole) or 0
        if cost:
            items.append((name, 1, cost))
    total = r.get("package_cost", cells.whole) or 0
    if not items and not total:
        return None
    if not total:
        r.fail("package_cost", "missing, but the row has deliverables")
        return None
    return total, sorted(items)


class DirectCreator:
    label = "Creators"
    table = Creator
    ai = CREATOR_AI

    def parse(self, rows: list[dict]) -> tuple[list[Record], list[RowError]]:
        records, errors = [], []
        for i, raw in enumerate(rows, start=1):
            r = RowReader(raw, i, errors)
            creator = creator_fields(r, raw)
            if creator is not None:
                creator["bio"] = r.get("bio") or None
            records.append(
                Record(
                    row=i,
                    data={
                        "creator": creator,
                        "tags": r.get("tags", cells.names),
                        "brands": [
                            b.lower() for b in r.get("brands", cells.names) or []
                        ],
                        "package": _package(r),
                    },
                    ai_input={k: cells.text(raw.get(k)) for k in self.ai.covers},
                )
            )
        return records, errors

    def apply_ai(self, rec: Record):
        c = rec.data["creator"]
        for key in ("gender", "city", "state", "region"):
            c[key] = rec.ai[key]
        rec.data["categories"], rec.data["languages"] = (
            rec.ai["categories"],
            rec.ai["languages"],
        )

    async def validate(
        self, session: AsyncSession, records: list[Record]
    ) -> list[RowError]:
        errors = duplicates(
            records,
            lambda r: (r.data["creator"]["platform"], r.data["creator"]["username"]),
            "profile_link",
        )
        wanted = {b for r in records for b in r.data["brands"]}
        known = set(
            (
                await session.exec(
                    select(Brand.name).where(col(Brand.name).in_(wanted))
                )
            ).all()
        )
        for r in records:
            for b in r.data["brands"]:
                if b not in known:
                    errors.append(
                        RowError(
                            row=r.row,
                            field="brands",
                            message=f"no brand {b!r}; brands aren't created from this file",
                        )
                    )
        return errors

    async def write(
        self, session: AsyncSession, records: list[Record], tax: Taxonomy
    ) -> tuple[dict, str]:
        by_key = {
            (r.data["creator"]["platform"], r.data["creator"]["username"]): r
            for r in records
        }

        existing: dict[tuple, Creator] = {}
        usernames = sorted({u for _, u in by_key})
        for i in range(0, len(usernames), 1000):
            for c in (
                await session.exec(
                    select(Creator).where(
                        col(Creator.username).in_(usernames[i : i + 1000])
                    )
                )
            ).all():
                if (c.platform, c.username) in by_key:
                    existing[(c.platform, c.username)] = c

        new = [r.data["creator"] for k, r in by_key.items() if k not in existing]
        await bulk_insert(session, Creator, new)
        ids = {(c["platform"], c["username"]): c["id"] for c in new}

        updated = 0
        for key, c in existing.items():
            ids[key] = c.id
            if self._fill(c, by_key[key].data["creator"]):
                session.add(c)
                updated += 1
        await session.flush()

        tag_ids = await self._tag_ids(
            session, {t for r in records for t in r.data["tags"]}
        )
        brand_ids = dict(
            (
                await session.exec(
                    select(Brand.name, Brand.id).where(
                        col(Brand.name).in_(
                            {b for r in records for b in r.data["brands"]}
                        )
                    )
                )
            ).all()
        )
        pairs: dict[str, set] = {
            "cat": set(),
            "lang": set(),
            "tag": set(),
            "brand": set(),
        }
        for key, r in by_key.items():
            cid = ids[key]
            pairs["cat"] |= {(cid, tax.categories[n]) for n in r.data["categories"]}
            pairs["lang"] |= {(cid, tax.languages[n]) for n in r.data["languages"]}
            pairs["tag"] |= {(cid, tag_ids[t.lower()]) for t in r.data["tags"]}
            pairs["brand"] |= {(cid, brand_ids[b]) for b in r.data["brands"]}
        added = {
            "category": await link_taxonomy(
                session, CategoryCreatorLink, "category_id", pairs["cat"]
            ),
            "language": await link_taxonomy(
                session, LanguageCreatorLink, "language_id", pairs["lang"]
            ),
            "tag": await link_taxonomy(session, TagCreatorLink, "tag_id", pairs["tag"]),
            "brand": await link_taxonomy(
                session, BrandCreatorLink, "brand_id", pairs["brand"]
            ),
        }

        packages = await self._packages(
            session,
            {ids[k]: r.data["package"] for k, r in by_key.items() if r.data["package"]},
        )

        counts = {
            "inserted": len(new),
            "updated": updated,
            "skipped": len(existing) - updated,
        }
        links = ", ".join(f"{n} {kind}" for kind, n in added.items())
        return counts, (
            f"{len(new)} creators added, {updated} existing creators filled in, "
            f"{counts['skipped']} unchanged; links added: {links}; {packages} packages set."
        )

    @staticmethod
    def _fill(c: Creator, incoming: dict[str, Any]) -> bool:
        changed = False
        for field in _FILLABLE:
            if getattr(c, field) in (None, "", 0) and incoming.get(field) not in (
                None,
                "",
                0,
            ):
                setattr(c, field, incoming[field])
                changed = True
        for field in ("emails", "phones"):
            extra = [
                v
                for v in incoming.get(field) or []
                if v not in (getattr(c, field) or [])
            ]
            if extra:
                setattr(c, field, (getattr(c, field) or []) + extra)
                changed = True
        return changed

    @staticmethod
    async def _tag_ids(session: AsyncSession, names: set[str]) -> dict[str, int]:
        if not names:
            return {}
        found = {
            n.lower(): i
            for i, n in (await session.exec(select(Tag.id, Tag.name))).all()
        }
        new = {}
        for n in sorted(names):
            if n.lower() not in found and n.lower() not in new:
                new[n.lower()] = n
        await bulk_insert(
            session,
            Tag,
            [{"name": n} for n in new.values()],
            index_elements=["name"],
        )
        if new:
            found |= {
                n.lower(): i
                for i, n in (
                    await session.exec(
                        select(Tag.id, Tag.name).where(col(Tag.name).in_(new.values()))
                    )
                ).all()
            }
        return found

    @staticmethod
    async def _packages(session: AsyncSession, wanted: dict) -> int:
        if not wanted:
            return 0
        current = (
            await session.exec(
                select(CommercialPackage).where(
                    col(CommercialPackage.creator_id).in_(wanted),
                    col(CommercialPackage.valid_to).is_(None),
                    CommercialPackage.name == PACKAGE_NAME,
                )
            )
        ).all()
        by_creator = {p.creator_id: p for p in current}
        items_now: dict = {}
        if current:
            for pkg_id, kind, qty, price in (
                await session.exec(
                    select(
                        PackageDeliverables.package_id,
                        PackageDeliverables.deliverable_type,
                        PackageDeliverables.quantity,
                        PackageDeliverables.price,
                    ).where(
                        col(PackageDeliverables.package_id).in_([p.id for p in current])
                    )
                )
            ).all():
                items_now.setdefault(pkg_id, []).append((kind, qty, price))

        now = datetime.now(UTC)
        packages, items = [], []
        for creator_id, (cost, deliverables) in wanted.items():
            old = by_creator.get(creator_id)
            if (
                old
                and old.cost == cost
                and sorted(items_now.get(old.id, [])) == deliverables
            ):
                continue
            if old:
                old.valid_to = now
                session.add(old)
            pkg_id = uuid4()
            packages.append(
                {
                    "id": pkg_id,
                    "creator_id": creator_id,
                    "name": PACKAGE_NAME,
                    "cost": cost,
                    "valid_from": now,
                }
            )
            items += [
                {
                    "id": uuid4(),
                    "package_id": pkg_id,
                    "deliverable_type": k,
                    "quantity": q,
                    "price": p,
                }
                for k, q, p in deliverables
            ]
        await session.flush()
        await bulk_insert(session, CommercialPackage, packages)
        await bulk_insert(session, PackageDeliverables, items)
        return len(packages)
