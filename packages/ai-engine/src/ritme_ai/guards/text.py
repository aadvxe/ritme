"""Small text helpers shared by the guards."""

from __future__ import annotations

import re

_WS = re.compile(r"\s+")
_URL = re.compile(r"https?://[^\s)>\]\"']+", re.IGNORECASE)


def norm(text: str) -> str:
    """Case/whitespace/quote-insensitive form used for containment checks."""
    t = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return _WS.sub(" ", t).strip().casefold()


def contains(haystack: str, needle: str) -> bool:
    return norm(needle) in norm(haystack)


def limit_text(text: str, limit: int) -> str:
    """Trim to `limit` characters at a sentence or word boundary."""
    text = text.strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    sentence_end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    if sentence_end >= limit // 2:
        return cut[: sentence_end + 1]
    word_end = cut.rfind(" ")
    return (cut[:word_end] if word_end > 0 else cut).rstrip(",;: ") + "…"


def strip_unsupported_urls(text: str, allowed_text: str) -> tuple[str, bool]:
    """Remove URLs the model produced that do not occur in the provided sources."""
    allowed = norm(allowed_text)
    changed = False

    def repl(m: re.Match[str]) -> str:
        nonlocal changed
        if norm(m.group(0)) in allowed:
            return m.group(0)
        changed = True
        return "[link removed]"

    return _URL.sub(repl, text), changed


def split_sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]
