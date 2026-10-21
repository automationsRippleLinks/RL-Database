"""pitch_creator and campaign_creator: the creators on a pitch or campaign sheet.

Each row is a creator plus their creator row on a pitch / campaign that must already
be ingested. New creators are created; existing ones only gain category and
language links. On a re-ingest, pitch creator rows already present are skipped,
while campaign creator rows are overwritten.

Also holds creator-level pieces used elsewhere (the plain creator list, Apify runs,
hand edits): CREATOR_AI, creator_fields, tier_for, taxonomy_list.
"""

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

# exclusive upper bounds on followers; a million or more is MEGA
_TIERS = (
    (20_000, TierChoices.NANO),
    (100_000, TierChoices.MICRO),
    (250_000, TierChoices.MID_TIER),
    (1_000_000, TierChoices.MACRO),
)


def tier_for(followers: int, raw_tier: Any = None) -> TierChoices:
    """Tier by follower count; "celeb" in the tier cell wins. No count gives NA."""

    if re.search(r"celeb", cells.text(raw_tier), re.I):
        return TierChoices.CELEB
    if not followers:
        return TierChoices.NA
    return next((t for ceiling, t in _TIERS if followers < ceiling), TierChoices.MEGA)


REGIONS = ("North", "South", "East", "West", "Central", "North-East")


def taxonomy_list(names: dict[str, int]) -> Any:
    """Answer type for an AI field listing taxonomy names: only these names allowed.

    With no names it falls back to list[str]; pydantic can't build an empty Literal.
    """
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
    """The creator's own columns from a row; None if the profile link is unusable.
    
        The platform comes from the link's domain, else from the row's `sheet` cell.
        A follower or view count of 0 is stored as unknown (None).
    """

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
    """Shared logic for creator rows; subclasses say which parent and link table.
    
        A subclass sets the link model, the parent's foreign key and the cell holding the
        parent's key, and implements _parents, _orphan_message and _write_links.
    """

    table: type
    link_model: type
    parent_fk: str
    key_field: str
    ai = CREATOR_AI

    def parse(self, rows: list[dict]) -> tuple[list[Record], list[RowError]]:
        """Read each row into the parent's key, the creator, and their creator row."""

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
        """Hook: tidy the parent key before it is matched. Unchanged by default."""

        return key

    def _file_checks(self, rows: list[dict]) -> list[RowError]:
        """Hook: errors about the file as a whole. None by default."""

        return []

    def apply_ai(self, rec: Record) -> None:
        """Copy the AI's gender, location, categories and languages onto the record."""

        c = rec.data["creator"]
        for key in ("gender", "city", "state", "region"):
            c[key] = rec.ai[key]
        rec.data["categories"], rec.data["languages"] = (
            rec.ai["categories"],
            rec.ai["languages"],
        )

    async def _parents(self, session: AsyncSession, keys: set[str]) -> dict[str, Any]:
        """{key: parent id} for the keys that exist."""

        raise NotImplementedError

    async def validate(
        self, session: AsyncSession, records: list[Record]
    ) -> list[RowError]:
        """Creators repeated within a parent, and one error per missing parent."""

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
        """Error text for `n` rows whose parent key matches nothing."""

        raise NotImplementedError

    async def write(
        self, session: AsyncSession, records: list[Record], tax: Taxonomy
    ) -> tuple[dict, str]:
        """Get-or-create creators, add category/language links, then creator rows."""

        parents = await self._parents(session, {r.data["key"] for r in records})
        creators = {}
        for r in records:
            c = r.data["creator"]
            # a creator on several pitches/campaigns: the first row's details are used
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
    """Creators on a pitch, matched to it by the file id of the pitch's spreadsheet."""

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
    # the v2 template only had these two combined cost columns
    _LEGACY_COSTS = ("cost_with_deliverables", "cost_with_deliverables_usage")

    def _file_checks(self, rows: list[dict]) -> list[RowError]:
        """Reject the whole file if any row has costs only in the old v2 columns."""

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
        """{spreadsheet id: pitch id} for the spreadsheets that belong to a pitch."""

        stmnt = select(Pitch.spreadsheet_id, Pitch.id).where(
            col(Pitch.spreadsheet_id).in_(keys)
        )
        return dict((await session.exec(stmnt)).all())

    def _orphan_message(self, key, n):
        """Error text for rows whose spreadsheet no pitch uses."""

        return f"no pitch uses spreadsheet {key} ({n} rows); ingest pitch_master first"

    async def _write_links(self, session, links):
        """Insert new creator rows; ones already on the pitch are left untouched."""

        inserted = await bulk_insert(
            session,
            PitchCreatorLink,
            links,
            index_elements=["creator_id", "pitch_id"],
        )
        return {"inserted": inserted, "skipped": len(links) - inserted}


class CampaignCreator(_CreatorSource):
    """Creators on a campaign, matched to it by campaign code."""

    label = "Campaign Creator"
    table = link_model = CampaignCreatorLink
    parent_fk = "campaign_id"
    key_field = "campaign_code"

    def _normalize_key(self, key):
        """Campaign codes are stored upper-case (see CampaignMaster.parse)."""

        return key.upper() if key else key

    async def _parents(self, session, keys):
        """{campaign code: campaign id} for the codes that exist."""

        stmnt = select(Campaign.campaign_code, Campaign.id).where(
            col(Campaign.campaign_code).in_(keys)
        )
        return dict((await session.exec(stmnt)).all())

    def _orphan_message(self, key, n):
        """Error text for rows whose campaign code doesn't exist."""

        return f"no campaign {key!r} ({n} rows); ingest campaign_master first"

    async def _write_links(self, session: AsyncSession, links):
        """Upsert creator rows: new ones are inserted, existing ones overwritten.
        
                Every existing row counts as updated and gets its version bumped, even when
                nothing in it changed.
        """

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
        # bind parameters per row: the mutable columns plus the two keys
        chunk = max(1, settings.PG_MAX_PARAMS // max(1, len(mutable) + 2))
        for i in range(0, len(links), chunk):
            stmnt = pg_insert(CampaignCreatorLink).values(links[i : i + chunk])
            await session.exec(
                stmnt.on_conflict_do_update(
                    index_elements=["creator_id", "campaign_id"],
                    set_={
                        **{k: getattr(stmnt.excluded, k) for k in mutable},
                        "version": CampaignCreatorLink.__table__.c.version + 1,
                    },
                )
            )
        return {"inserted": len(pairs) - updated, "updated": updated}
