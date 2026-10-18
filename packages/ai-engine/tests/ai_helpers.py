"""Shared test helpers (named uniquely: the monorepo has several conftest/helpers modules)."""

from __future__ import annotations

from ritme_contracts import (
    Certainty,
    Citation,
    ClarificationQuestion,
    EvidenceRef,
    ExtractInput,
    Importance,
    PlanTaskDraft,
    Preferences,
    RequirementItem,
    RequirementKind,
    StepContext,
    WorkflowExtraction,
)

MANAGER_MESSAGE = (
    "Can you get the proposal over the line by Friday? "
    "Let's make sure everyone is aligned before we send it."
)
ONBOARDING_RULE = "All client decks need a 48-hour peer review before they are sent."
CTX = StepContext(today="2026-10-19", timezone="Asia/Jakarta")


def prefs(**kw: str) -> Preferences:
    return Preferences(**kw)


def knowledge_chunk() -> Citation:
    return Citation(
        source_id="doc-onboarding",
        source_kind="knowledge",
        title="Intern Onboarding Doc",
        chunk_id="chunk-1",
        excerpt=ONBOARDING_RULE,
    )


def demo_input(**kw: object) -> ExtractInput:
    base: dict[str, object] = {
        "capture_id": "cap-1",
        "content_text": MANAGER_MESSAGE,
        "preferences": Preferences(),
        "context": CTX,
        "knowledge": [knowledge_chunk()],
    }
    base.update(kw)
    return ExtractInput(**base)  # type: ignore[arg-type]


def req(
    rid: str,
    kind: RequirementKind = RequirementKind.FACT,
    text: str = "x",
    certainty: Certainty = Certainty.EXPLICIT,
    importance: Importance = Importance.USEFUL,
    evidence: str | None = None,
    source_id: str = "cap-1",
    confirmed: str | None = None,
) -> RequirementItem:
    ev = [EvidenceRef(source_id=source_id, excerpt=evidence)] if evidence else []
    return RequirementItem(
        id=rid,
        kind=kind,
        text=text,
        certainty=certainty,
        importance=importance,
        evidence=ev,
        user_confirmed_at=confirmed,
    )


def extraction(reqs: list[RequirementItem], qs: list[ClarificationQuestion] | None = None):
    return WorkflowExtraction(
        suggested_title="Title",
        objective="Do the thing.",
        requirements=reqs,
        questions=qs or [],
        summary="Summary.",
    )


def task(draft_id: str, deps: list[str] | None = None, **kw: object) -> PlanTaskDraft:
    base: dict[str, object] = {
        "draft_id": draft_id,
        "title": f"Write part {draft_id}",
        "description": "Short description.",
        "definition_of_done": "Part is written.",
        "depends_on_draft_ids": deps or [],
    }
    base.update(kw)
    return PlanTaskDraft(**base)  # type: ignore[arg-type]
