# ruff: noqa: E501
"""collab_guide: a copy-only "How I like to work" note from EXPLICIT settings only (P1-a)."""

from __future__ import annotations

from ritme_contracts import (
    ClarificationHelp,
    CollabGuideInput,
    CollabGuideOutput,
    CommunicationStyle,
    EngineStep,
    InformationDensity,
    PlanLayout,
    Preferences,
    StepMeta,
    TaskGranularity,
    TimeEstimates,
)

from ..blocks import render_block
from ..errors import EngineError
from ..guards import communication
from ..guards.text import limit_text
from ..llm.base import LlmAdapter
from ..llm.result import GenerationMeta, LlmErrorKind
from .base import base_parameters, call_llm, make_meta

_CHARS = {
    InformationDensity.CONCISE: 900,
    InformationDensity.BALANCED: 1400,
    InformationDensity.DETAILED: 2000,
}


def template(prefs: Preferences) -> str:
    """Deterministic note built straight from the settings (also the safe fallback)."""
    lines = ["How I like to work:"]
    lines.append(
        {
            TaskGranularity.SMALL_STEPS: "- I work best when tasks are broken into small, single-action steps.",
            TaskGranularity.BALANCED: "- Medium-sized tasks work well for me.",
            TaskGranularity.LARGER_BLOCKS: "- I prefer larger blocks of work over many small tasks.",
        }[prefs.task_granularity]
    )
    lines.append(
        {
            InformationDensity.CONCISE: "- Short, to-the-point messages help me most.",
            InformationDensity.BALANCED: "- A brief message with the key context works well.",
            InformationDensity.DETAILED: "- I like having the full detail and context up front.",
        }[prefs.information_density]
    )
    lines.append(
        "- It helps me to see rough time estimates."
        if prefs.time_estimates is TimeEstimates.SHOW
        else "- I prefer not to work from time estimates."
    )
    lines.append(
        {
            ClarificationHelp.SHOW_QUESTIONS: "- If something is unclear, I will list my questions for you.",
            ClarificationHelp.DRAFT_MESSAGE: "- If something is unclear, I will send a short, specific question.",
            ClarificationHelp.INDEPENDENT: "- If something is unclear, I will usually work it out on my own first.",
        }[prefs.clarification_help]
    )
    lines.append(
        {
            CommunicationStyle.PRESERVE_MY_VOICE: "- I write in my own plain words.",
            CommunicationStyle.MAKE_EXPECTATIONS_EXPLICIT: "- Clear, explicit expectations (what, by when, what done looks like) help me.",
            CommunicationStyle.OFFER_TONE_OPTIONS: "- I may offer a couple of wording options.",
        }[prefs.communication_style]
    )
    if prefs.plan_layout is PlanLayout.ONE_STEP:
        lines.append("- Seeing one next step at a time keeps me focused.")
    return "\n".join(lines)


async def run(
    llm: LlmAdapter, inp: CollabGuideInput, timeout_ms: int
) -> tuple[CollabGuideOutput, StepMeta]:
    def validate(out: CollabGuideOutput) -> None:
        communication.check(out.text)

    try:
        value, prompt_version, gen = await call_llm(
            llm,
            step=EngineStep.COLLAB_GUIDE,
            parameters=base_parameters(inp.preferences, inp.context),
            blocks=[render_block("note", "(no captured content; use the preferences only)")],
            schema=CollabGuideOutput,
            timeout_ms=timeout_ms,
            validate=validate,
        )
    except EngineError as exc:
        if exc.error.kind is not LlmErrorKind.INVALID_OUTPUT:
            raise
        meta = make_meta(
            EngineStep.COLLAB_GUIDE,
            "collab_guide.v1",
            GenerationMeta(model="template-fallback", attempts=exc.error.attempts, repaired=True),
        )
        return CollabGuideOutput(text=template(inp.preferences)), meta
    text = limit_text(value.text, _CHARS[inp.preferences.information_density])
    return CollabGuideOutput(text=text), make_meta(EngineStep.COLLAB_GUIDE, prompt_version, gen)
