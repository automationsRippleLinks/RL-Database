from typing import Any, Literal, Optional
import re
from uuid import uuid4
from collections import defaultdict

from sqlmodel import select, col
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.config import settings
from app.models import (
    CategoryCreatorLink,
    LanguageCreatorLink,
    PitchCreatorLink,
    Pitch,
    Campaign,
    CampaignCreatorLink,
)
from app.models.enums import TierChoices
from app.schemas.ingest import RowError
from app.services.ingest.common import RowReader, Record
from app.services.profile_link import handle_of, platform_of
from app.services.ai import AISpec
from . import cells
from .common import (
    read_columns,
    duplicates,
    Taxonomy,
    creator_ids,
    link_taxonomy,
    bulk_insert,
)

_TIERS = (
    (20_000, TierChoices.NANO),
    (100_000, TierChoices.MICRO),
    (250_000, TierChoices.MID_TIER),
    (1_000_000, TierChoices.MACRO),
)


def tier_for(followers: int, raw_tier: Any = None) -> TierChoices:
    if re.search(r"celeb", cells.text(raw_tier), re.I):
        return TierChoices.CELEB
    if not followers:
        return TierChoices.NA
    return next((t for ceiling, t in _TIERS if followers < ceiling), TierChoices.MEGA)

REGIONS = ("North", "South", "East", "West", "Central", "North-East")


def taxonomy_list(names: dict[str, int]) -> Any:
    return list[Literal[tuple(sorted(names))]] if names else list[str]


CREATOR_AI = AISpec(
    name="creator",
    instructions="""Each row describes one social media creator.
- gender: from the gender cell only. Couple = two people; Community = a page \
run by a group or brand.
- city: the Indian city, spelled the standard way ("Bengaluru" for Bangalore / \
Blr, "Mumbai" for Bombay, "Gurugram" for Gurgaon). If the cell names only a \
state or region, leave city empty.
- state: the Indian state or union territory the city is in, or that the cell \
names.
- region: the part of India that state is in: North, South, East, West, Central \
or North-East. Empty when there is no state.
- categories: every allowed category the category cell mentions. Several are \
separated by commas, "&", "/" or "+" -- but some allowed names contain "&" \
themselves ("Beauty & Makeup"), so match whole allowed names first. Map a \
variant to an allowed name only when it means the same thing.
- languages: the same, for the language cell.""",
    covers={
        "gender": ("gender",),
        "city": ("city", "state", "region"),
        "category": ("categories",),
        "language": ("languages",),
    },
    fields=lambda tax: {
        "gender": (Optional[Literal["Female", "Male", "Couple", "Community"]], ...),
        "city": (Optional[str], ...),
        "state": (Optional[str], ...),
        "region": (Optional[Literal[REGIONS]], ...),
        "categories": (taxonomy_list(tax.categories), ...),
        "languages": (taxonomy_list(tax.languages), ...),
    },
)


def creator_fields(r: RowReader, raw: dict) -> Optional[dict]:
    link = raw.get("profile_link")
    platform, username = platform_of(link, cells.text(raw.get("sheet"))), handle_of(
        link
    )
    if not platform or not username:
        return r.fail(
            "profile_link", f"{cells.text(link)!r} is not a usable profile_link"
        )
    followers = r.get("followers", cells.whole)
    return {
        "id": uuid4(),
        "platform": platform,
        "username": username,
        "name": r.get("name", required=True),
        "followers": followers or None,
        "avg_views": r.get("avg_views", cells.whole) or None,
        "tier": tier_for(followers or 0, raw.get("tier")),
        "emails": r.get("email", cells.emails),
        "phones": r.get("phone", cells.phones),
    }


class _CreatorSource:
    table: type
    link_model: type
    parent_fk: str
    key_field: str
    ai = CREATOR_AI

    def parse(self, rows: list[dict]) -> tuple[list[Record], list[RowError]]:
        records, errors = [], []
        for i, raw in enumerate(rows, start=1):
            r = RowReader(raw, i, errors)
            key = r.get(self.key_field, required=True)
            creator = creator_fields(r, raw)
            link = read_columns(r, self.link_model, skip={"creator_id", self.parent_fk})
            records.append(
                Record(
                    row=i,
                    data={
                        "key": self._normalize_key(key),
                        "creator": creator,
                        "link": link,
                    },
                    ai_input={k: cells.text(raw.get(k)) for k in self.ai.covers},
                )
            )
        return records, errors + self._file_checks(rows)

    def _normalize_key(self, key: Optional[str]) -> Optional[str]:
        return key

    def _file_checks(self, rows: list[dict]) -> list[RowError]:
        return []

    def apply_ai(self, rec: Record) -> None:
        c = rec.data["creator"]
        for key in ("gender", "city", "state", "region"):
            c[key] = rec.ai[key]
        rec.data["categories"], rec.data["languages"] = (
            rec.ai["categories"],
            rec.ai["languages"],
        )

    async def _parents(self, session: AsyncSession, keys: set[str]) -> dict[str, Any]:
        raise NotImplementedError

    async def validate(
        self, session: AsyncSession, records: list[Record]
    ) -> list[RowError]:
        errors = duplicates(
            records,
            lambda r: (
                r.data["key"],
                r.data["creator"]["platform"],
                r.data["creator"]["username"],
            ),
            "profile_link",
        )
        parents = await self._parents(session, {r.data["key"] for r in records})
        orphans: dict[str, list[int]] = defaultdict(list)
        for r in records:
            if r.data["key"] not in parents:
                orphans[r.data["key"]].append(r.row)

        for key, rows in orphans.items():
            errors.append(
                RowError(
                    row=rows[0],
                    field=self.key_field,
                    message=self._orphan_message(key, len(rows)),
                )
            )
        return errors

    def _orphan_message(self, key: str, n: int) -> str:
        raise NotImplementedError

    async def write(
        self, session: AsyncSession, records: list[Record], tax: Taxonomy
    ) -> tuple[dict, str]:
        parents = await self._parents(session, {r.data["key"] for r in records})
        creators = {}
        for r in records:
            c = r.data["creator"]
            creators.setdefault((c["platform"], c["username"]), c)
        ids, created = await creator_ids(session, creators)

        cats, langs, links = set(), set(), []
        for r in records:
            c = r.data["creator"]
            cid = ids[(c["platform"], c["username"])]
            cats |= {(cid, tax.categories[n]) for n in r.data["categories"]}
            langs |= {(cid, tax.languages[n]) for n in r.data["languages"]}
            links.append(
                {
                    "creator_id": cid,
                    self.parent_fk: parents[r.data["key"]],
                    **r.data["link"],
                }
            )
        new_cats = await link_taxonomy(
            session, CategoryCreatorLink, "category_id", cats
        )
        new_langs = await link_taxonomy(
            session, LanguageCreatorLink, "language_id", langs
        )

        counts = await self._write_links(session, links)
        return counts, (
            f"{counts['inserted']} links added, {counts.get('updated', 0)} updated, "
            f"{counts.get('skipped', 0)} already present; {created} new creators, "
            f"{new_cats} category and {new_langs} language links added"
        )


class PitchCreator(_CreatorSource):
    label = "Pitch Creator"
    table = link_model = PitchCreatorLink
    parent_fk = "pitch_id"
    key_field = "source_file_id"

    _SPLIT_COSTS = (
        "reel_cost",
        "short_form_videos_cost",
        "dedicated_video_cost",
        "package_cost",
        "final_cost",
    )
    _LEGACY_COSTS = ("cost_with_deliverables", "cost_with_deliverables_usage")

    def _file_checks(self, rows: list[dict]) -> list[RowError]:
        legacy = sum(
            1
            for raw in rows
            if any(not cells.is_blank(raw.get(k)) for k in self._LEGACY_COSTS)
            and all(cells.is_blank(raw.get(k)) for k in self._SPLIT_COSTS)
        )
        if not legacy:
            return []
        return [
            RowError(
                field="template_version",
                message=f"{legacy} rows use the old v2 cost columns. Re-export from the current sheet template",
            )
        ]

    async def _parents(self, session, keys):
        stmnt = select(Pitch.spreadsheet_id, Pitch.id).where(
            col(Pitch.spreadsheet_id).in_(keys)
        )
        return dict((await session.exec(stmnt)).all())

    def _orphan_message(self, key, n):
        return f"no pitch uses spreadsheet {key} ({n} rows); ingest pitch_master first"

    async def _write_links(self, session, links):
        inserted = await bulk_insert(
            session,
            PitchCreatorLink,
            links,
            index_elements=["creator_id", "pitch_id"],
        )
        return {"inserted": inserted, "skipped": len(links) - inserted}


class CampaignCreator(_CreatorSource):
    label = "Campaign Creator"
    table = link_model = CampaignCreatorLink
    parent_fk = "campaign_id"
    key_field = "campaign_code"

    def _normalize_key(self, key):
        return key.upper() if key else key

    async def _parents(self, session, keys):
        stmnt = select(Campaign.campaign_code, Campaign.id).where(
            col(Campaign.campaign_code).in_(keys)
        )
        return dict((await session.exec(stmnt)).all())

    def _orphan_message(self, key, n):
        return f"no campaign {key!r} ({n} rows); ingest campaign_master first"

    async def _write_links(self, session: AsyncSession, links):
        pairs = {(l["creator_id"], l["campaign_id"]) for l in links}
        existing = set()
        for cid in {c for _, c in pairs}:
            stmnt = select(CampaignCreatorLink.creator_id).where(
                CampaignCreatorLink.campaign_id == cid
            )
            existing |= {(c, cid) for c in (await session.exec(stmnt)).all()}
        updated = len(pairs & existing)

        mutable = (
            [k for k in links[0] if k not in ("creator_id", "campaign_id")]
            if links
            else []
        )
        chunk = max(1, settings.PG_MAX_PARAMS // max(1, len(mutable) + 2))
        for i in range(0, len(links), chunk):
            stmnt = pg_insert(CampaignCreatorLink).values(links[i : i + chunk])
            await session.exec(
                stmnt.on_conflict_do_update(
                    index_elements=["creator_id", "campaign_id"],
                    set_={k: getattr(stmnt.excluded, k) for k in mutable},
                )
            )
        return {"inserted": len(pairs) - updated, "updated": updated}
