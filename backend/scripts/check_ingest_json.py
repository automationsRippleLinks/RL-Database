# scripts/check_ingest_json.py
"""Dry-parse a master export and report what the ingest would make of it.

    python scripts/check_ingest_json.py <file.json> pitch|campaign
"""

import asyncio
import json
import sys
from pathlib import Path

# Run as `python scripts/check_ingest_json.py` from backend/ and Python puts
# scripts/ on the path, not backend/ -- so `app` would not import.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.parser import Parser, extract_file_id


async def main(path, kind):
    data = json.load(open(path, encoding="utf-8"))
    rows = data.get("data") if isinstance(data, dict) else data
    parse = (
        Parser().parse_pitch_master
        if kind == "pitch"
        else Parser().parse_campaign_master
    )
    parsed, errors, _ = await parse(rows)
    print(f"{len(rows)} rows -> {len(parsed)} ok, {len(errors)} failed")
    for e in errors:
        print(f"  row {e.row}: {e.message}")

    # Two pitches on one spreadsheet is a rejection now: creator rows are routed
    # to a pitch by its sheet, so a shared one cannot be resolved. Compared on
    # the Drive file id, not the URL -- ".../edit" and ".../edit?gid=0" are two
    # strings naming one sheet, which is how the duplicates got in unnoticed.
    by_file: dict[str, list[str]] = {}
    for p in parsed:
        fid = extract_file_id(str(p.spreadsheet_link))
        if fid:
            code = getattr(p, "pitch_code", None) or getattr(p, "campaign_code", "?")
            by_file.setdefault(fid, []).append(code)
    for fid, codes in by_file.items():
        if len(codes) > 1:
            print(f"DUPLICATE sheet {fid}: {', '.join(sorted(codes))}")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[2] not in {"pitch", "campaign"}:
        sys.exit(__doc__)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
