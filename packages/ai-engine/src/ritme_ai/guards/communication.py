"""Communication guardrails (spec §11).

Preserve the user's voice, never advise masking or concealment, no diagnosis labels in outputs,
and any reading of a sender's message is a "possible interpretation", never a fact.
"""

from __future__ import annotations

import re

from .attribution import unsupported_attributions

_MASKING = re.compile(
    r"\b(?:mask(?:ing|ed)?\b|camouflag\w+|pass(?:ing)?\s+as\b|"
    r"(?:appear|seem|sound|act|come\s+across)(?:\s+as)?\s+(?:more\s+)?(?:neuro)?(?:typical|normal)|"
    r"neurotypical|"
    r"hide\s+(?:your\s+)?(?:diagnosis|condition|differences?|struggles?|adhd|autism|neurodivergence)|"
    r"conceal\w*|keep\s+(?:it|your\s+diagnosis|your\s+condition)\s+(?:a\s+)?secret)",
    re.IGNORECASE,
)
_DIAGNOSIS = re.compile(
    r"\b(?:adhd|autis\w+|asperger\w*|dyslex\w+|dyspraxi\w+|dyscalcul\w+|neurodivergen\w+|"
    r"neurodivers\w+|diagnos\w+|disorder|syndrome|disabilit\w+)\b",
    re.IGNORECASE,
)
_INTERPRETIVE = re.compile(
    r"\b(?:interpret\w*|reading|read\s+(?:this|it)\s+as|seems?|sounds?|implies|suggests?"
    r"|means?\s+that)\b",
    re.IGNORECASE,
)
POSSIBLE_INTERPRETATION = "Possible interpretation (not a fact about the sender): "


def violations(text: str, source_text: str = "") -> list[str]:
    found: list[str] = []
    if _MASKING.search(text):
        found.append("masking or concealment advice")
    if _DIAGNOSIS.search(text):
        found.append("diagnosis or disability label")
    if unsupported_attributions(text, source_text):
        found.append("emotion or intent stated as fact")
    return found


def check(text: str, source_text: str = "") -> None:
    """Raise ValueError (never echoing the text) when output breaks a communication guardrail."""
    problems = violations(text, source_text)
    if problems:
        raise ValueError("output breaks communication guardrails: " + ", ".join(problems))


def label_interpretation(notes: str | None) -> str | None:
    """Notes that read the sender's message must be framed as one possible interpretation."""
    if not notes:
        return notes
    if "possible interpretation" in notes.lower() or not _INTERPRETIVE.search(notes):
        return notes
    return POSSIBLE_INTERPRETATION + notes
