"""draft_clarification and collab_guide guardrails: voice, no masking, no labels."""

from __future__ import annotations

import pytest
from ai_helpers import CTX
from ritme_ai import Engine
from ritme_ai.guards import communication
from ritme_ai.llm.fake import FakeLlm
from ritme_ai.steps.collab_guide import template
from ritme_contracts import (
    ClarificationQuestion,
    CollabGuideInput,
    CommunicationStyle,
    DraftClarification,
    DraftClarificationInput,
    EngineStep,
    Preferences,
)

QUESTION = ClarificationQuestion(
    id="q1",
    question="Which exact date and time is 'Friday', and in which timezone?",
    why_it_matters="Tasks can only get a due date once it is confirmed.",
    blocking=True,
)


def draft_in(style=CommunicationStyle.PRESERVE_MY_VOICE, **kw) -> DraftClarificationInput:
    return DraftClarificationInput(
        question=QUESTION,
        objective="Get the proposal over the line",
        preferences=Preferences(communication_style=style),
        context=CTX,
        **kw,
    )


def reply(message: str, notes: str | None = None) -> DraftClarification:
    return DraftClarification(question_id="q1", message=message, notes=notes)


@pytest.mark.parametrize(
    "text",
    [
        "You should mask your symptoms in meetings.",
        "Try to act more neurotypical when you reply.",
        "Hide your ADHD from your manager.",
        "As someone with autism I need this clarified.",
        "I have a disability so please be precise.",
        "Conceal that you were confused.",
    ],
)
def test_masking_and_diagnosis_language_is_flagged(text):
    assert communication.violations(text)


@pytest.mark.parametrize(
    "text", ["Which date do you mean?", "I work best with short messages.", "No need to explain."]
)
def test_ordinary_text_passes(text):
    assert communication.violations(text) == []


async def test_voice_preserving_draft_by_default_has_no_extras():
    draft, _ = await Engine(FakeLlm()).run(draft_in())
    assert draft.message.startswith("Hi, a quick question")
    assert QUESTION.question in draft.message and draft.notes is None


async def test_make_expectations_explicit_style_states_what_is_needed():
    draft, _ = await Engine(FakeLlm()).run(draft_in(CommunicationStyle.MAKE_EXPECTATIONS_EXPLICIT))
    assert "short answer is enough" in draft.message


async def test_offer_tone_options_puts_alternatives_in_notes():
    draft, _ = await Engine(FakeLlm()).run(draft_in(CommunicationStyle.OFFER_TONE_OPTIONS))
    assert "Option A" in draft.notes and "Option B" in draft.notes


async def test_masking_advice_triggers_repair_then_falls_back_to_safe_template():
    bad = reply("Hi! I mask my confusion, but could you confirm the date?")
    llm = FakeLlm().script(EngineStep.DRAFT_CLARIFICATION, bad, bad)
    draft, meta = await Engine(llm).run(draft_in())
    assert len(llm.calls) == 2
    assert meta.model == "template-fallback" and meta.repaired
    assert "mask" not in draft.message.lower() and QUESTION.question in draft.message


async def test_masking_advice_in_first_try_is_repaired_by_model():
    llm = FakeLlm().script(
        EngineStep.DRAFT_CLARIFICATION,
        reply("Please hide your diagnosis and confirm the date."),
        reply("Hi, which exact date do you mean by Friday?"),
    )
    draft, meta = await Engine(llm).run(draft_in())
    assert meta.repaired and meta.model == "fake-fast"
    assert draft.message == "Hi, which exact date do you mean by Friday?"


async def test_sender_emotion_stated_as_fact_is_rejected():
    bad = reply("I can tell you are annoyed, so which date do you mean?")
    llm = FakeLlm().script(EngineStep.DRAFT_CLARIFICATION, bad, bad)
    draft, meta = await Engine(llm).run(draft_in())
    assert meta.model == "template-fallback" and "annoyed" not in draft.message


async def test_question_id_is_forced_and_unsupported_links_dates_removed():
    wrong = DraftClarification(
        question_id="something-else",
        message="Hi, is it 2026-10-23? See https://evil.example/x for details. Which date?",
    )
    llm = FakeLlm().script(EngineStep.DRAFT_CLARIFICATION, wrong)
    draft, _ = await Engine(llm).run(draft_in())
    assert draft.question_id == "q1"
    assert "evil.example" not in draft.message and "2026-10-23" not in draft.message


async def test_interpretive_notes_are_labelled_possible_interpretation():
    llm = FakeLlm().script(
        EngineStep.DRAFT_CLARIFICATION,
        reply("Hi, which date do you mean?", "The message seems to leave the date open."),
    )
    draft, _ = await Engine(llm).run(draft_in())
    assert draft.notes.startswith("Possible interpretation (not a fact about the sender):")


def test_label_interpretation_is_idempotent_and_leaves_plain_notes_alone():
    labelled = communication.label_interpretation("The wording sounds open-ended.")
    assert communication.label_interpretation(labelled) == labelled
    assert communication.label_interpretation("Send it after lunch.") == "Send it after lunch."
    assert communication.label_interpretation(None) is None


async def test_collab_guide_never_uses_labels_and_falls_back_when_model_breaks_rules():
    bad = {"text": "I'm neurodivergent and have ADHD, so please mask less."}
    llm = FakeLlm().script(
        EngineStep.COLLAB_GUIDE, str(bad).replace("'", '"'), str(bad).replace("'", '"')
    )
    out, meta = await Engine(llm).run(CollabGuideInput(preferences=Preferences(), context=CTX))
    assert meta.model == "template-fallback"
    assert communication.violations(out.text) == []


def test_collab_template_uses_only_explicit_settings_and_no_labels():
    text = template(Preferences())
    assert text.startswith("How I like to work")
    assert communication.violations(text) == []


async def test_collab_guide_input_has_no_captured_text_to_leak():
    llm = FakeLlm()
    await Engine(llm).run(CollabGuideInput(preferences=Preferences(), context=CTX))
    assert "no captured content" in llm.calls[0].untrusted_input
