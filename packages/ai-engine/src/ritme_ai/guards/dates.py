"""Vague-vs-exact date rules (spec §8.3).

"Friday", "soon", "when you can" never become exact timestamps. A date counts as exact only when
the text itself states a calendar date. The engine never resolves a relative expression.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

_WEEKDAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday"
_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4,
    "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9,
    "sept": 9, "september": 9, "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12,
    "december": 12,
}  # fmt: skip
_MONTH_RE = "|".join(sorted(_MONTHS, key=len, reverse=True))

_VAGUE = re.compile(
    rf"""\b(
        (?:(?:on|by|before|until|this|next|coming|end\s+of(?:\s+the)?)\s+)?(?:{_WEEKDAYS})s?
      | soon | asap | shortly | tomorrow | tonight | today | later(?:\s+(?:today|this\s+week))?
      | as\s+soon\s+as\s+(?:possible|you\s+can)
      | when(?:ever)?\s+you\s+(?:can|get\s+a\s+chance|have\s+(?:time|a\s+moment)|are\s+free)
      | at\s+some\s+point | (?:eod|cob|eow)
      | end\s+of(?:\s+the)?\s+(?:day|week|month|quarter|year)
      | (?:this|next)\s+(?:week|month|quarter|weekend)
      | in\s+a\s+(?:few|couple(?:\s+of)?)\s+(?:hours|days|weeks)
      | by\s+the\s+(?:end|close)\s+of\s+\w+
    )\b""",
    re.IGNORECASE | re.VERBOSE,
)
_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?")
_MD = re.compile(
    rf"\b(?P<mon>{_MONTH_RE})\.?\s+(?P<day>\d{{1,2}})(?:st|nd|rd|th)?(?:,?\s+(?P<year>\d{{4}}))?\b",
    re.IGNORECASE,
)
_DM = re.compile(
    rf"\b(?P<day>\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?(?P<mon>{_MONTH_RE})\b\.?"
    rf"(?:,?\s+(?P<year>\d{{4}}))?",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class ExactDate:
    text: str
    value: date
    span: tuple[int, int]


def find_vague_dates(text: str) -> list[str]:
    return [m.group(0).strip() for m in _VAGUE.finditer(text)]


def _build(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def find_exact_dates(text: str, today: date | None = None) -> list[ExactDate]:
    """Calendar dates the text states.

    Month-day without a year resolves to the next occurrence on/after `today`; callers only pass
    `today` for text the USER confirmed, never when interpreting sources.
    """
    found: list[ExactDate] = []
    for m in _ISO.finditer(text):
        d = _build(int(m[1]), int(m[2]), int(m[3]))
        if d:
            found.append(ExactDate(m.group(0), d, m.span()))
    for rx in (_MD, _DM):
        for m in rx.finditer(text):
            month, day = _MONTHS[m["mon"].lower()], int(m["day"])
            if m["year"]:
                d = _build(int(m["year"]), month, day)
            elif today is not None:
                d = _build(today.year, month, day)
                if d and d < today:
                    d = _build(today.year + 1, month, day)
            else:
                d = None
            if d:
                found.append(ExactDate(m.group(0), d, m.span()))
    return found


def has_exact_date(text: str) -> bool:
    """True if the text states a date by itself (ISO or with a year)."""
    return bool(find_exact_dates(text))


def strip_invented_dates(
    text: str, allowed: set[date], today: date | None = None
) -> tuple[str, bool]:
    """Replace stated calendar dates that are not in `allowed`."""
    changed = False
    for ex in sorted(find_exact_dates(text, today), key=lambda e: e.span[0], reverse=True):
        if ex.value not in allowed:
            text = text[: ex.span[0]] + "(exact date not stated)" + text[ex.span[1] :]
            changed = True
    return text, changed


def iso_date_part(value: str) -> date | None:
    m = _ISO.match(value.strip())
    return _build(int(m[1]), int(m[2]), int(m[3])) if m else None


def has_utc_offset(value: str) -> bool:
    return bool(re.search(r"(?:Z|[+-]\d{2}:?\d{2})$", value.strip()))
