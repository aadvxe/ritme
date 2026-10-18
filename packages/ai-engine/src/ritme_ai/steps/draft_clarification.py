"""draft_clarification: an editable, voice-preserving message the user may send themselves."""

from __future__ import annotations

from datetime import date

from ritme_contracts import (
    CommunicationStyle,
    DraftClarification,
    DraftClarificationInput,
    EngineStep,
    InformationDensity,
    StepMeta,
)

from ..blocks import render_block, render_json_block
from ..errors import EngineError
from ..guards import communication, dates
from ..guards.text import limit_text, strip_unsupported_urls
from ..llm.base import LlmAdapter
from ..llm.result import GenerationMeta, LlmErrorKind
from .base import base_parameters, call_llm, make_meta

_MESSAGE_CHARS = {
    InformationDensity.CONCISE: 700,
    InformationDensity.BALANCED: 1050,
    InformationDensity.DETAILED: 1550,
}


def _context_text(inp: DraftClarificationInput) -> str:
    parts = [inp.question.question, inp.question.why_it_matters, inp.objective]
    parts += [r.text for r in inp.related]
    if inp.source_excerpt:
        parts.append(inp.source_excerpt)
    return "\n".join(parts)


def build_blocks(inp: DraftClarificationInput) -> list[str]:
    blocks = [
        render_json_block(
            "question",
            {
                "id": inp.question.id,
                "question": inp.question.question,
                "why_it_matters": inp.question.why_it_matters,
                "suggested_answers": inp.question.suggested_answers,
            },
        ),
        render_json_block("objective", {"objective": inp.objective}),
    ]
    if inp.related:
        blocks.append(
            render_json_block(
                "related_requirements",
                [{"id": r.id, "kind": r.kind.value, "text": r.text} for r in inp.related],
            )
        )
    if inp.source_excerpt:
        blocks.append(render_block("source_excerpt", inp.source_excerpt))
    return blocks


def fallback(inp: DraftClarificationInput) -> DraftClarification:
    """Deterministic, safe message used when the model keeps breaking a guardrail."""
    q = inp.question.question.strip()
    style = inp.preferences.communication_style
    if style is CommunicationStyle.MAKE_EXPECTATIONS_EXPLICIT:
        message = (
            f"Hi, before I start I need one thing clarified: {q} "
            "A short answer is enough, and I will plan the work around it."
        )
    else:
        message = f"Hi, a quick question before I go ahead: {q}"
    return DraftClarification(question_id=inp.question.id, message=message)


def finalize(raw: DraftClarification, inp: DraftClarificationInput) -> DraftClarification:
    context = _context_text(inp)
    try:
        today: date | None = date.fromisoformat(inp.context.today)
    except ValueError:
        today = None
    allowed = {e.value for e in dates.find_exact_dates(context, today)}

    def clean(text: str) -> str:
        text, _ = strip_unsupported_urls(text, context)
        text, _ = dates.strip_invented_dates(text, allowed, today)
        return text

    message = limit_text(clean(raw.message), _MESSAGE_CHARS[inp.preferences.information_density])
    notes = communication.label_interpretation(clean(raw.notes) if raw.notes else None)
    return DraftClarification(question_id=inp.question.id, message=message, notes=notes)


async def run(
    llm: LlmAdapter, inp: DraftClarificationInput, timeout_ms: int
) -> tuple[DraftClarification, StepMeta]:
    context = _context_text(inp)

    def validate(out: DraftClarification) -> None:
        communication.check(out.message, context)
        if out.notes:
            communication.check(out.notes, context)

    try:
        value, prompt_version, gen = await call_llm(
            llm,
            step=EngineStep.DRAFT_CLARIFICATION,
            parameters=base_parameters(inp.preferences, inp.context),
            blocks=build_blocks(inp),
            schema=DraftClarification,
            timeout_ms=timeout_ms,
            validate=validate,
        )
    except EngineError as exc:
        if exc.error.kind is not LlmErrorKind.INVALID_OUTPUT:
            raise
        # The model could not produce a compliant message: use the safe template instead.
        meta = make_meta(
            EngineStep.DRAFT_CLARIFICATION,
            "draft_clarification.v1",
            GenerationMeta(model="template-fallback", attempts=exc.error.attempts, repaired=True),
        )
        return fallback(inp), meta
    return finalize(value, inp), make_meta(EngineStep.DRAFT_CLARIFICATION, prompt_version, gen)
