"""creator: a plain list of creators, with no pitch or campaign behind them.

New creators are inserted whole. For creators already in the database the
file only fills gaps: empty fields get a value, contacts / categories /
languages / tags / brands are added, nothing is overwritten.
"""

from typing import Any

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
)
from app.schemas.ingest import RowError
from .creators import CREATOR_AI, creator_fields
from .common import Record, RowReader, duplicates, Taxonomy, bulk_insert, link_taxonomy
from . import cells

# set on an existing creator only where the field is still empty
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


class DirectCreator:
    """The `creator` ingest source: a plain creator list (see the module docstring)."""

    label = "Creators"
    table = Creator
    ai = CREATOR_AI

    def parse(self, rows: list[dict]) -> tuple[list[Record], list[RowError]]:
        """Read each row into the creator, their tags, brands."""

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
                    },
                    ai_input={k: cells.text(raw.get(k)) for k in self.ai.covers},
                )
            )
        return records, errors

    def apply_ai(self, rec: Record):
        """Copy the AI's gender, location, categories and languages onto the record."""

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
        """Creators listed twice, and unknown brands (this file never adds brands)."""

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
        """Insert new creators, fill gaps in existing ones, add links."""

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

        counts = {
            "inserted": len(new),
            "updated": updated,
            "skipped": len(existing) - updated,
        }
        links = ", ".join(f"{n} {kind}" for kind, n in added.items())
        return counts, (
            f"{len(new)} creators added, {updated} existing creators filled in, "
            f"{counts['skipped']} unchanged; links added: {links}."
        )

    @staticmethod
    def _fill(c: Creator, incoming: dict[str, Any]) -> bool:
        """Fill empty fields and add new contacts. Returns whether anything changed."""

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
        """Get-or-create tags; matched case-insensitively, first spelling wins."""

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
