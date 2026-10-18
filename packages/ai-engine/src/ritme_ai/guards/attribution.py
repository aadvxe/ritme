"""No inferred emotion, intent or honesty as fact (spec §8.3, §11)."""

from __future__ import annotations

import re

from .text import contains, split_sentences

_EMO = (
    r"angry|upset|annoyed|irritated|frustrated|disappointed|impatient|mad|furious|unhappy|"
    r"dissatisfied|stressed|anxious|worried|passive[- ]aggressive|condescending|dismissive|rude|"
    r"hostile|sarcastic|insincere|dishonest|lying|resentful|offended"
)
_PATTERNS = [
    r"\b(?:is|are|was|were|seems?|seemed|sounds?|appears?|feels?|looks?)\s+(?:to\s+be\s+|like\s+)?"
    rf"(?:(?:so|very|really|quite|rather|a\s+bit|somewhat|clearly|obviously)\s+)?(?:{_EMO})\b",
    r"\b(?:secretly|really\s+means|hidden\s+(?:agenda|motive)"
    r"|is\s+(?:trying\s+to\s+)?(?:test(?:ing)?|hint(?:ing)?|signal(?:l)?ing)"
    r"|insinuat\w+|doesn'?t\s+trust|distrusts?|blames?\s+you"
    r"|is\s+(?:checking|watching)\s+up\s+on\s+you)\b",
]
_RX = [re.compile(p, re.IGNORECASE) for p in _PATTERNS]


def find_attributions(text: str) -> list[str]:
    return [m.group(0) for rx in _RX for m in rx.finditer(text)]


def unsupported_attributions(text: str, source_text: str) -> list[str]:
    """Attribution snippets in `text` that the source itself does not literally contain."""
    return [a for a in find_attributions(text) if not contains(source_text, a)]


def remove_attributing_sentences(text: str, source_text: str) -> tuple[str, bool]:
    kept: list[str] = []
    removed = False
    for sentence in split_sentences(text):
        if unsupported_attributions(sentence, source_text):
            removed = True
        else:
            kept.append(sentence)
    return " ".join(kept), removed
