"""Parsers for single sheet cells: text, numbers, money, dates, contacts, links.

Each takes a raw cell value from the JSON export (str, number, bool or None) and
returns a clean value, or raises ValueError with a message meant for the user.
Placeholders such as "NA", "-" and "nil" count as blank.
"""

from typing import Any, Optional
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import timedelta, date, datetime, timezone
import re

from pydantic import TypeAdapter, EmailStr, ValidationError
import phonenumbers

from app.services.profile_link import clean

IST = timezone(timedelta(hours=5, minutes=30))

_BLANK = {"", "na", "n/a", "n.a.", "none", "nil", "-", "--", "null"}
# commas, spaces, ₹, a leading Rs/INR and a trailing /- ("Rs. 5,000/-" -> 5000)
_MONEY_JUNK = re.compile(r"[,\s₹]|^rs\.?|^inr|/-$", re.I)
_HMS = re.compile(r"^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$")
# day first, as typed in India: 03-04-2025 is 3 April
_DATE_FORMATS = ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d.%m.%Y")
_EMAIL_IN_TEXT = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_EMAIL = TypeAdapter(EmailStr)
_TWO_DP = Decimal("0.01")
_FILE_ID = re.compile(r"/d/([A-Za-z0-9_-]+)")
_BARE_ID = re.compile(r"^[A-Za-z0-9_-]{20,}$")  # a Drive file id pasted without the URL

def is_blank(value: Any) -> bool:
    """True for an empty cell or a placeholder like "NA", "-" or "nil"."""
    return clean(value).lower() in _BLANK

def text(value: Any) -> str:
    """Cleaned text, or "" for a blank cell."""

    return "" if is_blank(value) else clean(value)

def whole(value: Any) -> int:
    """Non-negative whole number; blank is 0. Money formatting is stripped."""
    # bool is a subclass of int; a stray TRUE must not become 1
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
    """Non-negative amount rounded to 2 places; blank is 0.00.
    
        Money formatting and a "%" sign are stripped. max_value, if given, is an upper
        bound (100 for percentage columns).
    """

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
    """Duration from "h:mm:ss", "mm:ss" or plain seconds; blank is zero."""

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
    """Date from a day-first or ISO cell; None when blank.
    
        A timestamp with a time zone is converted to IST first, so one near midnight
        keeps its Indian date.
    """

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

# "dropped" so an is_dropped cell that says "Dropped" reads as yes
_TRUE = {"yes", "y", "true", "1", "dropped"}
_FALSE = {"no", "n", "false", "0"}

def flag(value: Any) -> bool:
    """Yes/no cell; blank is False and anything unrecognised is an error."""

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
    """Names from a cell split on , & / + ; or |, minus blanks and repeats.
    
        Repeats are compared case-insensitively and the first spelling is kept. A list
        value is cleaned the same way without being split.
    """

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
    """Lower-cased, de-duplicated email addresses found anywhere in the cell.
    
        With strict, a non-blank cell that holds no valid address is an error.
    """

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
    """E.164 numbers found in the cell; numbers without a country code are Indian.

    With strict, a non-blank cell that holds no valid number is an error.
    """
    # a number cell arrives as 9876543210.0; drop the ".0" before matching
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
    """File id from a Sheets/Docs link or a bare id; a blank cell is an error."""

    raw = text(value)
    m = _FILE_ID.search(raw)
    if m:
        return m.group(1)
    if _BARE_ID.match(raw):
        return raw
    raise ValueError(f"{raw!r} is not a Google Sheets/Docs link" if raw else "missing")
