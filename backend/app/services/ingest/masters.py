from typing import Any, Literal, Optional
from datetime import date, datetime, UTC
import re
from uuid import uuid4

from sqlmodel import select, col
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Pitch, Campaign
from app.models.enums import (
    OrgTypeChoices,
    PlatformChoices,
    PitchRequirementChoices,
    CampaignStatusChoices,
    MonthChoices,
)
from app.schemas.ingest import RowError
from app.services.ai import AISpec
from .common import RowReader, Record, duplicates, brand_ids, bulk_insert
from . import cells


def _choices(enum, drop=("NA",)) -> Any:
    return Literal[tuple(m.value for m in enum if m.value not in drop)]


def _pitch_code(r: RowReader, key: str, year: Optional[int]) -> Optional[str]:
    code = r.get(key, required=True)
    if not code:
        return None
    code = code.upper()
    return (
        code if re.search(r"-\d{4}$", code) else f"{code}-{year or date.today().year}"
    )


def _brand(r: RowReader) -> tuple[str, str] | None:
    name = r.get("brand_name", required=True)
    return (name.lower(), name) if name else None


class PitchMaster:
    label = "Pitch Master"
    table = Pitch
    ai = AISpec(
        name="pitch_master",
        instructions="""Each row is a pitch to a client.
- org_type: the kind of client. Cells look like "Brand - Core", "brand-other", \
"Agency", "Retainer account".
- requirement: what the client asked for. Cells lok like "List", "Plan", \
"List and Plan", "Content buckets", "Media plan", "Production", \
"Content buckets and list", "Demographics/Data".
- platforms: every platform the cell names ("Insta + YT" is instagram and \
youtube; "IG" is instagram).
""",
        covers={
            "org_type": ("org_type",),
            "requirement": ("requirement",),
            "platform": ("platforms",),
        },
        fields=lambda _: {
            "org_type": (Optional[_choices(OrgTypeChoices)], ...),
            "requirement": (Optional[_choices(PitchRequirementChoices)], ...),
            "platforms": (list[_choices(PlatformChoices)], ...),
        },
    )

    def parse(self, rows: list[dict]) -> tuple[list[Record], list[RowError]]:
        records, errors = [], []
        for i, raw in enumerate(rows, start=1):
            r = RowReader(raw, i, errors)
            year = r.get("year", cells.whole) or None
            records.append(
                Record(
                    row=i,
                    data={
                        "pitch_code": _pitch_code(r, "pitch_code", year),
                        "brand": _brand(r),
                        "campaign_name": r.get("campaign_name", required=True),
                        "sales_lead": r.get("sales_lead", required=True),
                        "list_lead": r.get("list_lead"),
                        "spreadsheet_id": r.get("spreadsheet_link", cells.drive_id),
                    },
                    ai_input={k: cells.text(raw.get(k)) for k in self.ai.covers},
                )
            )
        return records, errors

    def apply_ai(self, rec: Record) -> None:
        a = rec.ai
        rec.data["org_type"] = (
            OrgTypeChoices(a["org_type"]) if a["org_type"] else OrgTypeChoices.NA
        )
        rec.data["requirement"] = (
            PitchRequirementChoices(a["requirement"])
            if a["requirement"]
            else PitchRequirementChoices.NA
        )
        rec.data["platform"] = [PlatformChoices(p) for p in a["platforms"]] or [
            PlatformChoices.NA
        ]

    async def validate(
        self, session: AsyncSession, records: list[Record]
    ) -> list[RowError]:
        errors = duplicates(records, lambda r: r.data["pitch_code"], "pitch_code")
        errors += duplicates(
            records, lambda r: r.data["spreadsheet_id"], "spreadsheet_link"
        )
        sheets = {r.data["spreadsheet_id"]: r for r in records}
        owners = await session.exec(
            select(Pitch.spreadsheet_id, Pitch.pitch_code).where(
                col(Pitch.spreadsheet_id).in_(sheets)
            )
        )
        for sheet, code in owners.all():
            rec = sheets[sheet]
            if code != rec.data["pitch_code"]:
                errors.append(
                    RowError(
                        row=rec.row,
                        field="spreadsheet_link",
                        message=f"this spreadsheet already belongs to {code}",
                    )
                )
        return errors

    async def write(
        self, session: AsyncSession, records: list[Record], taxonomy
    ) -> tuple[dict, str]:
        codes = [r.data["pitch_code"] for r in records]
        existing = set(
            (
                await session.exec(
                    select(Pitch.pitch_code).where(col(Pitch.pitch_code).in_(codes))
                )
            ).all()
        )
        new = [r.data for r in records if r.data["pitch_code"] not in existing]
        brands, brands_created = await brand_ids(session, dict(d["brand"] for d in new))
        now = datetime.now(UTC)
        await bulk_insert(
            session,
            Pitch,
            [
                {
                    "id": uuid4(),
                    "created_at": now,
                    "updated_at": now,
                    "brand_id": brands[d["brand"][0]],
                    **{k: v for k, v in d.items() if k != "brand"},
                }
                for d in new
            ],
        )
        counts = {"inserted": len(new), "skipped": len(existing)}
        return (
            counts,
            f"{len(new)} pitches added, {len(existing)} already present, {brands_created} new brands.",
        )


class CampaignMaster:
    label = "Campaign Master"
    table = Campaign
    ai = AISpec(
        name="campaign_master",
        instructions="""Each row is a running or finished campaign.
- status and report_status: the campaign's / report's progress. Cells look like \
"Completed", "Done", "On hold", "Paused", "Scrapped", "Cancelled", "WIP", \
"In progress".""",
        covers={"status": ("status",), "report_status": ("report_status",)},
        fields=lambda _: {
            "status": (Optional[_choices(CampaignStatusChoices, drop=())], ...),
            "report_status": (Optional[_choices(CampaignStatusChoices, drop=())], ...),
        },
    )

    def parse(self, rows: list[dict]) -> tuple[list[Record], list[RowError]]:
        records, errors = [], []
        for i, raw in enumerate(rows, start=1):
            r = RowReader(raw, i, errors)
            year = r.get("year", cells.whole, required=True)
            month = r.get("month_name", required=True)
            if month and month.lower() not in {m.value for m in MonthChoices}:
                month = r.fail("month_name", f"{month!r} is not a month")
            data = {
                "campaign_code": (r.get("campaign_code", required=True) or "").upper()
                or None,
                "month_name": MonthChoices(month.lower()) if month else None,
                "year": year,
                "brand": _brand(r),
                "campaign_name": r.get("campaign_name", required=True),
                "manager": r.get("manager", required=True),
                "member_names": r.get("member_names", cells.names),
                "spreadsheet_id": r.get("spreadsheet_link", cells.drive_id),
                "report_id": r.get("report_link", cells.drive_id),
                "start_date": r.get("start_date", cells.day, required=True),
                "expected_end_date": r.get(
                    "expected_end_date", cells.day, required=True
                ),
                "end_date": r.get("end_date", cells.day),
                "report_completion_date": r.get("report_completion_date", cells.day),
                "pitch_code": _pitch_code(r, "pitch_code", year),
            }
            if (
                data["start_date"]
                and data["expected_end_date"]
                and data["start_date"] > data["expected_end_date"]
            ):
                r.fail("expected_end_date", "is before start_date")
            records.append(
                Record(
                    row=i,
                    data=data,
                    ai_input={k: cells.text(raw.get(k)) for k in self.ai.covers},
                )
            )
        return records, errors

    def apply_ai(self, rec: Record) -> None:
        status = CampaignStatusChoices(rec.ai["status"] or "wip")
        report = rec.ai["report_status"]
        rec.data["status"] = status
        rec.data["report_status"] = (
            CampaignStatusChoices(report)
            if report
            else (
                status
                if status == CampaignStatusChoices.SCRAPPED
                else CampaignStatusChoices.WIP
            )
        )

    async def validate(
        self, session: AsyncSession, records: list[Record]
    ) -> list[RowError]:
        errors = duplicates(records, lambda r: r.data["campaign_code"], "campaign_code")
        errors += duplicates(
            records, lambda r: r.data["spreadsheet_id"], "spreadsheet_link"
        )
        errors += duplicates(records, lambda r: r.data["report_id"], "report_link")

        pitch_codes = {r.data["pitch_code"] for r in records}
        known = set(
            (
                await session.exec(
                    select(Pitch.pitch_code).where(
                        col(Pitch.pitch_code).in_(pitch_codes)
                    )
                )
            ).all()
        )
        for r in records:
            if r.data["pitch_code"] not in known:
                errors.append(
                    RowError(
                        row=r.row,
                        field="pitch_code",
                        message=f"no pitch {r.data['pitch_code']!r}; ingest pitch_master first",
                    )
                )

        for column, field_name in (
            (Campaign.spreadsheet_id, "spreadsheet_link"),
            (Campaign.report_id, "report_link"),
        ):
            key = column.key
            ids = {r.data[key]: r for r in records}
            owners = await session.exec(
                select(column, Campaign.campaign_code).where(col(column).in_(ids))
            )
            for value, code in owners.all():
                if code != ids[value].data["campaign_code"]:
                    errors.append(
                        RowError(
                            row=ids[value].row,
                            field=field_name,
                            message=f"already belongs to campaign {code}",
                        )
                    )
        return errors

    async def write(
        self, session: AsyncSession, records: list[Record], taxonomy
    ) -> tuple[dict, str]:
        codes = [r.data["campaign_code"] for r in records]
        existing = set(
            (
                await session.exec(
                    select(Campaign.campaign_code).where(
                        col(Campaign.campaign_code).in_(codes)
                    )
                )
            ).all()
        )
        new = [r.data for r in records if r.data["campaign_code"] not in existing]
        brands, brands_created = await brand_ids(session, dict(d["brand"] for d in new))
        pitches = dict(
            (
                await session.exec(
                    select(Pitch.pitch_code, Pitch.id).where(
                        col(Pitch.pitch_code).in_({d["pitch_code"] for d in new})
                    )
                )
            ).all()
        )
        await bulk_insert(
            session,
            Campaign,
            [
                {
                    "id": uuid4(),
                    **{k: v for k, v in d.items() if k not in ("brand", "pitch_code")},
                    "brand_id": brands[d["brand"][0]],
                    "pitch_id": pitches[d["pitch_code"]],
                }
                for d in new
            ],
        )
        counts = {"inserted": len(new), "skipped": len(existing)}
        return (
            counts,
            f"{len(new)} campaigns added, {len(existing)} campaigns already present, {brands_created} new brands.",
        )
