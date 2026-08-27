"""Raw ingest rows -> validated intermediate models.

Every row is parsed independently: a bad row yiels an IngestRowError and
is skipped rather than aborting the batch. Enum coercion is total -- an unknown
value maps to the NA member instead of raising.
"""

from typing import NamedTuple, Any, Optional
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re

from pydantic import ValidationError, TypeAdapter, EmailStr

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
from app.services.profile_link import (
    clean as _clean,
    handle_of as _handle_of,
    platform_of as _platform_of,
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

#: The one thing the sheet's tier cell is still consulted for. "Celebrity" is
#: an editorial call that no follower count encodes; every other band is derived.
_CELEB_RE = re.compile(r"celeb", re.I)

#: (exclusive upper bound, tier) -- the first band the count falls under wins.
#: Bounds are lower-inclusive: 20,000 followers is MICRO, not NANO.
_TIER_BANDS = (
    (20_000, TierChoices.NANO),
    (100_000, TierChoices.MICRO),
    (250_000, TierChoices.MID_TIER),
    (1_000_000, TierChoices.MACRO),
)

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
    #: Rows folded into an earlier row for the same creator. Reported so the
    #: caller's counts add up: without it `received` exceeds inserted + skipped
    #: by an unexplained amount, which reads as rows having gone missing.
    deduped: int = 0


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


#: Validates a single address. Reused per call rather than rebuilt -- pydantic
#: adapters are not free to construct.
_EMAIL_ADAPTER = TypeAdapter(EmailStr)


def _is_email(text: str) -> bool:
    try:
        _EMAIL_ADAPTER.validate_python(text)
    except ValidationError:
        return False
    return True


def _email(value: Any) -> tuple[str, Optional[str], Optional[str]]:
    """Return (email, blocking_error, warning).

    The contract is deliberately binary: a real address, or nothing. A cell that
    is neither yields a blocking error, because a half-typed address in a
    contact database is worse than an empty one -- it looks reachable and isn't.

    Multi-value cells are the one accommodation. Sheets routinely carry
    "a@b.com, c@d.com", and refusing a whole upload over two perfectly good
    addresses would be indefensible, so the first is kept and the rest reported
    as a warning. (Creator.additional_emails exists but no ingest path fills it.)
    """
    text = _clean(value)
    if not text or _is_nullish(text):
        return "", None, None

    parts = [p for p in (_clean(p) for p in _SPLIT_RE.split(text)) if p]
    if not parts:
        return "", None, None

    bad = [p for p in parts if not _is_email(p)]
    if bad:
        return "", f"email: {text!r} is not a valid address", None
    if len(parts) > 1:
        return parts[0], None, (
            f"email: kept {parts[0]!r}, dropped {len(parts) - 1} more from the "
            f"same cell"
        )
    return parts[0], None, None


#: The costs a v3.5 pitch sheet sends, already split. Read straight through --
#: the parser used to derive package_cost and rights_cost from a pair of totals,
#: which is why eight of these columns were empty on every row in the database.
_SPLIT_COST_FIELDS = (
    "reel_cost",
    "reel_story_cost",
    "video_story_cost",
    "static_carousel_cost",
    "short_form_videos_cost",
    "reshare_short_form_videos_cost",
    "dedicated_video_cost",
    "integrated_video_cost",
    "rights_cost",
    "boosting_cost",
    "package_cost",
    "final_cost",
    "brand_cost",
)

#: The two totals a v2 sheet sent instead.
_LEGACY_COST_FIELDS = ("cost_with_deliverables", "cost_with_deliverables_usage")


def _is_blank(value: Any) -> bool:
    """No value at all -- absent, empty, or a placeholder. Zero is a value."""
    text = _clean(value)
    return not text or _is_nullish(text)


def _uses_legacy_costs(row: Any) -> bool:
    """True when the row carries v2 cost totals and none of the v3.5 split costs.

    Presence, never amount: a v3.5 row whose costs are genuinely all zero must
    not be mistaken for an old export. A v2 row with both totals blank is
    indistinguishable from a v3.5 row with nothing filled in, and harmless --
    every cost is zero either way -- so it is left alone.
    """
    has_legacy = any(not _is_blank(getattr(row, f, None)) for f in _LEGACY_COST_FIELDS)
    has_split = any(not _is_blank(getattr(row, f, None)) for f in _SPLIT_COST_FIELDS)
    return has_legacy and not has_split


def tier_for(followers: Optional[int], raw_tier: Any = None) -> TierChoices:
    """Tier follows the follower count, not the sheet.

    The sheet's tier cell is consulted for exactly one thing -- the word
    "celeb" -- because celebrity is an editorial judgement no follower count
    encodes. Everything else was drifting: the same creator could be MICRO on
    one sheet and MID_TIER on another with identical followers.
    """
    if _CELEB_RE.search(_clean(raw_tier)):
        return TierChoices.CELEB
    if not followers:  # missing, or an explicit 0
        return TierChoices.NA
    for ceiling, tier in _TIER_BANDS:
        if followers < ceiling:
            return tier
    return TierChoices.MEGA


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
        errors: list[IngestRowError] = []
        # Deduped as we go: a creator listed twice in one pitch keeps the row
        # with the higher final_cost.
        best: dict[tuple, CreatorLinkRecord] = {}
        deduped = 0
        #: (sheet_row, template_version) for rows still using the v2 cost shape.
        legacy_rows: list[tuple[int, str]] = []

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
                sheet_row = _num(r.sheet_row)[0] or (i + 1)

                if _uses_legacy_costs(r):
                    version = _clean(r.template_version) or "v2"
                    legacy_rows.append((sheet_row, version))

                warnings: list[str] = []

                def num(value: Any, field: str) -> int:
                    """Coerce, and say which column failed.

                    The bare _num warning is just "unparseable number 'Need' ->
                    0" with no field, which is unactionable when a row has
                    thirteen numeric columns.
                    """
                    n, w = _num(value)
                    if w:
                        warnings.append(f"{field}: {w}")
                    return n

                followers = num(r.followers, "followers")
                avg_views = num(r.avg_views, "avg_views")

                # Costs arrive already split, so they are stored exactly as the
                # sheet gives them. Deliberately not cross-checked against each
                # other: package_cost and final_cost are negotiated figures and
                # legitimately differ from the sum of the deliverables.
                costs = {
                    field: num(getattr(r, field), field)
                    for field in _SPLIT_COST_FIELDS
                }

                email, email_error, email_warning = _email(r.email)
                if email_error:
                    errors.append(
                        IngestRowError(
                            row=sheet_row,
                            field="email",
                            code="invalid_email",
                            message=email_error,
                        )
                    )
                if email_warning:
                    errors.append(
                        IngestRowError(
                            row=sheet_row,
                            field="email",
                            severity="warning",
                            message=email_warning,
                        )
                    )

                rec = CreatorLinkRecord(
                    source_file_id=r.source_file_id,
                    sheet_row=r.sheet_row,
                    platform=platform,
                    username=handle,
                    name=_clean(r.name),
                    followers=followers or None,
                    avg_views=avg_views or None,
                    tier=tier_for(followers, r.tier),
                    gender=_GENDER.get(_key(r.gender), ""),
                    city=_clean(r.city),
                    categories_raw=_clean(r.category),
                    languages_raw=_clean(r.language),
                    email=email,
                    phone=_clean(r.phone),
                    reel_count=num(r.reel_count, "reel_count"),
                    reel_story_count=num(r.reel_story_count, "reel_story_count"),
                    video_story_count=num(r.video_story_count, "video_story_count"),
                    static_carousel_count=num(
                        r.static_carousel_count, "static_carousel_count"
                    ),
                    event_store_visit=_bool_cell(r.event_store_visit),
                    short_form_videos_count=num(
                        r.short_form_videos_count, "short_form_videos_count"
                    ),
                    reshare_short_form_videos_count=num(
                        r.reshare_short_form_videos_count,
                        "reshare_short_form_videos_count",
                    ),
                    dedicated_video_count=num(
                        r.dedicated_video_count, "dedicated_video_count"
                    ),
                    integrated_video_count=num(
                        r.integrated_video_count, "integrated_video_count"
                    ),
                    usage_rights=_clean(r.usage_rights),
                    ad_promo_rights=_clean(r.ad_promo_rights),
                    boosting=_clean(r.boosting),
                    payment_terms=_clean(r.payment_terms),
                    **costs,
                )

                # Emitted here rather than where they are collected: the
                # deliverable counts are coerced inside the constructor above.
                for w in warnings:
                    errors.append(
                        IngestRowError(row=sheet_row, message=w, severity="warning")
                    )

                dedupe_key = (r.source_file_id, platform, handle)
                prior = best.get(dedupe_key)
                if prior is None:
                    best[dedupe_key] = rec
                    continue

                deduped += 1
                if rec.final_cost > prior.final_cost:
                    best[dedupe_key] = rec
                    kept, dropped = rec.final_cost, prior.final_cost
                else:
                    kept, dropped = prior.final_cost, rec.final_cost
                errors.append(
                    IngestRowError(
                        row=sheet_row,
                        field="profile_link",
                        severity="warning",
                        message=(
                            f"duplicate {handle!r} in this pitch; kept {kept}, "
                            f"discarded {dropped}"
                        ),
                    )
                )

            except Exception as e:
                errors.append(IngestRowError(row=i, message=str(e)))

        if legacy_rows:
            versions = sorted({v for _, v in legacy_rows})
            errors.append(
                IngestRowError(
                    row=legacy_rows[0][0],
                    field="cost_with_deliverables",
                    code="legacy_v2_format",
                    message=(
                        f"{len(legacy_rows)} row(s) use the old cost format "
                        f"(template_version {', '.join(versions)}). Re-export from "
                        "the current sheet -- cost_with_deliverables and "
                        "cost_with_deliverables_usage are no longer read, so this "
                        "file would store zero for every cost."
                    ),
                )
            )

        return ParseOutcome(list(best.values()), errors, deduped)

    async def parse_campaign_creator(self, raw_data: list[dict]) -> ParseOutcome:
        errors: list[IngestRowError] = []
        best: dict[tuple, CampaignCreatorLinkRecord] = {}
        deduped = 0

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

                followers = num(r.followers, "followers")
                email, email_error, email_warning = _email(r.email)
                if email_warning:
                    warnings.append(email_warning)
                if email_error:
                    errors.append(
                        IngestRowError(
                            row=sheet_row,
                            field="email",
                            code="invalid_email",
                            message=email_error,
                        )
                    )

                shoot_date = _parse_date(r.shoot_date, "shoot_date")
                live_date = _parse_date(r.live_date, "live_date")

                rec = CampaignCreatorLinkRecord(
                    campaign_code=code,
                    sheet_row=sheet_row,
                    # creator
                    platform=platform,
                    username=handle,
                    name=_clean(r.name),
                    followers=followers or None,
                    avg_views=None,  # campaign sheets carry no creator average
                    tier=tier_for(followers, r.tier),
                    gender=_GENDER.get(_key(r.gender), ""),
                    city="" if _is_nullish(r.city) else _clean(r.city),
                    # Verbatim, not pre-split. Splitting here on "&" turned
                    # "Beauty & Makeup" into "Beauty, Makeup" before anything
                    # could recognise it as one real category -- 30 of the
                    # category names and 11 language names contain a delimiter.
                    # The taxonomy-aware resolver in services/ingest.py does the
                    # splitting, against the actual vocabulary.
                    categories_raw=_clean(r.category),
                    languages_raw=_clean(r.language),
                    email=email,
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
                deduped += 1
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

        return ParseOutcome(list(best.values()), errors, deduped)
