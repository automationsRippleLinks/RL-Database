"""Staged inserts for parsed ingest rows.

Nothing here commits. The route owns the transaction so a dry run can roll the
whole thing back, including the brands this creates
"""

from uuid import UUID, uuid4

from sqlmodel import select, col, SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from .parser import Parser, extract_file_id
from app.models import Brand, Pitch, Campaign, Creator, PitchCreatorLink
from app.schemas.ingest import IngestCounts, IngestRowError
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
        parsed, errors = await self.parser.parse_campaign_creator(data)
        
        campaign_by_file: dict[str, UUID] = {}
        for cid, link in (
            await session.exec(select(Campaign.id, Campaign.spreadsheet_link))
        ).all():
            fid = extract_file_id(link)
            if fid:
                campaign_by_file[fid] = cid

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
