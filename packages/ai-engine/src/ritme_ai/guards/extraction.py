"""Deterministic post-processing of the model's extraction (spec §8.3, §11).

Whatever the model returns, these invariants hold afterwards:

* `explicit` requirements carry evidence that really occurs in the provided sources;
* vague dates ("Friday", "soon") never become exact dates; an unresolved deadline is a blocker
  with a blocking question;
* no owners from tone, no emotion/intent stated as fact;
* instruction-like text inside the capture is never promoted to a requirement;
* the user's confirmed edits and answers from a prior run win.
"""

from __future__ import annotations

import re
from datetime import date

from ritme_contracts import (
    EXTRACTION_SCHEMA_VERSION,
    Certainty,
    ClarificationQuestion,
    ExtractInput,
    Importance,
    QuestionStatus,
    RequirementItem,
    RequirementKind,
    WorkflowExtraction,
)

from . import attribution, dates, injection
from .evidence import SourceSet, verify_requirement_evidence
from .preferences import summary_limit
from .text import limit_text, norm


def build_sources(inp: ExtractInput) -> SourceSet:
    sources = SourceSet()
    sources.add(inp.capture_id, inp.content_text, offsets_valid=True)
    if inp.user_note:
        sources.add(inp.capture_id, inp.user_note)
    for c in inp.knowledge:
        sources.add(c.source_id, c.excerpt)
    return sources


def check_extraction(out: WorkflowExtraction) -> None:
    """`validate` hook: structural problems the schema cannot express (triggers one repair)."""
    ids = [q.id for q in out.questions]
    if len(set(ids)) != len(ids):
        raise ValueError("question ids must be unique")


def _today(inp: ExtractInput) -> date | None:
    try:
        return date.fromisoformat(inp.context.today)
    except ValueError:
        return None


def _confirmed_dates(inp: ExtractInput) -> set[date]:
    """Dates the user themself confirmed in an earlier run (they may legitimately recur)."""
    out: set[date] = set()
    today = _today(inp)
    if inp.prior:
        for r in inp.prior.requirements:
            if r.user_confirmed_at:
                out.update(e.value for e in dates.find_exact_dates(r.text, today))
        for q in inp.prior.questions:
            if q.answer:
                out.update(e.value for e in dates.find_exact_dates(q.answer, today))
    return out


def _unresolved_deadline(req: RequirementItem) -> str | None:
    """Return the vague phrase if this deadline names no calendar date, else None."""
    evidence_text = " ".join(e.excerpt for e in req.evidence)
    basis = evidence_text or req.text
    if dates.has_exact_date(basis):
        return None
    vague = dates.find_vague_dates(basis) or dates.find_vague_dates(req.text)
    return (
        re.sub(r"^(?:by|on|before|until)\s+", "", vague[0], flags=re.IGNORECASE) if vague else None
    )


def apply_extraction_guards(
    out: WorkflowExtraction, inp: ExtractInput
) -> tuple[WorkflowExtraction, list[str]]:
    notes: list[str] = list(out.confidence_notes)
    sources = build_sources(inp)
    source_text = sources.all_text()
    hits = injection.scan(source_text)
    if hits and injection.INJECTION_NOTE not in notes:
        notes.append(injection.INJECTION_NOTE)

    today = _today(inp)
    allowed_dates = {
        e.value for e in dates.find_exact_dates(source_text, today)
    } | _confirmed_dates(inp)

    kept: list[RequirementItem] = []
    dropped: set[str] = set()
    for raw in out.requirements:
        req = raw.model_copy(update={"user_confirmed_at": None})
        req, note = verify_requirement_evidence(req, sources)
        if note:
            notes.append(note)

        if injection.has_injection(req.text) or any(
            injection.overlaps_injection(e.excerpt, hits) for e in req.evidence
        ):
            dropped.add(req.id)
            continue
        if attribution.unsupported_attributions(req.text, source_text):
            dropped.add(req.id)
            notes.append(f"Left out {req.id}: it stated a feeling or intention as fact.")
            continue

        update: dict[str, object] = {}
        if req.kind is RequirementKind.OWNER and req.certainty is not Certainty.EXPLICIT:
            update["kind"] = RequirementKind.ASSUMPTION  # never an inferred owner
            notes.append(f"{req.id} named an owner without evidence; shown as an assumption.")

        text, stripped = dates.strip_invented_dates(req.text, allowed_dates, today)
        if stripped:
            update["text"] = text
            notes.append(f"Removed a date from {req.id} that the source does not state.")
        req = req.model_copy(update=update)

        if req.kind is RequirementKind.DEADLINE:
            vague = _unresolved_deadline(req)
            if vague is not None:
                req = req.model_copy(
                    update={
                        "certainty": Certainty.UNKNOWN,
                        "importance": Importance.BLOCKING,
                        "text": f'The deadline is only given as "{vague}"; no exact date or time '
                        "is stated.",
                    }
                )
        kept.append(req)

    kept_ids = {r.id for r in kept}
    questions: list[ClarificationQuestion] = []
    for q in out.questions:
        if attribution.unsupported_attributions(q.question, source_text) or injection.has_injection(
            q.question
        ):
            continue
        why, _ = attribution.remove_attributing_sentences(q.why_it_matters, source_text)
        questions.append(
            q.model_copy(
                update={
                    "why_it_matters": why or "The plan depends on this and the source is unclear.",
                    "related_requirement_ids": [
                        i for i in q.related_requirement_ids if i in kept_ids
                    ],
                    "answer": None,
                    "status": QuestionStatus.OPEN,
                }
            )
        )

    questions = _ensure_blocking_questions(kept, questions)

    summary, summary_cut = attribution.remove_attributing_sentences(out.summary, source_text)
    summary, _ = dates.strip_invented_dates(summary, allowed_dates, today)
    objective, _ = attribution.remove_attributing_sentences(out.objective, source_text)
    objective, _ = dates.strip_invented_dates(objective, allowed_dates, today)
    if summary_cut:
        notes.append("Removed a sentence that stated a feeling or intention as fact.")

    result = _merge_prior(
        WorkflowExtraction(
            suggested_title=out.suggested_title,
            objective=objective.strip(),
            requirements=kept,
            questions=questions,
            summary=limit_text(summary, summary_limit(inp.preferences)),
            confidence_notes=list(dict.fromkeys(notes)),
            schema_version=EXTRACTION_SCHEMA_VERSION,
        ),
        inp.prior,
    )
    return result, result.confidence_notes


def _ensure_blocking_questions(
    reqs: list[RequirementItem], questions: list[ClarificationQuestion]
) -> list[ClarificationQuestion]:
    """Every unresolved blocking requirement is covered by a blocking question."""
    out = list(questions)
    used = {q.id for q in out}
    for req in reqs:
        if req.importance is not Importance.BLOCKING or req.certainty not in (
            Certainty.UNKNOWN,
            Certainty.CONFLICTING,
        ):
            continue
        covering = [i for i, q in enumerate(out) if req.id in q.related_requirement_ids]
        if covering:
            for i in covering:
                if not out[i].blocking:
                    out[i] = out[i].model_copy(update={"blocking": True})
            continue
        qid = f"q_{req.id}"
        while qid in used:
            qid += "_"
        used.add(qid)
        if req.kind is RequirementKind.DEADLINE:
            vague = _unresolved_deadline(req)
            question = (
                f'Which exact date and time do you mean by "{vague}", and in which timezone?'
                if vague
                else "Which exact date and time is the deadline, and in which timezone?"
            )
            why = "Tasks can only get a due date once it is confirmed."
        else:
            question = f"Can you clarify this point: {req.text}"
            why = "The plan depends on this and the source does not settle it."
        out.append(
            ClarificationQuestion(
                id=qid,
                question=question,
                why_it_matters=why,
                blocking=True,
                related_requirement_ids=[req.id],
            )
        )
    return out


def _merge_prior(new: WorkflowExtraction, prior: WorkflowExtraction | None) -> WorkflowExtraction:
    """User edits win: confirmed requirements and answered/deferred questions are kept verbatim."""
    if prior is None:
        return new
    reqs = {r.id: r for r in new.requirements}
    prior_reqs = {r.id: r for r in prior.requirements}
    for r in prior.requirements:
        if r.user_confirmed_at:
            reqs[r.id] = r  # replaces the model's version or re-adds a dropped one

    decided = {q.id: q for q in prior.questions if q.status is not QuestionStatus.OPEN}
    decided_texts = {norm(q.question) for q in decided.values()}
    questions: list[ClarificationQuestion] = []
    for q in new.questions:
        if q.id in decided:
            continue
        if norm(q.question) in decided_texts:
            continue
        questions.append(q)
    for q in decided.values():
        for rid in q.related_requirement_ids:
            if rid not in reqs and rid in prior_reqs:
                reqs[rid] = prior_reqs[rid]
        questions.append(
            q.model_copy(
                update={
                    "related_requirement_ids": [i for i in q.related_requirement_ids if i in reqs]
                }
            )
        )
    return new.model_copy(update={"requirements": list(reqs.values()), "questions": questions})
