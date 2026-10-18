"""Prompt-injection handling.

Captured text is DATA. Detection here is a backstop that flags instruction-like text addressed to
an AI so it can never be promoted into requirements; the primary defence is structural (policy-only
system prompt, delimited untrusted blocks, schema-bounded output, no model-callable write tools).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .text import norm, split_sentences

_PATTERNS = [
    r"ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier|preceding|your)\s+"
    r"(?:instructions?|prompts?|rules?|messages?|directions?)",
    r"disregard\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier|your)\s+"
    r"(?:instructions?|rules?|prompts?)",
    r"(?:forget|override|bypass)\s+(?:all\s+|your\s+|the\s+)?(?:previous\s+|prior\s+)?"
    r"(?:instructions?|rules?|guidelines?|polic(?:y|ies)|safety)",
    r"you\s+are\s+now\s+(?:a|an|in|the)\b",
    r"(?:reveal|show|print|repeat|output|leak)\s+(?:me\s+)?(?:your|the)\s+(?:system\s+)?"
    r"(?:prompt|instructions?|secrets?|api\s+keys?|credentials?)",
    r"system\s+prompt",
    r"new\s+instructions?\s*:",
    r"(?:call|invoke|use|execute|run)\s+(?:the\s+)?(?:\w+\s+)?(?:tool|function|command)\b",
    r"^\s*(?:system|assistant|developer)\s*:",
    r"</?\s*(?:system|instructions?|tool_call|function_call)\s*>",
]
_RX = [re.compile(p, re.IGNORECASE | re.MULTILINE) for p in _PATTERNS]


@dataclass(frozen=True, slots=True)
class InjectionHit:
    sentence: str


def scan(text: str) -> list[InjectionHit]:
    hits: list[InjectionHit] = []
    for sentence in split_sentences(text):
        if any(rx.search(sentence) for rx in _RX):
            hits.append(InjectionHit(sentence))
    return hits


def has_injection(text: str) -> bool:
    return bool(scan(text))


def overlaps_injection(excerpt: str, hits: list[InjectionHit]) -> bool:
    e = norm(excerpt)
    if not e:
        return False
    return any(e in norm(h.sentence) or norm(h.sentence) in e for h in hits)


INJECTION_NOTE = (
    "The captured text contains instruction-like wording addressed to an AI assistant. "
    "It was treated as plain content and not followed."
)
