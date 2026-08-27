"""Staged inserts for parsed ingest rows.

Nothing here commits. The route owns the transaction so a dry run can roll the
whole thing back, including the brands this creates.

Two classes of failure exist. A bad row yields an IngestRowError and is skipped;
the batch continues. A *blocking* problem -- an unknown category or language, a
malformed email -- raises IngestRejected before anything is written, because
those are sheet mistakes that want fixing at the source rather than silently
absorbing into the database.
"""

import re
from uuid import UUID, uuid4

from sqlmodel import select, col, SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from .parser import Parser, extract_file_id, _clean, _is_nullish
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
    PITCH_CREATOR_ONLY_FIELDS,
)
from app.services.ingest_job import IngestResult
from app.core.config import PG_MAX_PARAMS, MAX_STORED_ERRORS


#: Splits a multi-value cell while KEEPING the delimiters, so a term that
#: contains one can be reassembled.
_SPLIT_KEEP = re.compile(r"(\s*(?:\+|,|/|&|\||;)\s*)")

_WHITESPACE = re.compile(r"\s+")


def _term_key(name: str) -> str:
    """Match key for a taxonomy term: lowercase, whitespace removed.

    Dropping whitespace entirely is what makes "Beauty & Makeup",
    "Beauty&Makeup" and "beauty  &  makeup" the same term. The tables are
    maintained by hand and the sheets are typed by dozens of people, so
    insisting on identical spacing would reject uploads over nothing.
    """
    return _WHITESPACE.sub("", name).lower()


def _resolve_terms(cell, known: dict[str, int]) -> tuple[list[str], list[str]]:
    """Split a category / language cell against a known vocabulary.

    Returns (matched keys, unrecognised fragments).

    Longest match wins, and that is the whole point. Thirty of the real category
    names contain a delimiter -- "Beauty & Makeup", "Food & Cooking" -- and
    eleven languages contain a slash, like "Arabic/Arbi". Splitting first and
    matching after would shred every one of them into fragments that match
    nothing, and reject virtually every upload.

    So the cell is split with its delimiters preserved, and the longest run of
    fragments that forms a known term is consumed first. "Beauty & Makeup, Food
    & Cooking" yields exactly those two terms; "Beauty, Cricket" yields
    "beauty" (unknown) and "cricket".
    """
    text = _clean(cell)
    if not text or _is_nullish(text):
        return [], []

    pieces = _SPLIT_KEEP.split(text)
    fragments, delimiters = pieces[0::2], pieces[1::2]

    matched: list[str] = []
    unknown: list[str] = []
    seen: set[str] = set()

    i, n = 0, len(fragments)
    while i < n:
        for end in range(n, i, -1):  # longest run first
            candidate = fragments[i]
            for k in range(i, end - 1):
                candidate += delimiters[k] + fragments[k + 1]
            key = _term_key(candidate)
            if key in known:
                if key not in seen:
                    seen.add(key)
                    matched.append(key)
                i = end
                break
        else:
            fragment = _clean(fragments[i])
            if fragment and not _is_nullish(fragment):
                unknown.append(fragment)
            i += 1

    return matched, unknown


def _plural(count: int, singular: str, plural: str | None = None) -> str:
    return f"{count} {singular if count == 1 else (plural or singular + 's')}"


def _summarise_terms(
    singular: str, plural: str, names: set[str], limit: int = 6
) -> str:
    """"412 unknown categories (e.g. 'Fashion', 'Beauty', ...)".

    Capped deliberately. A messy export can carry several hundred distinct
    unrecognised terms, and this string is stored on the job row and rendered in
    the upload panel -- listing them all makes both unusable. Every one of them
    still appears as its own row error.
    """
    ordered = sorted(names)
    shown = ", ".join(repr(n) for n in ordered[:limit])
    more = "" if len(ordered) <= limit else f", +{len(ordered) - limit} more"
    noun = singular if len(ordered) == 1 else plural
    return f"{len(ordered)} unknown {noun} (e.g. {shown}{more})"


#: Error codes that mean "nothing was written". Everything else is advisory.
_BLOCKING_CODES = frozenset(
    {
        "unknown_category",
        "unknown_language",
        "invalid_email",
        "legacy_v2_format",
        "ambiguous_pitch_sheet",
        "duplicate_pitch_sheet",
        "batch_rejected",
    }
)


class IngestRejected(Exception):
    """The batch must not be written at all.

    Carries a fully-formed IngestResult so the route can record the job with
    every offending row named, rather than collapsing the failure into one
    stringified exception.
    """

    def __init__(self, result: IngestResult):
        super().__init__(result.message or "Ingest rejected")
        self.result = result


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
            for c in rows:
                key = (c.platform, c.username)
                if key in wanted:
                    found[key] = c.id
        return found

    async def _create_creators(
        self,
        session: AsyncSession,
        wanted: set[tuple],
        by_key: dict,
        existing: dict[tuple, UUID],
    ) -> int:
        """Insert the creators in `wanted` that aren't in `existing` yet.

        Mutates `existing` in place with the new ids. Those ids are generated
        here rather than by the database precisely so no reload is needed: the
        previous version re-queried every username after inserting, paying for a
        second chunked scan to learn what it had just decided.
        """
        missing = sorted(wanted - set(existing), key=lambda k: (k[0].value, k[1]))
        if not missing:
            return 0

        rows = []
        for key in missing:
            src = by_key[key]
            creator_id = uuid4()
            existing[key] = creator_id
            rows.append(
                {
                    "id": creator_id,
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

        await self._bulk_insert(session, Creator, rows)
        await session.flush()
        return len(rows)

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

    async def _load_taxonomy(self, session: AsyncSession, model) -> dict[str, int]:
        """The whole category / language table, keyed for matching.

        Look-up only -- it never creates. Ingest used to get-or-create here,
        which meant one typo in one sheet became a permanent facet nobody
        noticed until the filter list was full of near-duplicates. The taxonomy
        is curated through the /taxonomy endpoints now, and a name that isn't
        there rejects the batch.

        Loading the lot is deliberate: both tables are small (a few hundred rows
        between them), and `_resolve_terms` needs the full vocabulary in hand to
        do longest-match, not just the names a query happened to ask about.
        """
        return {
            _term_key(name): row_id
            for row_id, name in (await session.exec(select(model.id, model.name))).all()
        }

    @staticmethod
    def _taxonomy_of(
        record, categories: dict[str, int], languages: dict[str, int]
    ) -> tuple[list[str], list[str], list[str], list[str]]:
        """(known categories, known languages, unknown, unknown) for one row."""
        cats, bad_cats = _resolve_terms(record.categories_raw, categories)
        langs, bad_langs = _resolve_terms(record.languages_raw, languages)
        return cats, langs, bad_cats, bad_langs

    async def _reject_preflight(
        self,
        session: AsyncSession,
        parsed: list,
        errors: list[IngestRowError],
        received: int,
        extra_blocking: list[IngestRowError] | None = None,
        extra_summary: list[str] | None = None,
    ) -> tuple[dict[str, int], dict[str, int]]:
        """Refuse the whole batch if anything blocking is in it.

        Runs before the first INSERT, so a rejected batch leaves the database
        untouched and the route's rollback is a formality. Every blocking
        problem in the file is reported in one pass -- a fix-one-find-another
        loop over a 3000-row export is not a workflow anyone should have.

        Returns the resolved (category, language) name -> id maps on success.
        """
        category_map = await self._load_taxonomy(session, Category)
        language_map = await self._load_taxonomy(session, Language)

        blocking: list[IngestRowError] = []
        unknown_categories: set[str] = set()
        unknown_languages: set[str] = set()

        for r in parsed:
            _, _, bad_cats, bad_langs = self._taxonomy_of(r, category_map, language_map)
            row = getattr(r, "sheet_row", 0) or 0
            for name in bad_cats:
                unknown_categories.add(name)
                blocking.append(
                    IngestRowError(
                        row=row,
                        field="category",
                        code="unknown_category",
                        message=f"category {name!r} is not in the category table",
                    )
                )
            for name in bad_langs:
                unknown_languages.add(name)
                blocking.append(
                    IngestRowError(
                        row=row,
                        field="language",
                        code="unknown_language",
                        message=f"language {name!r} is not in the language table",
                    )
                )

        bad_emails = [e for e in errors if e.code == "invalid_email"]
        legacy = [e for e in errors if e.code == "legacy_v2_format"]
        blocking = list(extra_blocking or []) + bad_emails + legacy + blocking

        summary = list(extra_summary or [])
        if unknown_categories:
            summary.append(_summarise_terms("category", "categories", unknown_categories))
        if unknown_languages:
            summary.append(_summarise_terms("language", "languages", unknown_languages))
        if bad_emails:
            summary.append(f"{len(bad_emails)} invalid email(s)")
        if legacy:
            summary.append("an old-format (v2) export")

        if not summary:
            return category_map, language_map

        # Only mention Taxonomy when a missing term is actually the problem --
        # telling someone to add a category when their file is the wrong version
        # sends them to the wrong screen.
        remedies = []
        if unknown_categories or unknown_languages:
            remedies.append("Add the missing terms under Taxonomy")
        if legacy:
            remedies.append("re-export from the current sheet template")
        if bad_emails:
            remedies.append("give each address a valid value or clear the cell")
        if extra_blocking:
            remedies.append("resolve the pitches sharing a spreadsheet")

        self._raise_rejected(
            received=received,
            summary=summary,
            blocking=blocking,
            other=[e for e in errors if e.code not in _BLOCKING_CODES],
            remedy=(
                "; ".join(remedies) + ", then upload again."
                if remedies
                else "Correct the file and upload again."
            ),
        )

    @staticmethod
    def _raise_rejected(
        *,
        received: int,
        summary: list[str],
        blocking: list[IngestRowError],
        other: list[IngestRowError],
        remedy: str,
    ) -> None:
        """Refuse the batch, describing every reason at once.

        Blocking problems are listed before the parser's advisory warnings: they
        are what has to be fixed, and a long tail of warnings would otherwise
        push them past MAX_STORED_ERRORS and out of the report.
        """
        summary_text = "; ".join(summary)
        head = IngestRowError(
            row=0,
            field="schema",
            code="batch_rejected",
            message=f"Nothing was written. {summary_text}. {remedy}",
        )
        all_errors = [head] + blocking + other
        raise IngestRejected(
            IngestResult(
                counts=IngestCounts(
                    received=received,
                    inserted=0,
                    updated=0,
                    skipped=0,
                    failed=received,
                    errors_truncated=max(0, len(all_errors) - MAX_STORED_ERRORS),
                ),
                errors=all_errors[:MAX_STORED_ERRORS],
                message=f"Rejected: {summary_text}.",
            )
        )

    async def _link_taxonomy(
        self,
        session: AsyncSession,
        link_model,
        fk_name: str,
        pairs: set[tuple[UUID, int]],
    ) -> int:
        """Insert creator<->category / creator<->language links, idempotently.

        Returns rows actually written, not rows attempted. RETURNING under
        ON CONFLICT DO NOTHING yields only the inserts that happened, which is
        the difference between "1155 category links" on a re-ingest that changed
        nothing and the truthful "0".
        """
        if not pairs:
            return 0
        rows = [
            {"creator_id": creator_id, fk_name: taxonomy_id}
            for creator_id, taxonomy_id in sorted(
                pairs, key=lambda p: (str(p[0]), p[1])
            )
        ]
        written = 0
        chunk = max(1, PG_MAX_PARAMS // 2)
        for i in range(0, len(rows), chunk):
            result = await session.exec(
                pg_insert(link_model)
                .values(rows[i : i + chunk])
                .on_conflict_do_nothing(index_elements=["creator_id", fk_name])
                .returning(getattr(link_model, "creator_id"))
            )
            written += len(result.all())
        await session.flush()
        return written

    async def _link_creator_taxonomy(
        self,
        session: AsyncSession,
        parsed: list,
        creator_ids: dict[tuple, UUID],
        category_map: dict[str, int],
        language_map: dict[str, int],
    ) -> tuple[int, int]:
        """Attach every parsed row's categories and languages to its creator.

        Shared by both creator sources. `_reject_preflight` has already proved
        every name resolves, so a missing key here would be a bug, not data.
        """
        category_pairs: set[tuple[UUID, int]] = set()
        language_pairs: set[tuple[UUID, int]] = set()
        for r in parsed:
            creator_id = creator_ids.get((r.platform, r.username))
            if creator_id is None:
                continue
            cats, langs, _, _ = self._taxonomy_of(r, category_map, language_map)
            category_pairs.update((creator_id, category_map[c]) for c in cats)
            language_pairs.update((creator_id, language_map[l]) for l in langs)

        return (
            await self._link_taxonomy(
                session, CategoryCreatorLink, "category_id", category_pairs
            ),
            await self._link_taxonomy(
                session, LanguageCreatorLink, "language_id", language_pairs
            ),
        )

    async def _reject_duplicate_sheets(
        self,
        session: AsyncSession,
        parsed: list,
        existing: set[str],
        received: int,
    ) -> None:
        """Refuse a pitch_master batch that would put two pitches on one sheet.

        This is where the ambiguity is created. Creator rows are routed to a
        pitch by the Drive file id in its spreadsheet_link, so the moment two
        pitches share one, there is no answer to "which pitch does this creator
        belong to" -- and the old code picked one silently.

        The UNIQUE constraint on spreadsheet_link does not cover it: it compares
        whole URLs, and ".../edit" against ".../edit?gid=0" are two different
        strings naming one sheet.

        Only rows that would actually be inserted are checked. A row whose
        pitch_code already exists is skipped by the caller and changes nothing,
        so re-uploading an unchanged master file must not start failing.
        """
        incoming = [
            (p, extract_file_id(str(p.spreadsheet_link)))
            for p in parsed
            if p.pitch_code not in existing
        ]
        incoming = [(p, fid) for p, fid in incoming if fid]
        if not incoming:
            return

        blocking: list[IngestRowError] = []

        # Within the file: two new pitches naming one sheet.
        seen: dict[str, str] = {}
        for p, fid in incoming:
            first = seen.setdefault(fid, p.pitch_code)
            if first != p.pitch_code:
                blocking.append(
                    IngestRowError(
                        row=0,
                        field="spreadsheet_link",
                        code="duplicate_pitch_sheet",
                        message=(
                            f"{p.pitch_code} and {first} in this file use the same "
                            "spreadsheet. Give each pitch its own sheet."
                        ),
                    )
                )

        # Against the database: a sheet already claimed by a different pitch.
        rows = (
            await session.exec(
                select(Pitch.pitch_code, Pitch.spreadsheet_link).order_by(
                    col(Pitch.pitch_code)
                )
            )
        ).all()
        owner: dict[str, str] = {}
        for code, link in rows:
            fid = extract_file_id(link)
            if fid:
                owner.setdefault(fid, code)

        for p, fid in incoming:
            held_by = owner.get(fid)
            if held_by and held_by != p.pitch_code:
                blocking.append(
                    IngestRowError(
                        row=0,
                        field="spreadsheet_link",
                        code="duplicate_pitch_sheet",
                        message=(
                            f"{p.pitch_code} uses the spreadsheet already registered "
                            f"to {held_by}. Give it its own sheet, or correct "
                            f"{held_by} first."
                        ),
                    )
                )

        if not blocking:
            return

        self._raise_rejected(
            received=received,
            summary=[f"{len(blocking)} pitch(es) sharing a spreadsheet with another"],
            blocking=blocking,
            other=[],
            remedy=(
                "Creator rows are routed to a pitch by its spreadsheet, so two "
                "pitches on one sheet cannot be told apart. Fix the links and "
                "upload again."
            ),
        )

    @staticmethod
    def _reconcile(
        received: int,
        deduped: int,
        unit: str,
        inserted: int,
        already: int,
        updated: int = 0,
    ) -> str:
        """A sentence that accounts for every row that was uploaded.

        `received` minus `deduped` is what actually reaches the database, and
        without saying so the counts look like rows went missing: the run that
        prompted this reported 1243 received against 43 + 1131, with the other
        69 explained only by scattered warnings.
        """
        parts = [_plural(received, "row")]
        if deduped:
            unique = received - deduped
            noun = unit if unique == 1 else unit + "s"
            parts.append(
                f"{unique} unique {noun} "
                f"({_plural(deduped, 'duplicate row')} merged)"
            )
        head = " -> ".join(parts)

        tail = [f"{inserted} added"]
        if updated:
            tail.append(f"{updated} updated")
        if already:
            tail.append(f"{already} already present and unchanged")
        return f"{head}. " + ", ".join(tail) + "."

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
        parsed, errors, _ = await self.parser.parse_pitch_master(data)

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

        await self._reject_duplicate_sheets(session, parsed, existing, len(data))

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
            message=(
                f"{_plural(len(data), 'row')}. "
                f"{_plural(inserted, 'pitch', 'pitches')} added, "
                f"{skipped} already present and unchanged."
            ),
        )

    async def ingest_campaign_master_data(
        self, session: AsyncSession, data: list[dict]
    ) -> IngestResult:
        parsed, errors, _ = await self.parser.parse_campaign_master(data)

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
            message=(
                f"{_plural(len(data), 'row')}. "
                f"{_plural(inserted, 'campaign', 'campaigns')} added, "
                f"{skipped} already present and unchanged."
            ),
        )

    async def ingest_pitch_creator_data(
        self, session: AsyncSession, data: list[dict]
    ) -> IngestResult:
        """Pitch list rows -> Creator + PitchCreatorLink.

        Creators missing from the DB are created, and their category / language
        cells are linked to the taxonomy tables. Without that linking a creator
        whose only source is a pitch sheet is invisible to the category and
        language filters, which read the link tables rather than the raw column.
        """
        parsed, errors, deduped = await self.parser.parse_pitch_creator(data)

        # Every pitch per sheet, not the last one to come back. Two pitches on
        # one spreadsheet used to collapse into whichever the database happened
        # to return last -- and with no ORDER BY that was not even stable
        # between runs, so the same sheet landed on a different pitch four days
        # apart and its creators ended up on both.
        pitches_by_file: dict[str, list[tuple[UUID, str]]] = {}
        for pid, code, link in (
            await session.exec(
                select(Pitch.id, Pitch.pitch_code, Pitch.spreadsheet_link).order_by(
                    col(Pitch.pitch_code)
                )
            )
        ).all():
            fid = extract_file_id(link)
            if fid:
                pitches_by_file.setdefault(fid, []).append((pid, code))

        ambiguous: list[IngestRowError] = []
        ambiguous_sheets: set[str] = set()
        for r in parsed:
            candidates = pitches_by_file.get(r.source_file_id) or []
            if len(candidates) > 1:
                ambiguous_sheets.add(r.source_file_id)
                ambiguous.append(
                    IngestRowError(
                        row=r.sheet_row,
                        field="source_file_id",
                        code="ambiguous_pitch_sheet",
                        message=(
                            f"{' and '.join(c for _, c in candidates)} both use this "
                            "spreadsheet, so there is no way to tell which pitch this "
                            "row belongs to. Point one at its own sheet, or remove the "
                            "duplicate pitch, then upload again."
                        ),
                    )
                )

        category_map, language_map = await self._reject_preflight(
            session,
            parsed,
            errors,
            len(data),
            extra_blocking=ambiguous,
            extra_summary=(
                [f"{len(ambiguous_sheets)} spreadsheet(s) claimed by two pitches"]
                if ambiguous_sheets
                else None
            ),
        )

        # Proven unambiguous above, so one pitch per sheet from here.
        pitch_by_file = {fid: rows[0][0] for fid, rows in pitches_by_file.items()}

        wanted = {(r.platform, r.username) for r in parsed}
        existing = await self._load_creators(session, wanted)
        by_key = {(r.platform, r.username): r for r in parsed}
        created = await self._create_creators(session, wanted, by_key, existing)

        linked_categories, linked_languages = await self._link_creator_taxonomy(
            session, parsed, existing, category_map, language_map
        )

        # Scoped to the pitches this file touches -- not every pitch that has a
        # sheet. Loading the whole link table to answer "does this pair exist"
        # got slower with every ingest.
        pitch_ids = {
            pitch_by_file[r.source_file_id]
            for r in parsed
            if r.source_file_id in pitch_by_file
        }
        have: set[tuple[UUID, UUID]] = set()
        if pitch_ids:
            have = {
                (l.creator_id, l.pitch_id)
                for l in (
                    await session.exec(
                        select(PitchCreatorLink).where(
                            col(PitchCreatorLink.pitch_id).in_(pitch_ids)
                        )
                    )
                ).all()
            }

        inserted = skipped = 0
        link_rows = []
        for r in parsed:
            pitch_id = pitch_by_file.get(r.source_file_id)
            if pitch_id is None:
                errors.append(
                    IngestRowError(
                        row=r.sheet_row,
                        field="source_file_id",
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

            link_rows.append(
                {
                    "creator_id": creator_id,
                    "pitch_id": pitch_id,
                    **r.model_dump(exclude=PITCH_CREATOR_ONLY_FIELDS),
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
            message=(
                self._reconcile(
                    received=len(data),
                    deduped=deduped,
                    unit="creator/pitch pair",
                    inserted=inserted,
                    already=skipped,
                )
                + f" {created} creators created; {linked_categories} category and "
                f"{linked_languages} language links added."
            ),
        )

    async def ingest_campaign_creator_data(
        self, session: AsyncSession, data: list[dict]
    ) -> IngestResult:
        """Campaign Status + Tracker rows -> Creator + CampaignCreatorLink.

        Creators missing from the DB are created, and their category / language
        cells populate the two link tables.

        Re-ingesting a campaign UPDATES its existing links rather than skipping
        them: tracker numbers keep moving after a campaign goes live, so the
        newest export is the truth. Creator rows are left alone once they exist
        -- update-vs-skip for creator identity is still an open call, and
        overwriting a hand-corrected city from a campaign sheet is the more
        expensive mistake.
        """
        parsed, errors, deduped = await self.parser.parse_campaign_creator(data)

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
                    code="batch_rejected",
                    message=(
                        "Parsed record has fields with no CampaignCreatorLink "
                        f"column: {sorted(unknown_cols)}"
                    ),
                )
            )
            raise IngestRejected(
                IngestResult(
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
            )

        category_map, language_map = await self._reject_preflight(
            session, parsed, errors, len(data)
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
        existing = await self._load_creators(session, wanted)
        by_key = {(r.platform, r.username): r for r in parsed}
        created = await self._create_creators(session, wanted, by_key, existing)

        # ---- category / language links --------------------------------------
        linked_categories, linked_languages = await self._link_creator_taxonomy(
            session, parsed, existing, category_map, language_map
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
                await session.exec(
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
                self._reconcile(
                    received=len(data),
                    deduped=deduped,
                    unit="creator/campaign pair",
                    inserted=len(insert_rows),
                    already=0,
                    updated=len(update_rows),
                )
                + f" {created} creators created; {linked_categories} category and "
                f"{linked_languages} language links added."
            ),
        )
