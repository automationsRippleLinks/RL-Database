from typing import Any, Optional
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import timedelta, date, datetime, timezone
import re

from pydantic import TypeAdapter, EmailStr, ValidationError
import phonenumbers

from app.services.profile_link import clean

IST = timezone(timedelta(hours=5, minutes=30))

_BLANK = {"", "na", "n/a", "n.a.", "none", "nil", "-", "--", "null"}
_MONEY_JUNK = re.compile(r"[,\s₹]|^rs\.?|^inr|/-$", re.I)
_HMS = re.compile(r"^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$")
_DATE_FORMATS = ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d.%m.%Y")
_EMAIL_IN_TEXT = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_EMAIL = TypeAdapter(EmailStr)
_TWO_DP = Decimal("0.01")
_FILE_ID = re.compile(r"/d/([A-Za-z0-9_-]+)")
_BARE_ID = re.compile(r"^[A-Za-z0-9_-]{20,}$")

def is_blank(value: Any) -> bool:
    return clean(value).lower() in _BLANK

def text(value: Any) -> str:
    return "" if is_blank(value) else clean(value)

def whole(value: Any) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{value!r} is not a number")
    if is_blank(value):
        return 0
    if isinstance(value, (int, float)):
        number = Decimal(str(value))
    else:
        try:
            number = Decimal(_MONEY_JUNK.sub("", clean(value)))
        except InvalidOperation:
            raise ValueError(f"{clean(value)!r} is not a number") from None
    if not number.is_finite() or number != number.to_integral_value():
        raise ValueError(f"{value!r} is not a whole number")
    if number < 0:
        raise ValueError(f"{value!r} is negative")
    return int(number)

def decimal(value: Any, max_value: Optional[int] = None) -> Decimal:
    if isinstance(value, bool):
        raise ValueError(f"{value!r} is not a number")
    if is_blank(value):
        return Decimal("0.00")
    raw = str(value) if isinstance(value, (int, float)) else clean(value).replace("%", "")
    try:
        number = Decimal(_MONEY_JUNK.sub("", raw))
    except InvalidOperation:
        raise ValueError(f"{clean(value)!r} is not a number") from None
    if not number.is_finite() or number < 0:
        raise ValueError(f"{value!r} is not a valid amount")
    if max_value is not None and number > max_value:
        raise ValueError(f"{value!r} is above {max_value}")
    return number.quantize(_TWO_DP, rounding=ROUND_HALF_UP)

def duration(value: Any) -> timedelta:
    if is_blank(value):
        return timedelta()
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return timedelta(seconds=float(value))
    raw = clean(value)
    m = _HMS.match(raw)
    if m:
        return timedelta(hours=int(m.group(1) or 0), minutes=int(m.group(2)), seconds=float(m.group(3)))
    try:
        return timedelta(seconds=float(raw.replace(",", "")))
    except ValueError:
        raise ValueError(f"{raw!r} is not a duration (use h:mm:ss or seconds)") from None

def day(value: Any) -> Optional[date]:
    if is_blank(value):
        return None
    raw = clean(value)
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            pass

    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(f"{raw!r} is not a date") from None
    return (parsed.astimezone(IST) if parsed.tzinfo else parsed).date()

_TRUE = {"yes", "y", "true", "1", "dropped"}
_FALSE = {"no", "n", "false", "0"}

def flag(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if is_blank(value):
        return False
    key = clean(value).lower()
    if key in _TRUE:
        return True
    if key in _FALSE:
        return False
    raise ValueError(f"{clean(value)!r} is not yes/no")

def names(value: Any) -> list[str]:
    if isinstance(value, list):
        parts = value
    else:
        parts = re.split(r"\s*(?:,|&|/|\+|;|\|)\s*", text(value))
    out: list[str] = []
    for p in parts:
        p = text(p)
        if p and p.lower() not in {o.lower() for o in out}:
            out.append(p)
    return out

def emails(value: Any, strict: bool = True) -> list[str]:
    raw = text(value)
    if not raw:
        return []
    found = []
    for candidate in _EMAIL_IN_TEXT.findall(raw):
        try:
            address = _EMAIL.validate_python(candidate).lower()
        except ValidationError:
            continue
        if address not in found:
            found.append(address)
    if strict and not found:
        raise ValueError(f"{raw!r} has no valid email address")
    return found

def phones(value: Any, strict: bool = True) -> list[str]:
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    raw = text(value)
    if not raw:
        return []
    found = []
    for match in phonenumbers.PhoneNumberMatcher(raw, "IN"):
        number = phonenumbers.format_number(match.number, phonenumbers.PhoneNumberFormat.E164)
        if number not in found:
            found.append(number)
    if strict and not found:
        raise ValueError(f"{raw!r} has no valid phone number")
    return found

def drive_id(value: Any) -> str:
    raw = text(value)
    m = _FILE_ID.search(raw)
    if m:
        return m.group(1)
    if _BARE_ID.match(raw):
        return raw
    raise ValueError(f"{raw!r} is not a google Sheets/Docs link" if raw else "missing")