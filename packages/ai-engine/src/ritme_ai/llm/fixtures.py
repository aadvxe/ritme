# ruff: noqa: E501
"""Deterministic fixtures for FakeLlm: one fixture function per engine step.

Each fixture plays the role of a (naive) model: it reads only what a real model would see, the
system prompt's `<parameters>` JSON and the delimited data blocks, and returns the step's schema
object. It deliberately does NOT enforce the product's rules (it marks "Friday" as explicit, copies
instruction-like sentences, may print estimates). The guards downstream are what tests exercise.

The seeded demo scenario (spec §16) has a dedicated fixture: the manager message
"Can you get the proposal over the line by Friday? Let's make sure everyone is aligned before we
send it." yields "Friday" and "everyone is aligned" as blocking questions, and an Intern Onboarding
Doc chunk about 48-hour peer review of client decks as a rule.
"""

from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel
from ritme_contracts import (
    Certainty,
    ClarificationQuestion,
    CollabGuideOutput,
    DraftClarification,
    EngineStep,
    EvidenceRef,
    Importance,
    PlanTaskDraft,
    RequirementItem,
    RequirementKind,
    WorkflowExtraction,
)

from ..blocks import DataBlock, parse_blocks, parse_parameters
from ..schemas import ChangeReason, PlanModelOutput, ReplanModelOutput

DEMO_MESSAGE = (
    "Can you get the proposal over the line by Friday? "
    "Let's make sure everyone is aligned before we send it."
)
_SENTENCE = re.compile(r"(?<=[.!?])\s+|\n+")
_DATEY = re.compile(
    r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|soon|asap|"
    r"eod|next week|this week|\d{4}-\d{2}-\d{2})\b",
    re.IGNORECASE,
)
_INSTR = re.compile(
    r"\b(please|must|need to|make sure|should|can you|ignore|create)\b", re.IGNORECASE
)


def _block(blocks: list[DataBlock], name: str) -> DataBlock | None:
    return next((b for b in blocks if b.name == name), None)


def _json_block(blocks: list[DataBlock], name: str) -> Any:
    b = _block(blocks, name)
    return json.loads(b.body) if b else None


def _ev(source_id: str, excerpt: str) -> list[EvidenceRef]:
    return [EvidenceRef(source_id=source_id, excerpt=excerpt[:400])]


def _find(text: str, phrase: str) -> str | None:
    m = re.search(re.escape(phrase), text, re.IGNORECASE)
    return m.group(0) if m else None


# ---------------------------------------------------------------- extract


def extract_fixture(system: str, untrusted: str) -> WorkflowExtraction:
    blocks = parse_blocks(untrusted)
    cap = _block(blocks, "capture")
    if cap is None:
        raise ValueError("fixture needs a capture block")
    sid = cap.attrs.get("source_id", "capture")
    text = cap.body
    knowledge = [b for b in blocks if b.name == "knowledge"]
    if "everyone is aligned" in text.lower() and "proposal" in text.lower():
        return _demo_extraction(sid, text, knowledge)
    return _generic_extraction(sid, text)


def _demo_extraction(sid: str, text: str, knowledge: list[DataBlock]) -> WorkflowExtraction:
    objective = _find(text, "get the proposal over the line") or "get the proposal over the line"
    by_friday = _find(text, "by Friday") or "by Friday"
    aligned = (
        _find(text, "make sure everyone is aligned before we send it") or "everyone is aligned"
    )
    everyone = _find(text, "everyone is aligned") or aligned
    proposal = _find(text, "the proposal") or "the proposal"
    reqs = [
        RequirementItem(
            id="r1",
            kind=RequirementKind.OBJECTIVE,
            certainty=Certainty.EXPLICIT,
            importance=Importance.USEFUL,
            text="Get the proposal over the line and send it.",
            evidence=_ev(sid, objective),
        ),
        RequirementItem(
            id="r2",
            kind=RequirementKind.DELIVERABLE,
            certainty=Certainty.EXPLICIT,
            importance=Importance.USEFUL,
            text="The deliverable is the proposal.",
            evidence=_ev(sid, proposal),
        ),
        # The naive model calls the deadline explicit; the date guard downgrades it.
        RequirementItem(
            id="r3",
            kind=RequirementKind.DEADLINE,
            certainty=Certainty.EXPLICIT,
            importance=Importance.BLOCKING,
            text="Due by Friday.",
            evidence=_ev(sid, by_friday),
        ),
        RequirementItem(
            id="r4",
            kind=RequirementKind.INSTRUCTION,
            certainty=Certainty.EXPLICIT,
            importance=Importance.USEFUL,
            text="Everyone should be aligned before the proposal is sent.",
            evidence=_ev(sid, aligned),
        ),
        RequirementItem(
            id="r5",
            kind=RequirementKind.UNKNOWN,
            certainty=Certainty.UNKNOWN,
            importance=Importance.BLOCKING,
            text="It is not stated who 'everyone' is, who approves, or what counts as aligned.",
            evidence=_ev(sid, everyone),
        ),
    ]
    questions = [
        ClarificationQuestion(
            id="q1",
            blocking=True,
            related_requirement_ids=["r3"],
            question="Which exact date and time is 'Friday', and in which timezone?",
            why_it_matters="Tasks can only get a due date once it is confirmed.",
        ),
        ClarificationQuestion(
            id="q2",
            blocking=True,
            related_requirement_ids=["r4", "r5"],
            question="Who needs to be aligned, and what would count as aligned?",
            why_it_matters="The plan needs to know who approves and when the proposal is ready.",
        ),
    ]
    for b in knowledge:
        rule = next(
            (
                s
                for s in _SENTENCE.split(b.body)
                if re.search(r"48", s) and "peer review" in s.lower()
            ),
            None,
        )
        if rule:
            ksid = b.attrs.get("source_id", "knowledge")
            reqs.append(
                RequirementItem(
                    id="r6",
                    kind=RequirementKind.INSTRUCTION,
                    certainty=Certainty.EXPLICIT,
                    importance=Importance.USEFUL,
                    text="Company guideline: client decks need a 48-hour peer review.",
                    evidence=_ev(ksid, rule.strip()),
                )
            )
            reqs.append(
                RequirementItem(
                    id="r7",
                    kind=RequirementKind.ASSUMPTION,
                    certainty=Certainty.INFERRED,
                    importance=Importance.USEFUL,
                    text="Assumption: this proposal counts as a client deck, so the 48-hour "
                    "peer review applies.",
                )
            )
            questions.append(
                ClarificationQuestion(
                    id="q3",
                    blocking=False,
                    related_requirement_ids=["r6", "r7"],
                    question="Is this proposal a client deck that needs the 48-hour peer review?",
                    why_it_matters="It sets how early the review has to start.",
                )
            )
            break
    return WorkflowExtraction(
        suggested_title="Finish and send the proposal",
        objective="Get the proposal over the line and send it once everyone is aligned.",
        requirements=reqs,
        questions=questions,
        summary="Your manager asked you to get the proposal finished by Friday and to make sure "
        "everyone is aligned before it is sent. The date and who must align are not specified.",
        confidence_notes=[],
    )


def _generic_extraction(sid: str, text: str) -> WorkflowExtraction:
    sentences = [s.strip() for s in _SENTENCE.split(text) if s.strip()][:8] or [text.strip()[:200]]
    reqs: list[RequirementItem] = []
    for i, s in enumerate(sentences, start=1):
        if i == 1:
            kind = RequirementKind.OBJECTIVE
        elif _DATEY.search(s):
            kind = RequirementKind.DEADLINE
        elif _INSTR.search(s):
            kind = RequirementKind.INSTRUCTION
        else:
            kind = RequirementKind.FACT
        reqs.append(
            RequirementItem(
                id=f"r{i}",
                kind=kind,
                certainty=Certainty.EXPLICIT,
                importance=Importance.BLOCKING
                if kind is RequirementKind.DEADLINE
                else Importance.USEFUL,
                text=s[:300],
                evidence=_ev(sid, s),
            )
        )
    title = " ".join(sentences[0].split()[:6]).rstrip(".?!,") or "Captured work"
    return WorkflowExtraction(
        suggested_title=title, objective=sentences[0][:300], requirements=reqs, questions=[],
        summary=" ".join(sentences[:2])[:400], confidence_notes=[],
    )  # fmt: skip


# ---------------------------------------------------------------- plan / replan


def _has_review_rule(reqs: list[dict[str, Any]]) -> bool:
    return any("peer review" in r["text"].lower() for r in reqs)


def plan_fixture(system: str, untrusted: str) -> PlanModelOutput:
    params, state = parse_parameters(system), _json_block(parse_blocks(untrusted), "workflow_state")
    shape = params.get("plan_shape", {})
    show = shape.get("include_time_estimates", True)
    reqs: list[dict[str, Any]] = state["requirements"]
    rid = {r["kind"]: r["id"] for r in reversed(reqs)}
    obj = rid.get("objective")
    review = next((r["id"] for r in reqs if "peer review" in r["text"].lower()), None)

    def est(minutes: int) -> int | None:
        return minutes if show else None

    def task(i: int, title: str, done: str, deps: list[int], minutes: int, rids: list[str | None],
             why: str | None = None) -> PlanTaskDraft:  # fmt: skip
        return PlanTaskDraft(
            draft_id=f"t{i}", title=title, description=f"{title}. Keep it to what the request needs.",
            definition_of_done=done, estimated_minutes=est(minutes),
            depends_on_draft_ids=[f"t{d}" for d in deps],
            requirement_ids=[r for r in rids if r], rationale=why,
        )  # fmt: skip

    unresolved: list[str] = []
    if _has_review_rule(reqs) or "proposal" in state.get("objective", "").lower():
        if shape.get("max_tasks", 8) >= 6:
            tasks = [
                task(1, "Collect the latest proposal draft and the original message", "Both are open in one place", [], 10, [obj]),
                task(2, "List what is still missing from the proposal", "A short list of missing sections exists", [1], 15, [obj]),
                task(3, "Write the missing sections of the proposal", "The proposal has no empty sections", [2], 45, [obj, rid.get("deliverable")]),
                task(4, "Check the proposal against the peer-review rule", "Review start time is decided", [3], 15, [review], "Company guideline requires peer review for client decks."),
                task(5, "Ask the people who need to align to confirm", "Each person has confirmed or replied", [4], 20, [rid.get("instruction")]),
                task(6, "Send the proposal", "The proposal is sent", [5], 5, [obj]),
            ]  # fmt: skip
        else:
            tasks = [
                task(1, "Finish the proposal", "The proposal is complete", [], 60, [obj, rid.get("deliverable")]),
                task(2, "Check it against the peer-review rule", "Review start time is decided", [1], 15, [review]),
                task(3, "Confirm alignment, then send the proposal", "Alignment confirmed and proposal sent", [2], 25, [rid.get("instruction")]),
            ]  # fmt: skip
    else:
        picks = [
            r
            for r in reqs
            if r["kind"] in ("deliverable", "instruction", "acceptance_criterion", "objective")
        ]
        tasks = [
            task(i, f"Complete: {r['text'][:80]}", "The item is done and checked", [i - 1] if i > 1 else [], 20, [r["id"]])
            for i, r in enumerate(picks[: shape.get("max_tasks", 8)] or reqs[:1], start=1)
        ]  # fmt: skip
    return PlanModelOutput(goal=state.get("objective") or "Complete the work", tasks=tasks,
                           unresolved_items=unresolved)  # fmt: skip


def replan_fixture(system: str, untrusted: str) -> ReplanModelOutput:
    params, blocks = parse_parameters(system), parse_blocks(untrusted)
    current = _json_block(blocks, "current_plan")
    state = _json_block(blocks, "workflow_state")
    blast = set(params.get("blast_radius_task_ids", []))
    by_draft = {t["draftId"]: t["id"] for t in state["existing_tasks"] if t.get("draftId")}
    new_due = params.get("new_due_at")
    tasks, changes = [], []
    for t in current["tasks"]:
        affected = by_draft.get(t["draftId"]) in blast
        if affected and params.get("trigger") == "request_changed" and new_due:
            t = {**t, "dueAt": new_due}
            changes.append(ChangeReason(task_ref=t["draftId"], change_type="update",
                                        reason="The deadline moved, so this task's date moved too."))  # fmt: skip
        elif affected and params.get("trigger") == "could_not_work":
            changes.append(ChangeReason(task_ref=t["draftId"], change_type="mark_blocked",
                                        reason="Paused until you are ready to pick it up."))  # fmt: skip
        tasks.append(PlanTaskDraft.model_validate(t))
    return ReplanModelOutput(
        goal=current["goal"], tasks=tasks, unresolved_items=[], changes=changes
    )


# ---------------------------------------------------------------- draft / guide


def draft_fixture(system: str, untrusted: str) -> DraftClarification:
    params, blocks = parse_parameters(system), parse_blocks(untrusted)
    q = _json_block(blocks, "question")
    style = params["preferences"]["communication_style"]
    asked = q["question"]
    if style == "make_expectations_explicit":
        msg = f"Hi, before I start I need one thing clarified: {asked} A short answer is enough, and I will plan around it."
        notes = None
    elif style == "offer_tone_options":
        msg = f"Hi, a quick question before I go ahead: {asked}"
        notes = f"Option A (more direct): {asked}\nOption B (more friendly): Hi! When you have a moment, could you tell me: {asked}"
    else:
        msg = f"Hi, a quick question before I go ahead: {asked}"
        notes = None
    return DraftClarification(question_id=q["id"], message=msg, notes=notes)


def collab_fixture(system: str, untrusted: str) -> CollabGuideOutput:
    p = parse_parameters(system)["preferences"]
    lines = [
        {"small_steps": "I work best with small, single-action steps.",
         "balanced": "Medium-sized tasks work well for me.",
         "larger_blocks": "I prefer larger blocks of work."}[p["task_granularity"]],
        {"concise": "Short, to-the-point messages help me most.",
         "balanced": "A brief message with the key context works well.",
         "detailed": "I like having the full detail up front."}[p["information_density"]],
        "Rough time estimates help me." if p["time_estimates"] == "show" else "I prefer not to work from time estimates.",
    ]  # fmt: skip
    return CollabGuideOutput(text="How I like to work: " + " ".join(lines))


FIXTURES: dict[EngineStep, Any] = {
    EngineStep.EXTRACT: extract_fixture,
    EngineStep.PLAN: plan_fixture,
    EngineStep.REPLAN: replan_fixture,
    EngineStep.DRAFT_CLARIFICATION: draft_fixture,
    EngineStep.COLLAB_GUIDE: collab_fixture,
}


def render(model: BaseModel) -> str:
    return model.model_dump_json(by_alias=True)
