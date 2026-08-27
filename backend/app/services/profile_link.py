"""Social profile URL -> (platform, handle).

Lives on its own because two callers depend on it agreeing with itself: ingest
writes `Creator.username` from these functions, and global search reads it back
when someone pastes a profile link. A second regex in the search layer would
drift, and the symptom would be "no results" for a creator that demonstrably
exists.
"""

from typing import Any, NamedTuple, Optional
import re
import unicodedata

from app.models.enums import PlatformChoices

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

#: Enough to say "the user meant a URL, not a search term".
_LINK_HINT_RE = re.compile(r"^(?:https?://|www\.)|\.(?:com|net|org|be|in|co)(?:/|$)", re.I)


def strip_format_chars(text: str) -> str:
    """Drop Unicode format characters (category Cf).

    Cells pasted from WhatsApp or a browser carry invisible bidi marks
    (U+200E/200F), zero-width joiners and soft hyphens. They survive .split(),
    so "\u200e9876543210" is not equal to "9876543210" and the same creator
    lands twice.
    """
    return "".join(ch for ch in text if unicodedata.category(ch) != "Cf")


def clean(value: Any) -> str:
    """Collapse whitespace and drop invisible formatting characters."""
    return " ".join(strip_format_chars(str(value or "")).split())


def platform_of(link: Any, sheet_fallback: str = "") -> Optional[PlatformChoices]:
    low = clean(link).lower()
    for needle, platform in _PLATFORM_DOMAINS:
        if needle in low:
            return platform
    return {
        "instagram": PlatformChoices.INSTAGRAM,
        "youtube": PlatformChoices.YOUTUBE,
    }.get(sheet_fallback.lower())


def handle_of(link: Any) -> Optional[str]:
    m = _HANDLE_RE.search(clean(link))
    return m.group(1).lstrip("@").rstrip("\\").lower() if m else None


class ProfileLink(NamedTuple):
    #: None when the domain isn't one we recognise.
    platform: Optional[PlatformChoices]
    #: None when nothing handle-shaped could be pulled out of the URL.
    username: Optional[str]


def looks_like_link(text: Any) -> bool:
    """Did the user paste a URL rather than type a search term?

    A URL contains no whitespace, so anything that tokenises to more than one
    word is free text no matter what it contains.
    """
    cleaned = clean(text)
    if not cleaned or " " in cleaned:
        return False
    return bool(_LINK_HINT_RE.search(cleaned))


def parse_profile_link(text: Any) -> ProfileLink:
    """Best-effort (platform, handle) for a pasted link.

    Both fields are independently optional: a recognised domain with an
    unreadable path yields a platform and no handle, and the caller decides
    whether that is worth searching for (it isn't).
    """
    return ProfileLink(platform=platform_of(text), username=handle_of(text))
