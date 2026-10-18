"""Evidence rule: an `explicit` requirement needs a real excerpt from the provided sources.

Excerpts the model returns are re-located in the actual source text. Excerpts that cannot be found
are dropped (no invented citations); the surviving ones are replaced by the exact source slice.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from ritme_contracts import (
    MAX_EXCERPT_CHARS,
    Certainty,
    EvidenceRef,
    RequirementItem,
)


@dataclass(slots=True)
class SourcePart:
    text: str
    offsets_valid: bool = False  # offsets are reported only for the capture body


@dataclass(slots=True)
class SourceSet:
    """source_id -> text parts (capture body, note, knowledge chunk)."""

    parts: dict[str, list[SourcePart]] = field(default_factory=dict)

    def add(self, source_id: str, text: str, *, offsets_valid: bool = False) -> None:
        if text and text.strip():
            self.parts.setdefault(source_id, []).append(SourcePart(text, offsets_valid))

    def all_text(self) -> str:
        return "\n".join(p.text for parts in self.parts.values() for p in parts)

    def locate(self, excerpt: str, preferred_source_id: str | None = None) -> EvidenceRef | None:
        pieces = [p.strip() for p in re.split(r"\.\.\.|…", excerpt) if p.strip()]
        if not pieces:
            return None
        piece = max(pieces, key=len)
        tokens = piece.split()
        if len("".join(tokens)) < 3:
            return None
        rx = re.compile(r"\s+".join(re.escape(t) for t in tokens), re.IGNORECASE)
        order = list(self.parts)
        if preferred_source_id in self.parts:
            order.remove(preferred_source_id)
            order.insert(0, preferred_source_id)
        for source_id in order:
            for part in self.parts[source_id]:
                m = rx.search(part.text)
                if not m:
                    continue
                start, end = m.span()
                end = min(end, start + MAX_EXCERPT_CHARS)
                return EvidenceRef(
                    source_id=source_id,
                    excerpt=part.text[start:end],
                    start_offset=start if part.offsets_valid else None,
                    end_offset=end if part.offsets_valid else None,
                )
        return None


def verify_requirement_evidence(
    req: RequirementItem, sources: SourceSet
) -> tuple[RequirementItem, str | None]:
    """Re-anchor evidence in the sources; downgrade `explicit` when none survives.

    Returns the corrected requirement and a note (or None when nothing changed materially).
    """
    kept: list[EvidenceRef] = []
    for ev in req.evidence:
        located = sources.locate(ev.excerpt, ev.source_id)
        if located and all(located.excerpt != k.excerpt for k in kept):
            kept.append(located)
    note = None
    certainty = req.certainty
    if len(kept) < len(req.evidence):
        note = f"Removed evidence for {req.id} that does not appear in the source."
    if certainty is Certainty.EXPLICIT and not kept:
        certainty = Certainty.INFERRED
        note = f"{req.id} was marked explicit without matching evidence; shown as inferred."
    return req.model_copy(update={"evidence": kept, "certainty": certainty}), note
