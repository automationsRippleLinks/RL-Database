"""Staged inserts for parsed ingest rows.

Nothing here commits. The route owns the transaction so a dry run can roll the
whole thing back, including the brands this creates
"""

from uuid import UUID, uuid4

from sqlmodel import select, col, SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from .parser import Parser, extract_file_id
from app.models import (
    Brand,
    Pitch,
    Campaign,
    Creator,
    PitchCreatorLink,
    CampaignCreatorLink,
    Category,
    Language,
    CategoryCreatorLink,
    LanguageCreatorLink,
)
from app.schemas.ingest import (
    IngestCounts,
    IngestRowError,
    CampaignCreatorLinkRecord,
    CAMPAIGN_CREATOR_ONLY_FIELDS,
)
from app.services.ingest_job import IngestResult

MAX_STORED_ERRORS = 500
PG_MAX_PARAMS = 32767


class Ingest:
    def __init__(self):
        self.parser = Parser()

    async def _bulk_insert(
        self, session: AsyncSession, model: SQLModel, rows: list[dict]
    ) -> None:
        if not rows:
            return
        per_row = len(rows[0])
        chunk = max(1, PG_MAX_PARAMS // per_row)
        for i in range(0, len(rows), chunk):
            await session.execute(pg_insert(model).values(rows[i : i + chunk]))

    async def _load_creators(
        self, session: AsyncSession, wanted: set[tuple]
    ) -> dict[tuple, UUID]:
        """Match on (platform, username) -- the composite key.

        Queries usernames only and filters the pairs in Python: a `tuple_ IN`
        against the enum column returned inconsistent row counts for the same
        input, which silently lost creators.
        """
        if not wanted:
            return {}

        found: dict[tuple, UUID] = {}
        usernames = sorted({u for _, u in wanted})
        for i in range(0, len(usernames), 1000):
            chunk = usernames[i : i + 1000]
            rows = (
                await session.exec(
                    select(Creator).where(col(Creator.username).in_(chunk))
                )
            ).all()
            print(
                f"chunk {i//1000}: asked {len(chunk)} usernames, got {len(rows)} rows"
            )
            for c in rows:
                key = (c.platform, c.username)
                if key in wanted:
                    found[key] = c.id
        return found

    async def _resolve_brands(
        self,
        session: AsyncSession,
        name_map: dict[str, str],
    ) -> dict[str, int]:
        names = {n for n in name_map if n}
        if not names:
            return {}

        found = {
            b.name: b.id
            for b in (
                await session.exec(select(Brand).where(col(Brand.name).in_(names)))
            ).all()
        }

        missing = names - set(found)
        if missing:
            for name in missing:
                session.add(
                    Brand.model_validate(
                        {
                            "name": name,
                            "gstin": None,
                            "display_name": name_map.get(name),
                        }
                    )
                )
            await session.flush()
            found.update(
                {
                    b.name: b.id
                    for b in (
                        await session.exec(
                            select(Brand).where(col(Brand.name).in_(missing))
                        )
                    ).all()
                }
            )
        return found

    async def _resolve_taxonomy(
        self,
        session: AsyncSession,
        model,
        names: set[str],
    ) -> dict[str, int]:
        """Get-or-create rows in `category` / `language`, keyed on lowercase name.

        Both tables have a UNIQUE name and were never populated by any ingest
        path, so there is no mixed-case legacy to preserve; lowercasing matches
        Brand.name and stops "Cricket Fan" and "cricket fan" becoming two facets.
        """
        names = {n for n in names if n}
        if not names:
            return {}

        found: dict[str, int] = {}
        ordered = sorted(names)
        for i in range(0, len(ordered), 1000):
            chunk = ordered[i : i + 1000]
            found.update(
                {
                    row.name: row.id
                    for row in (
                        await session.exec(
                            select(model).where(col(model.name).in_(chunk))
                        )
                    ).all()
                }
            )

        missing = sorted(names - set(found))
        if missing:
            await session.exec(
                pg_insert(model)
                .values([{"name": n} for n in missing])
                .on_conflict_do_nothing(index_elements=["name"])
            )
            await session.flush()
            for i in range(0, len(missing), 1000):
                chunk = missing[i : i + 1000]
                found.update(
                    {
                        row.name: row.id
                        for row in (
                            await session.exec(
                                select(model).where(col(model.name).in_(chunk))
                            )
                        ).all()
                    }
                )
        return found

    async def _link_taxonomy(
        self,
        session: AsyncSession,
        link_model,
        fk_name: str,
        pairs: set[tuple[UUID, int]],
    ) -> int:
        """Insert creator<->category / creator<->language links, idempotently."""
        if not pairs:
            return 0
        rows = [
            {"creator_id": creator_id, fk_name: taxonomy_id}
            for creator_id, taxonomy_id in sorted(
                pairs, key=lambda p: (str(p[0]), p[1])
            )
        ]
        chunk = max(1, PG_MAX_PARAMS // 2)
        for i in range(0, len(rows), chunk):
            await session.exec(
                pg_insert(link_model)
                .values(rows[i : i + chunk])
                .on_conflict_do_nothing(index_elements=["creator_id", fk_name])
            )
        await session.flush()
        return len(rows)

    @staticmethod
    def _link_field_drift() -> tuple[set[str], set[str]]:
        """(missing_from_record, unknown_to_model) for CampaignCreatorLink.

        Guards the failure this codebase keeps hitting: a column added to the
        model but not to the record just takes its default, and the sheet value
        vanishes without an error.
        """
        model_cols = {c.name for c in CampaignCreatorLink.__table__.columns} - {
            "creator_id",
            "campaign_id",
        }
        record_cols = (
            set(CampaignCreatorLinkRecord.model_fields) - CAMPAIGN_CREATOR_ONLY_FIELDS
        )
        return model_cols - record_cols, record_cols - model_cols

    async def ingest_pitch_master_data(
        self, session: AsyncSession, data: list[dict]
    ) -> IngestResult:
        parsed, errors = await self.parser.parse_pitch_master(data)

        brand_map = await self._resolve_brands(
            session, {p.brand_name: p.brand_display_name for p in parsed}
        )

        codes = [p.pitch_code for p in parsed]
        existing = set(
            (
                await session.exec(
                    select(Pitch.pitch_code).where(col(Pitch.pitch_code).in_(codes))
                )
            ).all()
        )

        inserted = skipped = 0
        for p in parsed:
            if p.pitch_code in existing:
                skipped += 1
                continue
            payload = p.model_dump(exclude={"brand_name", "brand_display_name"})
            session.add(Pitch(**payload, brand_id=brand_map.get(p.brand_name)))
            inserted += 1

        await session.flush()
        return IngestResult(
            counts=IngestCounts(
                received=len(data),
                inserted=inserted,
                updated=0,
                skipped=skipped,
                failed=len(errors),
            ),
            errors=errors,
            message=f"Ingested {inserted} pitch_master rows",
        )

    async def ingest_campaign_master_data(
        self, session: AsyncSession, data: list[dict]
    ) -> IngestResult:
        parsed, errors = await self.parser.parse_campaign_master(data)

        brand_map = await self._resolve_brands(
            session, {c.brand_name: c.brand_display_name for c in parsed}
        )

        codes = [c.campaign_code for c in parsed]
        existing = set(
            (
                await session.exec(
                    select(Campaign.campaign_code).where(
                        col(Campaign.campaign_code).in_(codes)
                    )
                )
            ).all()
        )

        pitch_codes = {c.pitch_code for c in parsed if c.pitch_code}
        pitch_map = {
            p.pitch_code: p.id
            for p in (
                await session.exec(
                    select(Pitch).where(col(Pitch.pitch_code).in_(pitch_codes))
                )
            ).all()
        }

        inserted = skipped = 0
        for i, c in enumerate(parsed):
            if c.campaign_code in existing:
                skipped += 1
                continue
            payload = c.model_dump(
                exclude={"brand_name", "brand_display_name", "pitch_code"}
            )
            pitch_id = pitch_map.get(c.pitch_code)
            if c.pitch_code and pitch_id is None:
                errors.append(
                    IngestRowError(
                        row=i,
                        field="pitch_code",
                        message=f"No pitch found for {c.pitch_code!r}; campaign inserted unlinked",
                    )
                )
            session.add(
                Campaign(
                    **payload,
                    brand_id=brand_map.get(c.brand_name),
                    pitch_id=pitch_id,
                )
            )
            inserted += 1

        await session.flush()
        return IngestResult(
            counts=IngestCounts(
                received=len(data),
                inserted=inserted,
                updated=0,
                skipped=skipped,
                failed=len(errors),
            ),
            errors=errors,
            message=f"Ingested {inserted} campaign_master rows",
        )

    async def ingest_pitch_creator_data(
        self, session: AsyncSession, data: list[dict]
    ) -> IngestResult:
        parsed, errors = await self.parser.parse_pitch_creator(data)

        pitch_by_file: dict[str, UUID] = {}
        for pid, link in (
            await session.exec(select(Pitch.id, Pitch.spreadsheet_link))
        ).all():
            fid = extract_file_id(link)
            if fid:
                pitch_by_file[fid] = pid

        wanted = {(r.platform, r.username) for r in parsed}
        existing: dict[tuple, UUID] = await self._load_creators(session, wanted)

        by_key = {(r.platform, r.username): r for r in parsed}
        created = 0
        new_rows = []
        for key in wanted - set(existing):
            src = by_key[key]
            # session.add(
            #     Creator(
            #         platform=src.platform,
            #         username=src.username,
            #         name=src.name,
            #         followers=src.followers,
            #         avg_views=src.avg_views,
            #         tier=src.tier,
            #         gender=src.gender,
            #         city=src.city,
            #         categories_raw=src.categories_raw,
            #         languages_raw=src.languages_raw,
            #         email=src.email or None,
            #         phone=src.phone or None,
            #     )
            # )
            # created += 1
            new_rows.append(
                {
                    "id": uuid4(),
                    "platform": src.platform,
                    "username": src.username,
                    "name": src.name,
                    "followers": src.followers,
                    "avg_views": src.avg_views,
                    "tier": src.tier,
                    "gender": src.gender,
                    "city": src.city,
                    "categories_raw": src.categories_raw,
                    "languages_raw": src.languages_raw,
                    "email": src.email or None,
                    "phone": src.phone or None,
                }
            )
            created = len(new_rows)
        if new_rows:
            # await session.flush()
            await self._bulk_insert(session, Creator, new_rows)
            existing = await self._load_creators(session, wanted)
            print(
                f"wanted={len(wanted)} created={created} reloaded={len(existing)} "
                f"missing={len(wanted - set(existing))}"
            )

        have = {
            (l.creator_id, l.pitch_id)
            for l in (await session.exec(select(PitchCreatorLink))).all()
        }

        inserted = skipped = 0
        link_rows = []
        for r in parsed:
            pitch_id = pitch_by_file.get(r.source_file_id)
            if pitch_id is None:
                errors.append(
                    IngestRowError(
                        row=r.sheet_row,
                        field="source_field_id",
                        severity="error",
                        message=f"no pitch in database for spreadsheet {r.source_file_id}",
                    )
                )
                continue

            creator_id = existing.get((r.platform, r.username))
            if creator_id is None:
                errors.append(
                    IngestRowError(
                        row=r.sheet_row,
                        field="profile_link",
                        severity="error",
                        message=f"creator {r.platform.value}/{r.username} was not created",
                    )
                )
                continue
            if (creator_id, pitch_id) in have:
                skipped += 1
                continue

            # session.add(
            #     PitchCreatorLink(
            #         creator_id=creator_id,
            #         pitch_id=pitch_id,
            #         **r.model_dump(
            #             exclude={
            #                 "source_file_id",
            #                 "sheet_row",
            #                 "platform",
            #                 "username",
            #                 "name",
            #                 "followers",
            #                 "avg_views",
            #                 "tier",
            #                 "gender",
            #                 "city",
            #                 "categories_raw",
            #                 "languages_raw",
            #                 "email",
            #                 "phone",
            #             }
            #         ),
            #     )
            # )
            link_rows.append(
                {
                    "creator_id": creator_id,
                    "pitch_id": pitch_id,
                    **r.model_dump(
                        exclude={
                            "source_file_id",
                            "sheet_row",
                            "platform",
                            "username",
                            "name",
                            "followers",
                            "avg_views",
                            "tier",
                            "gender",
                            "city",
                            "categories_raw",
                            "languages_raw",
                            "email",
                            "phone",
                        }
                    ),
                }
            )
            have.add((creator_id, pitch_id))
            inserted += 1

        if link_rows:
            await self._bulk_insert(session, PitchCreatorLink, link_rows)
            await session.flush()

        failed = sum(1 for e in errors if e.severity == "error")
        truncated = max(0, len(errors) - MAX_STORED_ERRORS)

        return IngestResult(
            counts=IngestCounts(
                received=len(data),
                inserted=inserted,
                updated=0,
                failed=failed,
                skipped=skipped,
                errors_truncated=truncated,
            ),
            errors=sorted(errors, key=lambda e: e.severity != "error")[
                :MAX_STORED_ERRORS
            ],
            message=f"{created} creators received, {inserted} pitch links added",
        )

    async def ingest_campaign_creator_data(
        self, session: AsyncSession, data: list[dict]
    ) -> IngestResult:
        """Campaign Status + Tracker rows -> Creator + CampaignCreatorLink.

        Creators missing from the DB are created, and their category / language
        cells populate `category`, `language` and the two link tables.

        Re-ingesting a campaign UPDATES its existing links rather than skipping
        them: tracker numbers keep moving after a campaign goes live, so the
        newest export is the truth. Creator rows are left alone once they exist
        -- update-vs-skip for creator identity is still an open call, and
        overwriting a hand-corrected city or tier from a campaign sheet is the
        more expensive mistake.
        """
        parsed, errors = await self.parser.parse_campaign_creator(data)

        missing_cols, unknown_cols = self._link_field_drift()
        if missing_cols:
            errors.append(
                IngestRowError(
                    row=0,
                    field="schema",
                    severity="warning",
                    message=(
                        "CampaignCreatorLink columns absent from the parsed record "
                        f"and left at their default: {sorted(missing_cols)}"
                    ),
                )
            )
        if unknown_cols:
            errors.append(
                IngestRowError(
                    row=0,
                    field="schema",
                    severity="error",
                    message=(
                        "Parsed record has fields with no CampaignCreatorLink "
                        f"column: {sorted(unknown_cols)}"
                    ),
                )
            )
            return IngestResult(
                counts=IngestCounts(
                    received=len(data),
                    inserted=0,
                    updated=0,
                    skipped=0,
                    failed=len(data),
                    errors_truncated=0,
                ),
                errors=errors[:MAX_STORED_ERRORS],
                message="Aborted: record/model field mismatch would corrupt the insert.",
            )

        # ---- resolve campaigns by code -------------------------------------
        codes = {r.campaign_code for r in parsed}
        campaign_by_code: dict[str, UUID] = {}
        ordered_codes = sorted(codes)
        for i in range(0, len(ordered_codes), 1000):
            chunk = ordered_codes[i : i + 1000]
            for cid, code in (
                await session.exec(
                    select(Campaign.id, Campaign.campaign_code).where(
                        col(Campaign.campaign_code).in_(chunk)
                    )
                )
            ).all():
                campaign_by_code[code] = cid

        # ---- create missing creators ---------------------------------------
        wanted = {(r.platform, r.username) for r in parsed}
        existing: dict[tuple, UUID] = await self._load_creators(session, wanted)

        by_key = {(r.platform, r.username): r for r in parsed}
        new_rows = []
        for key in sorted(wanted - set(existing), key=lambda k: (k[0].value, k[1])):
            src = by_key[key]
            new_rows.append(
                {
                    "id": uuid4(),
                    "platform": src.platform,
                    "username": src.username,
                    "name": src.name,
                    "followers": src.followers,
                    "avg_views": src.avg_views,
                    "tier": src.tier,
                    "gender": src.gender,
                    "city": src.city,
                    "categories_raw": src.categories_raw,
                    "languages_raw": src.languages_raw,
                    "email": src.email or None,
                    "phone": src.phone or None,
                }
            )
        created = len(new_rows)
        if new_rows:
            await self._bulk_insert(session, Creator, new_rows)
            await session.flush()
            existing = await self._load_creators(session, wanted)

        # ---- category / language tables + links ------------------------------
        from app.services.parser import _split_multi

        category_names: set[str] = set()
        language_names: set[str] = set()
        per_creator: dict[UUID, tuple[list[str], list[str]]] = {}
        for r in parsed:
            creator_id = existing.get((r.platform, r.username))
            if creator_id is None:
                continue
            cats = [c.lower() for c in _split_multi(r.categories_raw)]
            langs = [l.lower() for l in _split_multi(r.languages_raw)]
            if not cats and not langs:
                continue
            category_names.update(cats)
            language_names.update(langs)
            prior_c, prior_l = per_creator.get(creator_id, ([], []))
            per_creator[creator_id] = (prior_c + cats, prior_l + langs)

        category_map = await self._resolve_taxonomy(session, Category, category_names)
        language_map = await self._resolve_taxonomy(session, Language, language_names)

        category_pairs = {
            (creator_id, category_map[c])
            for creator_id, (cats, _) in per_creator.items()
            for c in cats
            if c in category_map
        }
        language_pairs = {
            (creator_id, language_map[l])
            for creator_id, (_, langs) in per_creator.items()
            for l in langs
            if l in language_map
        }
        linked_categories = await self._link_taxonomy(
            session, CategoryCreatorLink, "category_id", category_pairs
        )
        linked_languages = await self._link_taxonomy(
            session, LanguageCreatorLink, "language_id", language_pairs
        )

        # ---- campaign links --------------------------------------------------
        campaign_ids = set(campaign_by_code.values())
        have: set[tuple[UUID, UUID]] = set()
        if campaign_ids:
            have = {
                (l.creator_id, l.campaign_id)
                for l in (
                    await session.exec(
                        select(CampaignCreatorLink).where(
                            col(CampaignCreatorLink.campaign_id).in_(campaign_ids)
                        )
                    )
                ).all()
            }

        insert_rows, update_rows = [], []
        for r in parsed:
            campaign_id = campaign_by_code.get(r.campaign_code)
            if campaign_id is None:
                errors.append(
                    IngestRowError(
                        row=r.sheet_row or 0,
                        field="campaign_code",
                        severity="error",
                        message=(
                            f"no campaign in database for {r.campaign_code!r}; "
                            "ingest campaign_master first"
                        ),
                    )
                )
                continue

            creator_id = existing.get((r.platform, r.username))
            if creator_id is None:
                errors.append(
                    IngestRowError(
                        row=r.sheet_row or 0,
                        field="profile_link",
                        severity="error",
                        message=f"creator {r.platform.value}/{r.username} was not created",
                    )
                )
                continue

            payload = {
                "creator_id": creator_id,
                "campaign_id": campaign_id,
                **r.model_dump(exclude=CAMPAIGN_CREATOR_ONLY_FIELDS),
            }
            if (creator_id, campaign_id) in have:
                update_rows.append(payload)
            else:
                insert_rows.append(payload)
                have.add((creator_id, campaign_id))

        mutable = sorted(
            set(CampaignCreatorLinkRecord.model_fields) - CAMPAIGN_CREATOR_ONLY_FIELDS
        )
        for rows in (insert_rows, update_rows):
            if not rows:
                continue
            per_row = len(rows[0])
            chunk = max(1, PG_MAX_PARAMS // per_row)
            for i in range(0, len(rows), chunk):
                batch = rows[i : i + chunk]
                stmt = pg_insert(CampaignCreatorLink).values(batch)
                await session.execute(
                    stmt.on_conflict_do_update(
                        index_elements=["creator_id", "campaign_id"],
                        set_={c: getattr(stmt.excluded, c) for c in mutable},
                    )
                )
        if insert_rows or update_rows:
            await session.flush()

        failed = sum(1 for e in errors if e.severity == "error")
        truncated = max(0, len(errors) - MAX_STORED_ERRORS)

        return IngestResult(
            counts=IngestCounts(
                received=len(data),
                inserted=len(insert_rows),
                updated=len(update_rows),
                failed=failed,
                skipped=0,
                errors_truncated=truncated,
            ),
            errors=sorted(errors, key=lambda e: e.severity != "error")[
                :MAX_STORED_ERRORS
            ],
            message=(
                f"{len(insert_rows)} campaign links added, {len(update_rows)} updated; "
                f"{created} creators created; "
                f"{linked_categories} category and {linked_languages} language links"
            ),
        )
