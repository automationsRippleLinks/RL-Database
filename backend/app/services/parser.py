"""Raw ingest rows -> validated intermediate models.

Every row is parsed independently: a bad row yiels an IngestRowError and
is skipped rather than aborting the batch. Enum coercion is total -- an unknown
value maps to the NA member instead of raising.
"""

from typing import NamedTuple, Any, Optional
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re
import unicodedata

from pydantic import ValidationError

from app.schemas.apps_script_response import (
    PitchMasterRow,
    CampaignMasterRow,
    PitchCreatorRow,
    CampaignCreatorRow,
)
from app.schemas.ingest import (
    Pitch,
    Campaign,
    IngestRowError,
    CreatorLinkRecord,
    CampaignCreatorLinkRecord,
)
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
    ("fb.com", PlatformChoices.FACEBOOK),
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
    rows: (
        list[Pitch]
        | list[Campaign]
        | list[CreatorLinkRecord]
        | list[CampaignCreatorLinkRecord]
    )
    errors: list[IngestRowError]


#: Values that mean "the user typed a placeholder", not real data.
_NULLISH = {"na", "n/a", "n.a.", "none", "nil", "-", "--", "null", "tbd"}

#: Anything that splits a multi-value cell: "Hindi & English", "Cricket, Auto".
#: Deliberately NOT the word "and" -- "Food and Beverage" is one category, and
#: not "-" -- "Cricket Fan- Mumbai Indians" is one category too.
_SPLIT_RE = re.compile(r"\s*(?:\+|,|/|&|\||;)\s*")

_TRAILING_DOT_ZERO = re.compile(r"^(\d+)\.0+$")
_NON_PHONE = re.compile(r"[^\d+]")
_HMS_RE = re.compile(r"^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$")

_TWO_DP = Decimal("0.01")


def _strip_cf(text: str) -> str:
    """Drop Unicode format characters (category Cf).

    Sheets cells pasted from WhatsApp or a browser carry invisible bidi marks
    (U+200E/200F), zero-width joiners and soft hyphens. They survive .split(),
    so "\u200e9876543210" is not equal to "9876543210" and the same creator
    lands twice.
    """
    return "".join(ch for ch in text if unicodedata.category(ch) != "Cf")


def _clean(value: Any) -> str:
    return " ".join(_strip_cf(str(value or "")).split())


def _is_nullish(value: Any) -> bool:
    return _key(value) in _NULLISH


def _split_multi(value: Any) -> list[str]:
    """ "Hindi, English" -> ["Hindi", "English"]; "NA" -> []."""
    text = _clean(value)
    if not text or _is_nullish(text):
        return []
    seen, out = set(), []
    for part in _SPLIT_RE.split(text):
        part = _clean(part)
        if not part or _is_nullish(part):
            continue
        if part.lower() in seen:
            continue
        seen.add(part.lower())
        out.append(part)
    return out


def _joined_links(value: Any) -> Optional[str]:
    """Keep a multi-link cell verbatim, but collapse "Na + Na + Na" to None."""
    text = _clean(value)
    if not text or _is_nullish(text):
        return None
    parts = [
        p for p in (_clean(p) for p in text.split("+")) if p and not _is_nullish(p)
    ]
    return " + ".join(parts) if parts else None


def _phone(value: Any) -> tuple[str, Optional[str]]:
    """Sheets hands phones back as ints, floats or spaced strings."""
    text = _clean(value)
    if not text or _is_nullish(text):
        return "", None
    m = _TRAILING_DOT_ZERO.match(text)  # 7004519877.0 -> 7004519877
    if m:
        text = m.group(1)
    digits = _NON_PHONE.sub("", text)
    if not digits:
        return "", f"phone: {text!r} has no digits -> dropped"
    return digits, None


def _dec(
    value: Any, field: str, sane_max: Optional[int] = None
) -> tuple[Decimal, Optional[str]]:
    """Total Decimal coercion, quantized to 2dp.

    Floats go through str() first: Decimal(0.2) is 0.2000000000000000111,
    Decimal("0.2") is 0.2.
    """
    if value is None or isinstance(value, bool):
        return Decimal("0.00"), None
    if isinstance(value, Decimal):
        d = value
    elif isinstance(value, (int, float)):
        d = Decimal(str(value))
    else:
        text = _clean(value).replace(",", "").replace("%", "").replace("\u20b9", "")
        if not text or _is_nullish(text):
            return Decimal("0.00"), None
        try:
            d = Decimal(text)
        except InvalidOperation:
            return (
                Decimal("0.00"),
                f"{field}: unparseable number {_clean(value)!r} -> 0.00",
            )
    if not d.is_finite():
        return Decimal("0.00"), f"{field}: non-finite {value!r} -> 0.00"
    q = d.quantize(_TWO_DP, rounding=ROUND_HALF_UP)
    if sane_max is not None and q > sane_max:
        return q, (
            f"{field}: {q} is above {sane_max}; stored as-is, but the sheet "
            f"formula is probably wrong"
        )
    return q, None


def _duration(value: Any, field: str) -> tuple[timedelta, Optional[str]]:
    """Accepts "1:23:45", "2:30", a bare number of SECONDS, "" or "00"."""
    if value is None or isinstance(value, bool):
        return timedelta(), None
    if isinstance(value, timedelta):
        return value, None
    if isinstance(value, (int, float)):
        return timedelta(seconds=float(value)), None
    text = _clean(value)
    if not text or _is_nullish(text):
        return timedelta(), None
    m = _HMS_RE.match(text)
    if m:
        return (
            timedelta(
                hours=int(m.group(1) or 0),
                minutes=int(m.group(2)),
                seconds=float(m.group(3)),
            ),
            None,
        )
    try:
        return timedelta(seconds=float(text.replace(",", ""))), None
    except ValueError:
        return timedelta(), f"{field}: unrecognized duration {text!r} -> 0"


def _key(value: Any) -> str:
    return _clean(value).lower()


def normalize_brand_name(raw: Any) -> str:
    return _key(raw)


def _pitch_code(raw: Any, year: Optional[int]) -> str:
    code = _clean(raw).upper()
    if not code:
        raise ValueError("pitch_code: missing")
    if _YEAR_SUFFIX.search(code):  # if not _YEAR_SUFFIX.search(code) # strict mode
        # raise ValueError(f"pitch_code: expected a -YYYY suffix, got {code!r}")  # strict mode, TODO: enable this after sheet migration
        return code
    return f"{code}-{year or date.today().year}"  # return code, strict mode


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
        "youtube": PlatformChoices.YOUTUBE,
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
    stripped = text.replace(",", "").replace("₹", "").strip()
    if re.fullmatch(r"\d+(\.\d+)?", stripped):
        return int(float(stripped)), None
    return 0, f"unparseable number {text!r} -> 0"


def _bool_cell(value: Any) -> bool:
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
                    errors.append(
                        IngestRowError(
                            row=i,
                            field="profile_link",
                            message=f"no usable profile link: {_clean(r.profile_link)!r}",
                        )
                    )
                    continue
                tier_key = _key(r.tier)
                tier = _TIER.get(tier_key, TierChoices.NA)

                followers, w1 = _num(r.followers)
                avg_views, w2 = _num(r.avg_views)
                with_deliv, w3 = _num(r.cost_with_deliverables)
                usage, w4 = _num(r.cost_with_deliverables_usage)
                final_cost, w5 = _num(r.final_cost)
                brand_cost, w6 = _num(r.brand_cost)

                for w in (w1, w2, w3, w4, w5, w6):
                    if w:
                        errors.append(
                            IngestRowError(row=i, message=w, severity="warning")
                        )

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
                    reshare_short_form_videos_count=_num(
                        r.reshare_short_form_videos_count
                    )[0],
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
        """Campaign Status + Tracker rows -> CampaignCreatorLinkRecord.

        Rows are keyed to their campaign by `campaign_code`, uppercased to match
        what parse_campaign_master wrote, NOT by spreadsheet file id: the
        campaign-creator export carries the code on every row and a campaign's
        Status tab lives in the same file as its Tracker tab.

        The audience / watch-time columns are optional. When the sheet omits
        them the record keeps its model default (0.00 / zero duration), so a v1
        Tracker ingests cleanly instead of failing every row.
        """
        rows, errors = [], []
        best: dict[tuple, CampaignCreatorLinkRecord] = {}

        for i, raw in enumerate(raw_data):
            try:
                r = CampaignCreatorRow.model_validate(raw)
                sheet_row = _num(r.sheet_row)[0] or (i + 1)

                code = _clean(r.campaign_code).upper()
                if not code:
                    errors.append(
                        IngestRowError(
                            row=sheet_row,
                            field="campaign_code",
                            message="campaign_code: missing",
                        )
                    )
                    continue

                platform = _platform_of(r.profile_link, _clean(r.sheet))
                handle = _handle_of(r.profile_link)
                if not platform or not handle:
                    errors.append(
                        IngestRowError(
                            row=sheet_row,
                            field="profile_link",
                            message=f"no usable profile link: {_clean(r.profile_link)!r}",
                        )
                    )
                    continue

                warnings: list[str] = []

                def num(value: Any, field: str) -> int:
                    n, w = _num(value)
                    if w:
                        warnings.append(f"{field}: {w}")
                    return n

                def dec(
                    value: Any, field: str, sane_max: Optional[int] = None
                ) -> Decimal:
                    d, w = _dec(value, field, sane_max)
                    if w:
                        warnings.append(w)
                    return d

                def dur(value: Any, field: str) -> timedelta:
                    td, w = _duration(value, field)
                    if w:
                        warnings.append(w)
                    return td

                phone, w_phone = _phone(r.phone)
                if w_phone:
                    warnings.append(w_phone)

                shoot_date = _parse_date(r.shoot_date, "shoot_date")
                live_date = _parse_date(r.live_date, "live_date")

                rec = CampaignCreatorLinkRecord(
                    campaign_code=code,
                    sheet_row=sheet_row,
                    # creator
                    platform=platform,
                    username=handle,
                    name=_clean(r.name),
                    followers=num(r.followers, "followers") or None,
                    avg_views=None,  # campaign sheets carry no creator average
                    tier=_TIER.get(_key(r.tier), TierChoices.NA),
                    gender=_GENDER.get(_key(r.gender), ""),
                    city="" if _is_nullish(r.city) else _clean(r.city),
                    categories_raw=", ".join(_split_multi(r.category)),
                    languages_raw=", ".join(_split_multi(r.language)),
                    email="" if _is_nullish(r.email) else _clean(r.email),
                    phone=phone,
                    # link
                    is_dropped=(
                        bool(r.is_dropped)
                        if isinstance(r.is_dropped, bool)
                        else _bool_cell(r.is_dropped) or _key(r.is_dropped) == "dropped"
                    ),
                    expected_views=num(r.expected_views, "expected_views"),
                    poc_name=_split_multi(r.poc_name),
                    deliverables_raw=_clean(r.deliverables_raw),
                    initial_cost=num(r.initial_cost, "initial_cost"),
                    final_cost=num(r.final_cost, "final_cost"),
                    payment_terms=(
                        "" if _is_nullish(r.payment_terms) else _clean(r.payment_terms)
                    ),
                    brand_cost=num(r.brand_cost, "brand_cost"),
                    agency_fee=num(r.agency_fee, "agency_fee"),
                    product_status=(
                        ""
                        if _is_nullish(r.product_status)
                        else _clean(r.product_status)
                    ),
                    product_ordered_by=(
                        ""
                        if _is_nullish(r.product_ordered_by)
                        else _clean(r.product_ordered_by)
                    ),
                    product_cost=num(r.product_cost, "product_cost"),
                    shipping_cost=num(r.shipping_cost, "shipping_cost"),
                    promotion_cost=num(r.promotion_cost, "promotion_cost"),
                    reimbursement_cost=num(r.reimbursement_cost, "reimbursement_cost"),
                    additional_cost=num(r.additional_cost, "additional_cost"),
                    script_links=_joined_links(r.script_links),
                    shoot_date=shoot_date,
                    content_status=(
                        None
                        if _is_nullish(r.content_status)
                        else (_clean(r.content_status) or None)
                    ),
                    live_date=live_date,
                    live_links=_joined_links(r.live_links),
                    # Instagram tracker
                    ig_reel_views=num(r.ig_reel_views, "ig_reel_views"),
                    ig_reel_likes=num(r.ig_reel_likes, "ig_reel_likes"),
                    ig_reel_comments=num(r.ig_reel_comments, "ig_reel_comments"),
                    ig_reel_shares=num(r.ig_reel_shares, "ig_reel_shares"),
                    ig_reel_saves=num(r.ig_reel_saves, "ig_reel_saves"),
                    ig_story_views=num(r.ig_story_views, "ig_story_views"),
                    ig_reel_reach=num(r.ig_reel_reach, "ig_reel_reach"),
                    ig_story_reach=num(r.ig_story_reach, "ig_story_reach"),
                    ig_avg_watch_time=dur(r.ig_avg_watch_time, "ig_avg_watch_time"),
                    ig_total_watch_time=dur(
                        r.ig_total_watch_time, "ig_total_watch_time"
                    ),
                    ig_skip_rate_content=dec(
                        r.ig_skip_rate_content, "ig_skip_rate_content", 100
                    ),
                    ig_followers_view_perc=dec(
                        r.ig_followers_view_perc, "ig_followers_view_perc", 100
                    ),
                    ig_non_followers_view_perc=dec(
                        r.ig_non_followers_view_perc, "ig_non_followers_view_perc", 100
                    ),
                    ig_male_perc=dec(r.ig_male_perc, "ig_male_perc", 100),
                    ig_female_perc=dec(r.ig_female_perc, "ig_female_perc", 100),
                    ig_age_13_17_perc=dec(
                        r.ig_age_13_17_perc, "ig_age_13_17_perc", 100
                    ),
                    ig_age_18_24_perc=dec(
                        r.ig_age_18_24_perc, "ig_age_18_24_perc", 100
                    ),
                    ig_age_25_34_perc=dec(
                        r.ig_age_25_34_perc, "ig_age_25_34_perc", 100
                    ),
                    ig_age_35_44_perc=dec(
                        r.ig_age_35_44_perc, "ig_age_35_44_perc", 100
                    ),
                    ig_age_45_54_perc=dec(
                        r.ig_age_45_54_perc, "ig_age_45_54_perc", 100
                    ),
                    ig_age_55_64_perc=dec(
                        r.ig_age_55_64_perc, "ig_age_55_64_perc", 100
                    ),
                    ig_age_over_65_perc=dec(
                        r.ig_age_over_65_perc, "ig_age_over_65_perc", 100
                    ),
                    ig_reels_ir_perc=dec(r.ig_reels_ir_perc, "ig_reels_ir_perc", 100),
                    ig_reels_er_perc=dec(r.ig_reels_er_perc, "ig_reels_er_perc", 100),
                    cpv=dec(r.cpv, "cpv"),
                    # YouTube tracker
                    yt_views=num(r.yt_views, "yt_views"),
                    yt_likes=num(r.yt_likes, "yt_likes"),
                    yt_comments=num(r.yt_comments, "yt_comments"),
                    yt_er_perc=dec(r.yt_er_perc, "yt_er_perc", 100),
                    yt_total_impressions=num(
                        r.yt_total_impressions, "yt_total_impressions"
                    ),
                    yt_total_watch_time=dur(
                        r.yt_total_watch_time, "yt_total_watch_time"
                    ),
                )

                if not rec.is_dropped and rec.live_date is None:
                    warnings.append("live_date: empty on a non-dropped row")

                for w in warnings:
                    errors.append(
                        IngestRowError(row=sheet_row, message=w, severity="warning")
                    )

                dedupe_key = (code, platform, handle)
                prior = best.get(dedupe_key)
                if prior is None:
                    best[dedupe_key] = rec
                    continue

                # A creator listed twice in one campaign: keep the costlier row,
                # which is the one Accounts paid against.
                keep, drop = (
                    (rec, prior) if rec.final_cost > prior.final_cost else (prior, rec)
                )
                best[dedupe_key] = keep
                errors.append(
                    IngestRowError(
                        row=sheet_row,
                        field="profile_link",
                        severity="warning",
                        message=(
                            f"duplicate {handle!r} in {code}; kept "
                            f"{keep.final_cost}, discarded {drop.final_cost}"
                        ),
                    )
                )

            except (ValidationError, ValueError) as e:
                errors.append(IngestRowError(row=i, message=str(e)))

        return ParseOutcome(list(best.values()), errors)
