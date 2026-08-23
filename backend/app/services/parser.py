"""Raw ingest rows -> validated intermediate models.

Every row is parsed independently: a bad row yiels an IngestRowError and
is skipped rather than aborting the batch. Enum coercion is total -- an unknown
value maps to the NA member instead of raising.
"""

from typing import NamedTuple, Any, Optional
from datetime import date, datetime, timezone, timedelta
import re

from pydantic import ValidationError

from app.schemas.apps_script_response import PitchMasterRow, CampaignMasterRow, PitchCreatorRow, CampaignCreatorRow
from app.schemas.ingest import Pitch, Campaign, IngestRowError, CreatorLinkRecord
from app.models.enums import (
    OrgTypeChoices,
    PitchRequirementChoices,
    PlatformChoices,
    CampaignStatusChoices,
    MonthChoices,
    TierChoices,
)

IST = timezone(timedelta(hours=5, minutes=30))

_YEAR_SUFFIX = re.compile(r"-\d{4}$")

_ORG_TYPE = {
    "brand - core": OrgTypeChoices.BRAND_CORE,
    "brand-core": OrgTypeChoices.BRAND_CORE,
    "brand - other": OrgTypeChoices.BRAND_OTHER,
    "brand-other": OrgTypeChoices.BRAND_OTHER,
    "agency": OrgTypeChoices.AGENCY,
    "retainer account": OrgTypeChoices.RETAINER_ACC,
    "retainer_account": OrgTypeChoices.RETAINER_ACC,
}

_REQUIREMENT = {
    "list": PitchRequirementChoices.LIST,
    "plan": PitchRequirementChoices.PLAN,
    "list and plan": PitchRequirementChoices.LIST_AND_PLAN,
    "content buckets": PitchRequirementChoices.CONTENT_BUCKETS,
    "media plan": PitchRequirementChoices.MEDIA_PLAN,
    "production": PitchRequirementChoices.PRODUCTION,
    "content buckets and list": PitchRequirementChoices.CONTENT_BUCKETS_AND_LIST,
    "demographics/data": PitchRequirementChoices.DEMOGRAPHICS_DATA,
}

_PLATFORM = {
    "instagram": [PlatformChoices.INSTAGRAM],
    "insta": [PlatformChoices.INSTAGRAM],
    "ig": [PlatformChoices.INSTAGRAM],
    "yt": [PlatformChoices.YOUTUBE],
    "youtube": [PlatformChoices.YOUTUBE],
    "linkedin": [PlatformChoices.LINKEDIN],
    "facebook": [PlatformChoices.FACEBOOK],
    "others": [PlatformChoices.OTHERS],
    "insta + yt": [PlatformChoices.INSTAGRAM, PlatformChoices.YOUTUBE],
    "insta + others": [PlatformChoices.INSTAGRAM, PlatformChoices.OTHERS],
    "yt & linkedin": [PlatformChoices.YOUTUBE, PlatformChoices.LINKEDIN],
    "ig & linkedin": [PlatformChoices.INSTAGRAM, PlatformChoices.LINKEDIN],
}

_DATE_FORMATS = ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d.%m.%Y")

_PLATFORM_DOMAINS = [
    ("instagram.", PlatformChoices.INSTAGRAM),
    ("youtube.", PlatformChoices.YOUTUBE),
    ("youtu.be", PlatformChoices.YOUTUBE),
    ("linkedin.", PlatformChoices.LINKEDIN),
    ("facebook.", PlatformChoices.FACEBOOK),
    ("fb.com", PlatformChoices.FACEBOOK)
]

_HANDLE_RE = re.compile(
    r"(?:instagram|youtube|linkedin|facebook)\.[a-z.]+/"
    r"(?:in/|@|channel/|c/|user/)?([^/?#\s\\]+)",
    re.I,
)

_TIER = {
    "nano": TierChoices.NANO,
    "micro": TierChoices.MICRO,
    "micro 1": TierChoices.MICRO,
    "micro 2": TierChoices.MICRO,
    "micfro": TierChoices.MICRO,
    "mid": TierChoices.MID_TIER,
    "mid tier": TierChoices.MID_TIER,
    "mid-tier": TierChoices.MID_TIER,
    "mid-tier 1": TierChoices.MID_TIER,
    "macro": TierChoices.MACRO,
    "mega": TierChoices.MEGA,
    "celeb": TierChoices.CELEB,
}

_GENDER = {
    "female": "Female",
    "male": "Male",
    "couple": "Couple",
    "community": "Community",
}

_FILE_ID_RE = re.compile(r"/d/([a-zA-Z0-9_-]+)")

class ParseOutcome(NamedTuple):
    rows: list[Pitch] | list[Campaign] | list[CreatorLinkRecord]
    errors: list[IngestRowError]


def _clean(value: Any) -> str:
    return " ".join(str(value or "").split())


def _key(value: Any) -> str:
    return _clean(value).lower()


def normalize_brand_name(raw: Any) -> str:
    return _key(raw)


def _pitch_code(raw: Any, year: Optional[int]) -> str:
    code = _clean(raw).upper()
    if not code:
        raise ValueError("pitch_code: missing")
    if _YEAR_SUFFIX.search(code): # if not _YEAR_SUFFIX.search(code) # strict mode
        # raise ValueError(f"pitch_code: expected a -YYYY suffix, got {code!r}")  # strict mode, TODO: enable this after sheet migration
        return code
    return f"{code}-{year or date.today().year}" # return code, strict mode


def _parse_date(value: Any, field: str) -> Optional[date]:
    text = _clean(value)
    if not text:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue

    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        raise ValueError(f"{field}: unrecognized date {text!r}")
    if dt.tzinfo is not None:
        dt = dt.astimezone(IST)
    return dt.date()

def _platform_of(link: str, sheet_fallback: str) -> Optional[PlatformChoices]:
    low = _clean(link).lower()
    for needle, platform in _PLATFORM_DOMAINS:
        if needle in low:
            return platform
    return {
        "instagram": PlatformChoices.INSTAGRAM,
        "youtube": PlatformChoices.YOUTUBE
    }.get(sheet_fallback.lower())

def _handle_of(link: str) -> Optional[str]:
    m = _HANDLE_RE.search(_clean(link))
    return m.group(1).lstrip("@").rstrip("\\").lower() if m else None

def _num(value: Any) -> tuple[int, Optional[str]]:
    if isinstance(value, bool):
        return 0, None
    if isinstance(value, (int, float)):
        return int(value), None
    text = _clean(value)
    if not text:
        return 0, None
    stripped = text.replace(",","").replace("₹", "").strip()
    if re.fullmatch(r"\d+(\.\d+)?", stripped):
        return int(float(stripped)), None
    return 0, f"unparseable number {text!r} -> 0"

def _bool_cell(value:Any) -> bool:
    return _key(value) in {"yes", "true", "1", "y"}

def extract_file_id(url: Any) -> Optional[str]:
    m = _FILE_ID_RE.search(str(url or ""))
    return m.group(1) if m else None


class Parser:

    async def parse_pitch_master(self, raw_data: list[dict]) -> ParseOutcome:
        rows, errors = [], []
        for i, raw in enumerate(raw_data):
            try:
                r = PitchMasterRow.model_validate(raw)
                rows.append(
                    Pitch(
                        pitch_code=_pitch_code(r.pitch_code, r.year),
                        org_type=_ORG_TYPE.get(_key(r.org_type), OrgTypeChoices.NA),
                        brand_name=normalize_brand_name(r.brand_name),
                        brand_display_name=_clean(r.brand_name),
                        campaign_name=_clean(r.campaign_name),
                        requirement=_REQUIREMENT.get(
                            _key(r.requirement), PitchRequirementChoices.NA
                        ),
                        platform=_PLATFORM.get(_key(r.platform), [PlatformChoices.NA]),
                        sales_lead=_clean(r.sales_lead),
                        list_lead=_clean(r.list_lead),
                        spreadsheet_link=str(r.spreadsheet_link),
                    )
                )
            except (ValidationError, ValueError) as e:
                errors.append(IngestRowError(row=i, message=str(e)))
        return ParseOutcome(rows, errors)

    async def parse_campaign_master(self, raw_data: list[dict]) -> ParseOutcome:
        rows, errors = [], []
        for i, raw in enumerate(raw_data):
            try:
                r = CampaignMasterRow.model_validate(raw)

                status = (
                    CampaignStatusChoices(_key(r.status))
                    if _key(r.status)
                    else CampaignStatusChoices.WIP
                )
                if _clean(r.report_status):
                    report_status = CampaignStatusChoices(_key(r.report_status))
                elif status == CampaignStatusChoices.SCRAPPED:
                    report_status = status
                else:
                    report_status = CampaignStatusChoices.WIP

                rows.append(
                    Campaign(
                        campaign_code=_clean(r.campaign_code).upper(),
                        month_name=MonthChoices(_key(r.month_name)),
                        year=r.year,
                        brand_name=normalize_brand_name(r.brand_name),
                        brand_display_name=_clean(r.brand_name),
                        campaign_name=_clean(r.campaign_name),
                        manager=_clean(r.manager),
                        member_names=[
                            _clean(m) for m in (r.member_names or []) if _clean(m)
                        ],
                        spreadsheet_link=str(r.spreadsheet_link),
                        report_link=str(r.report_link),
                        status=status,
                        expected_end_date=_parse_date(
                            r.expected_end_date, "expected_end_date"
                        ),
                        start_date=_parse_date(r.start_date, "start_date"),
                        end_date=_parse_date(r.end_date, "end_date"),
                        report_status=report_status,
                        report_completion_date=_parse_date(
                            r.report_completion_date, "report_completion_date"
                        ),
                        pitch_code=_pitch_code(r.pitch_code, r.year),
                    )
                )
            except (ValidationError, ValueError) as e:
                errors.append(IngestRowError(row=i, message=str(e)))
        return ParseOutcome(rows, errors)

    async def parse_pitch_creator(self, raw_data: list[dict]) -> ParseOutcome:
        """April is entirely v2, which has no per-deliverable cost split -- only
        `Cost with Deliverables` and `+ Usage`, collapsed here into package_cost
        and rights_cost.

        v3/v3.5 DO split them (Cost of Reel(s), Cost of Video Story, YT Shorts
        Cost, Package Cost...) and v3.5 adds rights/boosting to YouTube. Those
        columns reach the JSON but are read nowhere below, so a v3 sheet would
        ingest with every per-deliverable cost silently 0. Handle before the
        first v3 month.
        """

        rows, errors = [], []
        best: dict[tuple, CreatorLinkRecord] = {}

        for i, raw in enumerate(raw_data):
            try:
                r = PitchCreatorRow.model_validate(raw)

                platform = _platform_of(r.profile_link, r.sheet)
                handle = _handle_of(r.profile_link)
                if not platform or not handle:
                    errors.append(IngestRowError(
                        row=i, field="profile_link",
                        message=f"no usable profile link: {_clean(r.profile_link)!r}"
                    ))
                    continue
                tier_key = _key(r.tier)
                tier = _TIER.get(tier_key, TierChoices.NA)

                followers, w1 = _num(r.followers)
                avg_views, w2= _num(r.avg_views)
                with_deliv, w3 = _num(r.cost_with_deliverables)
                usage, w4 = _num(r.cost_with_deliverables_usage)
                final_cost, w5 = _num(r.final_cost)
                brand_cost, w6 = _num(r.brand_cost)

                for w in (w1, w2, w3, w4, w5, w6):
                    if w:
                        errors.append(IngestRowError(row=i, message=w, severity="warning"))

                package_cost = max(with_deliv, usage)
                rights_cost = max(0, usage - with_deliv)

                rec = CreatorLinkRecord(
                    source_file_id=r.source_file_id,
                    sheet_row=r.sheet_row,
                    platform=platform,
                    username=handle,
                    name=_clean(r.name),
                    followers=followers or None,
                    avg_views=avg_views or None,
                    tier=tier,
                    gender=_GENDER.get(_key(r.gender), ""),
                    city=_clean(r.city),
                    categories_raw=_clean(r.category),
                    languages_raw=_clean(r.language),
                    email=_clean(r.email),
                    phone=_clean(r.phone),
                    reel_count=_num(r.reel_count)[0],
                    reel_story_count=_num(r.reel_story_count)[0],
                    video_story_count=_num(r.video_story_count)[0],
                    static_carousel_count=_num(r.static_carousel_count)[0],
                    event_store_visit=_bool_cell(r.event_store_visit),
                    short_form_videos_count=_num(r.short_form_videos_count)[0],
                    reshare_short_form_videos_count=_num(r.reshare_short_form_videos_count)[0],
                    dedicated_video_count=_num(r.dedicated_video_count)[0],
                    integrated_video_count=_num(r.integrated_video_count)[0],
                    usage_rights=_clean(r.usage_rights),
                    ad_promo_rights=_clean(r.ad_promo_rights),
                    boosting=_clean(r.boosting),
                    payment_terms=_clean(r.payment_terms),
                    package_cost=package_cost,
                    rights_cost=rights_cost,
                    final_cost=final_cost,
                    brand_cost=brand_cost,
                )

                dedupe_key = (r.source_file_id, platform, handle)
                prior = best.get(dedupe_key)
                if prior is None:
                    best[dedupe_key] = rec
                elif rec.final_cost > prior.final_cost:
                    best[dedupe_key] = rec
                    errors.append(
                        IngestRowError(
                            row=i,
                            field="profile_link",
                            severity="warning",
                            message=f"duplicate {handle!r} in this pitch; kept "
                            f"{rec.final_cost} over {prior.final_cost}",
                        )
                    )
                else:
                    errors.append(
                        IngestRowError(
                            row=i,
                            field="profile_link",
                            severity="warning",
                            message=f"duplicate {handle!r} in this pitch; discarded "
                            f"{rec.final_cost}, kept {prior.final_cost}",
                        )
                    )

            except Exception as e:
                errors.append(IngestRowError(row=i, message=str(e)))

        rows = list(best.values())
        return ParseOutcome(rows, errors)

    async def parse_campaign_creator(self, raw_data: list[dict]) -> ParseOutcome:
        pass