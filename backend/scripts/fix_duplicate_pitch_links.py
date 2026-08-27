"""Find and remove pitch-creator links that are copies of another pitch's.

WHY THIS EXISTS
---------------
`ingest_pitch_creator_data` routes each row to a pitch by the Drive file id in
`pitch.spreadsheet_link`:

    pitch_by_file[extract_file_id(link)] = pid   # last write wins, SELECT unordered

When two pitches carried the same file id, that dict silently kept one of them --
and because the SELECT had no ORDER BY, *which* one was not stable between runs.
Two ingests of the same sheet four days apart therefore wrote the same creators
to two different pitches, doubling their cost in every total.

Correcting the pitch record afterwards does not undo the links, and once the link
is fixed the damage is no longer visible in the spreadsheet ids at all. So this
works off the link rows: the same creator on two pitches with identical
commercial terms is the fingerprint.

SAFETY
------
Report-only unless you name a pitch with --from AND pass --apply. Deletion is
never inferred: a creator genuinely pitched to two campaigns at the same rate
looks exactly like a duplicate, and only a person knows which is which.

    python scripts/fix_duplicate_pitch_links.py
    python scripts/fix_duplicate_pitch_links.py --from PITCH-MAY-057-2026
    python scripts/fix_duplicate_pitch_links.py --from PITCH-MAY-057-2026 --apply
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Run as `python scripts/fix_duplicate_pitch_links.py` from backend/ and Python
# puts scripts/ on the path, not backend/ -- so `app` would not import.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import text
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.db import Session_Factory

#: The composite key. Everything else describes the deal, and so decides whether
#: two rows are one row written twice. Read from the live table rather than
#: hardcoded, so a new column is compared automatically instead of silently
#: widening what counts as a duplicate.
_IDENTITY_COLUMNS = ("creator_id", "pitch_id")

#: The Aug 21 code path wrote NULL where today's writes "". That is an artifact
#: of the writer, not a difference in the deal, so text is compared via coalesce.
_TEXTUAL = {"character varying", "text"}


async def _link_columns(session: AsyncSession) -> list[tuple[str, str]]:
    rows = (
        await session.exec(
            text(
                """
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'pitchcreatorlink'
                ORDER BY ordinal_position
                """
            )
        )
    ).all()
    return [(c, t) for c, t in rows if c not in _IDENTITY_COLUMNS]


def _same_row(columns: list[tuple[str, str]]) -> str:
    parts = []
    for name, data_type in columns:
        if data_type in _TEXTUAL:
            parts.append(f"coalesce(a.{name}, '') = coalesce(b.{name}, '')")
        else:
            parts.append(f"a.{name} IS NOT DISTINCT FROM b.{name}")
    return "\n              AND ".join(parts)


def _has_substance(columns: list[tuple[str, str]]) -> str:
    """At least one number on the row is non-zero.

    Used only to decide whether a *pair of pitches* is worth reporting. Rows
    where nobody filled in a cost or a deliverable count match every other such
    row, so without this the report fills with pitches sharing nothing but blank
    lines.

    Deliberately NOT applied when collecting rows to delete: once a pair is
    established, its blank duplicates are duplicates too, and leaving them
    behind would strand orphan links on the pitch being cleaned.
    """
    numeric = [name for name, data_type in columns if data_type == "integer"]
    return "(" + " OR ".join(f"a.{name} <> 0" for name in numeric) + ")"


def _rupees(value) -> str:
    return f"Rs {value or 0:,}"


async def _pitch_summary(session: AsyncSession, codes: list[str]) -> dict:
    if not codes:
        return {}
    rows = (
        await session.exec(
            text(
                """
                SELECT p.pitch_code, p.campaign_name, p.created_at, p.spreadsheet_link,
                       count(l.creator_id) AS links,
                       coalesce(sum(l.final_cost), 0) AS final_cost,
                       coalesce(sum(l.brand_cost), 0) AS brand_cost
                FROM pitch p
                LEFT JOIN pitchcreatorlink l ON l.pitch_id = p.id
                WHERE p.pitch_code = ANY(:codes)
                GROUP BY p.pitch_code, p.campaign_name, p.created_at, p.spreadsheet_link
                """
            ).bindparams(codes=list(codes))
        )
    ).all()
    return {r[0]: r for r in rows}


async def find_duplicate_pairs(session: AsyncSession, minimum: int) -> list[tuple]:
    """(older, newer, shared, shared_final, shared_brand) per duplicated pair.

    `b.pitch_id > a.pitch_id` yields each unordered pair once; the CASE then
    relabels by (created_at, pitch_code) so "older"/"newer" is stable and
    meaningful -- self-join order is UUID order, which is arbitrary.
    """
    columns = await _link_columns(session)
    sql = f"""
        WITH ranked AS (
            SELECT
              CASE WHEN (p1.created_at, p1.pitch_code) <= (p2.created_at, p2.pitch_code)
                   THEN p1.pitch_code ELSE p2.pitch_code END AS older,
              CASE WHEN (p1.created_at, p1.pitch_code) <= (p2.created_at, p2.pitch_code)
                   THEN p2.pitch_code ELSE p1.pitch_code END AS newer,
              a.final_cost, a.brand_cost
            FROM pitchcreatorlink a
            JOIN pitchcreatorlink b
              ON b.creator_id = a.creator_id
             AND b.pitch_id > a.pitch_id
            JOIN pitch p1 ON p1.id = a.pitch_id
            JOIN pitch p2 ON p2.id = b.pitch_id
            WHERE {_same_row(columns)}
              AND {_has_substance(columns)}
        )
        SELECT older, newer, count(*) AS shared,
               sum(final_cost) AS shared_final, sum(brand_cost) AS shared_brand
        FROM ranked
        GROUP BY 1, 2
        HAVING count(*) >= {minimum}
        ORDER BY 3 DESC, 1, 2
    """
    return (await session.exec(text(sql))).all()


async def duplicated_against(
    session: AsyncSession, code: str, counterparts: list[str]
) -> list[tuple]:
    """(creator_id, username, other_pitch_code) for links on `code` copied from
    one of `counterparts`.

    No substance filter here -- see `_has_substance`.
    """
    columns = await _link_columns(session)
    sql = f"""
        SELECT DISTINCT a.creator_id, c.username, p2.pitch_code
        FROM pitchcreatorlink a
        JOIN pitch p1 ON p1.id = a.pitch_id AND p1.pitch_code = :code
        JOIN pitchcreatorlink b
          ON b.creator_id = a.creator_id
         AND b.pitch_id <> a.pitch_id
        JOIN pitch p2 ON p2.id = b.pitch_id AND p2.pitch_code = ANY(:counterparts)
        JOIN creator c ON c.id = a.creator_id
        WHERE {_same_row(columns)}
        ORDER BY 2
    """
    return (
        await session.exec(
            text(sql).bindparams(code=code, counterparts=list(counterparts))
        )
    ).all()


async def report(session: AsyncSession, minimum: int) -> None:
    pairs = await find_duplicate_pairs(session, minimum)

    print("=" * 78)
    print("DUPLICATED PITCH-CREATOR LINKS")
    print("=" * 78)
    if not pairs:
        print("\n  None found. Nothing to clean up.\n")
        return

    summary = await _pitch_summary(session, {c for p in pairs for c in p[:2]})

    for older, newer, shared, shared_final, shared_brand in pairs:
        print(f"\n  {shared} identical creator rows on BOTH of these pitches:\n")
        for code, label in ((older, "older"), (newer, "newer")):
            _, campaign, created, link, links, final, brand = summary[code]
            print(f"    {code}  ({label})")
            print(f"      campaign : {campaign}")
            print(f"      created  : {str(created)[:19]}")
            print(f"      links    : {links}    final {_rupees(final)}    brand {_rupees(brand)}")
            print(f"      sheet    : {link}")
        # The duplicated rows' own totals, not the pitches' -- when only part of
        # a pitch overlaps, its full total is not what is double-counted.
        print(
            f"\n      double-counted: {_rupees(shared_final)} final,"
            f" {_rupees(shared_brand)} brand"
        )
        if summary[newer][4] == shared:
            print("      every link on the newer pitch is a copy -- to remove them:")
            print(
                f"         python scripts/fix_duplicate_pitch_links.py"
                f" --from {newer} --apply"
            )
        else:
            # Partial overlap is the ordinary case of the same creators being
            # pitched twice at the same rate, so don't advertise a delete here.
            print(
                f"      only {shared} of the newer pitch's {summary[newer][4]} links"
                f" overlap, so this is\n      probably the same creators pitched"
                f" twice rather than damage. Left alone."
            )
    print()


async def report_shared_sheets(session: AsyncSession) -> None:
    """Pitches still resolving to one Drive file id -- the cause of all this.

    The UNIQUE constraint on spreadsheet_link compares the whole URL, so two
    links differing only by a "?gid=..." suffix both pass it while pointing at
    the same sheet.
    """
    rows = (
        await session.exec(
            text(
                """
                WITH f AS (
                    SELECT id, pitch_code, created_at,
                           substring(spreadsheet_link from '/d/([A-Za-z0-9_-]+)') AS fid
                    FROM pitch
                    WHERE spreadsheet_link ~ '/d/'
                )
                SELECT g.fid, g.codes, g.pitches,
                       (SELECT count(*) FROM pitchcreatorlink l
                        JOIN f f2 ON f2.id = l.pitch_id
                        WHERE f2.fid = g.fid) AS links
                FROM (
                    SELECT fid,
                           string_agg(pitch_code, ', ' ORDER BY created_at, pitch_code) AS codes,
                           count(*) AS pitches
                    FROM f GROUP BY fid HAVING count(*) > 1
                ) g
                ORDER BY 4 DESC, 1
                """
            )
        )
    ).all()

    print("=" * 78)
    print("PITCHES STILL SHARING ONE SPREADSHEET")
    print("=" * 78)
    if not rows:
        print("\n  None. Every pitch resolves to its own sheet.\n")
        return

    print("\n  A pitch_creator upload for one of these lands on whichever pitch the")
    print("  ingest happens to pick. Give one of each set its own sheet first.\n")
    for fid, codes, pitches, links in rows:
        newest = codes.split(", ")[-1]
        print(f"    {fid}")
        print(f"      {pitches} pitches: {codes}")
        print(f"      links attached across them: {links}")
        print("      -- not executed; run it once you know the correct link:")
        print(
            f"      UPDATE pitch SET spreadsheet_link = '<its own sheet URL>'"
            f" WHERE pitch_code = '{newest}';"
        )
    print()


async def detach(session: AsyncSession, code: str, apply: bool, partial: bool) -> int:
    print("=" * 78)
    print(f"DETACH DUPLICATES FROM {code}")
    print("=" * 78)

    summary = await _pitch_summary(session, [code])
    if code not in summary:
        print(f"\n  No pitch with code {code!r}.\n")
        return 1
    total = summary[code][4]

    pairs = await find_duplicate_pairs(session, minimum=1)
    counterparts = sorted(
        {other for a, b, *_ in pairs for one, other in ((a, b), (b, a)) if one == code}
    )
    if not counterparts:
        print(f"\n  links on this pitch : {total}")
        print("  Nothing on this pitch duplicates another pitch. No change.\n")
        return 0

    duplicated = await duplicated_against(session, code, counterparts)
    print(f"\n  links on this pitch  : {total}")
    print(f"  of those, duplicated : {len(duplicated)}")
    print(f"  duplicated against   : {', '.join(counterparts)}")

    if len(duplicated) < total and not partial:
        # A pitch whose list only partly overlaps another is the ordinary case of
        # the same creators being pitched twice at the same rate. Deleting the
        # overlap would silently shorten a legitimate list.
        print(
            f"\n  REFUSED: only {len(duplicated)} of this pitch's {total} links are"
            f" duplicates.\n"
            "  That usually means the same creators were pitched to two campaigns at\n"
            "  the same rate, which is real data, not damage. Check it by hand, and\n"
            "  re-run with --partial if you are certain.\n"
        )
        return 2

    print("\n  creators whose link would be removed from this pitch:")
    for _, username, other in duplicated[:10]:
        print(f"    @{username}  (kept on {other})")
    if len(duplicated) > 10:
        print(f"    ... and {len(duplicated) - 10} more")

    before = await _pitch_summary(session, [code, *counterparts])
    result = await session.exec(
        text(
            """
            DELETE FROM pitchcreatorlink
            WHERE pitch_id = (SELECT id FROM pitch WHERE pitch_code = :code)
              AND creator_id = ANY(:ids)
            """
        ).bindparams(code=code, ids=[row[0] for row in duplicated])
    )
    after = await _pitch_summary(session, [code, *counterparts])

    print(f"\n  {result.rowcount} link rows {'deleted' if apply else 'would be deleted'}:\n")
    print(f"    {'pitch':22} {'links':>13}      {'final_cost':<28}")
    for pitch_code in [code, *counterparts]:
        b, a = before[pitch_code], after[pitch_code]
        print(
            f"    {pitch_code:22} {b[4]:>5} -> {a[4]:<5} "
            f"{_rupees(b[5]):>13} -> {_rupees(a[5]):<13}"
        )

    if apply:
        await session.commit()
        print("\n  COMMITTED.\n")
    else:
        await session.rollback()
        print("\n  Rolled back -- nothing written. Re-run with --apply to commit.\n")
    return 0


async def main() -> int:
    parser = argparse.ArgumentParser(
        description="Report, and optionally remove, duplicated pitch-creator links."
    )
    parser.add_argument(
        "--from",
        dest="from_pitch",
        metavar="PITCH_CODE",
        help="Remove duplicated links from this pitch, keeping the other side.",
    )
    parser.add_argument(
        "--apply", action="store_true", help="Commit. Without this, changes roll back."
    )
    parser.add_argument(
        "--partial",
        action="store_true",
        help="Allow detaching when only some of the pitch's links are duplicates.",
    )
    parser.add_argument(
        "--min-shared",
        type=int,
        default=2,
        help="Only report pairs sharing at least this many identical rows (default 2).",
    )
    args = parser.parse_args()

    async with Session_Factory() as session:
        if args.from_pitch:
            status = await detach(session, args.from_pitch, args.apply, args.partial)
            await report_shared_sheets(session)
            return status

        await report(session, args.min_shared)
        await report_shared_sheets(session)
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
