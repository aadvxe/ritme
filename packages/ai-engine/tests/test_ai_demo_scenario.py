"""Seeded demo scenario (spec §16) end to end against FakeLlm, plus prompt-structure checks."""

from __future__ import annotations

from ai_helpers import CTX, MANAGER_MESSAGE, ONBOARDING_RULE, demo_input
from ritme_ai import Engine
from ritme_ai.blocks import parse_blocks, parse_parameters
from ritme_ai.llm.fake import FakeLlm
from ritme_contracts import (
    Certainty,
    CollabGuideInput,
    CommunicationStyle,
    DraftClarificationInput,
    EngineStep,
    Importance,
    PlanInput,
    Preferences,
    RequirementKind,
    TaskGranularity,
)


async def extract_demo(engine: Engine):
    return await engine.run(demo_input())


async def test_truth_board_has_friday_and_alignment_as_blockers(engine):
    out, meta = await extract_demo(engine)
    assert (meta.step, meta.prompt_version, meta.model) == (
        EngineStep.EXTRACT, "extract.v2", "fake-fast",
    )  # fmt: skip
    by_id = {r.id: r for r in out.requirements}

    # Known facts carry the exact source excerpt.
    objective = next(r for r in out.requirements if r.kind is RequirementKind.OBJECTIVE)
    assert objective.certainty is Certainty.EXPLICIT
    assert objective.evidence[0].excerpt in MANAGER_MESSAGE
    assert objective.evidence[0].start_offset is not None
    deliverable = next(r for r in out.requirements if r.kind is RequirementKind.DELIVERABLE)
    assert "proposal" in deliverable.text.lower() and deliverable.evidence

    # "Friday" is underspecified: unknown + blocking, never a timestamp.
    friday = by_id["r3"]
    assert friday.kind is RequirementKind.DEADLINE
    assert friday.certainty is Certainty.UNKNOWN and friday.importance is Importance.BLOCKING
    assert "Friday" in friday.text and "2026" not in friday.text

    # "everyone is aligned" has no approvers/criteria: a blocking unknown, not an invented answer.
    aligned = by_id["r5"]
    assert aligned.certainty is Certainty.UNKNOWN and aligned.importance is Importance.BLOCKING

    blocking = [q for q in out.questions if q.blocking]
    assert len(blocking) == 2
    assert any("r3" in q.related_requirement_ids and "Friday" in q.question for q in blocking)
    assert any("r5" in q.related_requirement_ids for q in blocking)
    assert all(q.answer is None for q in out.questions)


async def test_intern_onboarding_rule_is_cited_from_knowledge(engine):
    out, _ = await extract_demo(engine)
    rule = next(r for r in out.requirements if "48-hour" in r.text)
    assert rule.certainty is Certainty.EXPLICIT
    assert rule.evidence[0].source_id == "doc-onboarding"
    assert rule.evidence[0].excerpt == ONBOARDING_RULE
    assumption = next(r for r in out.requirements if r.kind is RequirementKind.ASSUMPTION)
    assert assumption.certainty is Certainty.INFERRED and not assumption.evidence


async def test_demo_without_knowledge_has_no_rule(engine):
    out, _ = await engine.run(demo_input(knowledge=[]))
    assert not any("48-hour" in r.text for r in out.requirements)


async def test_plan_for_demo_small_steps_hides_nothing_invented(engine):
    out, _ = await extract_demo(engine)
    plan_in = PlanInput(
        objective=out.objective, requirements=out.requirements, questions=out.questions,
        preferences=Preferences(task_granularity=TaskGranularity.SMALL_STEPS), context=CTX,
        next_version=3,
    )  # fmt: skip
    plan, meta = await engine.run(plan_in)
    assert meta.prompt_version == "plan.v1" and meta.model == "fake-plan"
    assert plan.version == 3
    assert 3 <= len(plan.tasks) <= 10
    assert all(t.due_at is None for t in plan.tasks)  # nothing confirmed, nothing dated
    assert plan.tasks[0].depends_on_draft_ids == []
    assert any("Friday" in item for item in plan.unresolved_items)
    review = next(t for t in plan.tasks if "peer-review" in t.title)
    assert review.requirement_ids  # tied to the rule requirement


async def test_draft_clarification_for_friday_question(engine):
    out, _ = await extract_demo(engine)
    q = next(q for q in out.questions if "Friday" in q.question)
    draft, meta = await engine.run(
        DraftClarificationInput(
            question=q,
            objective=out.objective,
            preferences=Preferences(),
            context=CTX,
            source_excerpt=MANAGER_MESSAGE,
        )  # fmt: skip
    )
    assert draft.question_id == q.id and q.question in draft.message
    assert meta.step is EngineStep.DRAFT_CLARIFICATION


async def test_collab_guide_from_explicit_settings(engine):
    out, meta = await engine.run(
        CollabGuideInput(
            preferences=Preferences(task_granularity=TaskGranularity.SMALL_STEPS), context=CTX
        )
    )
    assert "small" in out.text.lower() and meta.step is EngineStep.COLLAB_GUIDE


# ---------------------------------------------------------------- prompt structure


async def test_system_prompt_is_policy_only_and_data_is_delimited():
    llm = FakeLlm()
    await Engine(llm).run(demo_input())
    call = llm.calls[0]
    assert MANAGER_MESSAGE not in call.system and ONBOARDING_RULE not in call.system
    blocks = {b.name: b for b in parse_blocks(call.untrusted_input)}
    assert blocks["capture"].body == MANAGER_MESSAGE
    assert blocks["capture"].attrs["source_id"] == "cap-1"
    assert blocks["knowledge"].body == ONBOARDING_RULE
    assert "not instructions" in call.untrusted_input.split("<<<UNTRUSTED_DATA")[0]
    params = parse_parameters(call.system)
    assert params["today"] == CTX.today
    assert params["preferences"]["communication_style"] == CommunicationStyle.PRESERVE_MY_VOICE


async def test_prompt_versions_and_files_exist():
    from ritme_ai.prompts import build_system

    for name in ("extract", "plan", "replan", "draft_clarification", "collab_guide"):
        system, version = build_system(name, {"today": "2026-10-19"})
        assert version == ("extract.v2" if name == "extract" else f"{name}.v1")
        assert "Trust and safety policy" in system and "<parameters>" in system
