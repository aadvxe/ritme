"""Plan/replan guards: cycles, due dates, preference mapping, duplicates, Domino Recovery."""

from __future__ import annotations

import pytest
from ai_helpers import CTX, req, task
from ritme_ai import Engine, EngineError, explain_adaptations
from ritme_ai.guards.graph import topological_order, validate_dependencies
from ritme_ai.guards.preferences import plan_shape, strip_time_estimates
from ritme_ai.llm.fake import FakeLlm
from ritme_ai.llm.result import LlmErrorKind
from ritme_ai.schemas import PlanModelOutput, ReplanModelOutput
from ritme_contracts import (
    ChangeType,
    ClarificationQuestion,
    EngineStep,
    ExistingTask,
    InformationDensity,
    PlanInput,
    PlanLayout,
    Preferences,
    QuestionStatus,
    ReplanInput,
    ReplanTrigger,
    RequirementKind,
    TaskGranularity,
    TaskStatus,
    TimeEstimates,
    WorkflowPlanDraft,
)


def plan_in(prefs: Preferences | None = None, **kw) -> PlanInput:
    base = {
        "objective": "Ship the report",
        "requirements": [req("r1", RequirementKind.OBJECTIVE, "Ship the report", evidence="ship")],
        "questions": [],
        "preferences": prefs or Preferences(),
        "context": CTX,
    }
    base.update(kw)
    return PlanInput(**base)


def out(tasks, goal="Ship the report", unresolved=None) -> PlanModelOutput:
    return PlanModelOutput(goal=goal, tasks=tasks, unresolved_items=unresolved or [])


# ---------------------------------------------------------------- dependency / cycle validation


def test_cycle_is_rejected_by_the_schema():
    with pytest.raises(ValueError, match="cycle"):
        out([task("t1", ["t2"]), task("t2", ["t1"])])


def test_self_dependency_and_unknown_dependency_rejected():
    with pytest.raises(ValueError, match="itself"):
        out([task("t1", ["t1"])])
    with pytest.raises(ValueError, match="unknown"):
        out([task("t1", ["nope"])])
    with pytest.raises(ValueError, match="unique"):
        out([task("t1"), task("t1")])


def test_validate_dependencies_longer_cycle():
    with pytest.raises(ValueError, match="cycle"):
        validate_dependencies([task("a", ["c"]), task("b", ["a"]), task("c", ["b"])])


def test_topological_order_puts_ready_tasks_first():
    ordered = topological_order([task("t2", ["t1"]), task("t3", ["t2"]), task("t1")])
    assert [t.draft_id for t in ordered] == ["t1", "t2", "t3"]


def cyclic_json() -> str:
    t = lambda i, d: (  # noqa: E731
        f'{{"draftId":"{i}","title":"Write {i}","definitionOfDone":"done",'
        f'"dependsOnDraftIds":["{d}"]}}'
    )
    return f'{{"goal":"g","tasks":[{t("t1", "t2")},{t("t2", "t1")}]}}'


async def test_engine_rejects_cyclic_plan_after_one_repair():
    llm = FakeLlm().script(EngineStep.PLAN, cyclic_json(), cyclic_json())
    with pytest.raises(EngineError) as exc:
        await Engine(llm).run(plan_in())
    assert exc.value.kind is LlmErrorKind.INVALID_OUTPUT and not exc.value.retryable
    assert len(llm.calls) == 2


async def test_engine_accepts_plan_after_cycle_is_repaired():
    good = out([task("t1"), task("t2", ["t1"])])
    llm = FakeLlm().script(EngineStep.PLAN, cyclic_json(), good)
    plan, meta = await Engine(llm).run(plan_in())
    assert [t.draft_id for t in plan.tasks] == ["t1", "t2"]
    assert meta.repaired and meta.attempts == 2
    assert "cycle" in llm.calls[1].turns[2].text  # the repair note names the problem, not the data


# ---------------------------------------------------------------- due dates / estimates


async def run_plan(model_out: PlanModelOutput, inp: PlanInput | None = None):
    llm = FakeLlm().script(EngineStep.PLAN, model_out)
    return (await Engine(llm).run(inp or plan_in()))[0]


async def test_due_date_without_confirmation_is_stripped():
    plan = await run_plan(out([task("t1", due_at="2026-10-23T17:00:00+07:00")]))
    assert plan.tasks[0].due_at is None
    assert any("No due date set" in i for i in plan.unresolved_items)


async def test_due_date_is_kept_when_the_user_confirmed_it():
    confirmed = req(
        "r2", RequirementKind.DEADLINE, "Due 2026-10-30", evidence="by 2026-10-30",
        confirmed="2026-10-19T09:00:00+07:00",
    )  # fmt: skip
    inp = plan_in(requirements=[confirmed])
    plan = await run_plan(out([task("t1", due_at="2026-10-30T17:00:00+07:00")]), inp)
    assert plan.tasks[0].due_at == "2026-10-30T17:00:00+07:00"


async def test_due_date_from_answered_question_with_exact_date_is_kept():
    q = ClarificationQuestion(
        id="q1", question="When?", why_it_matters="w", blocking=True,
        answer="October 30, 2026", status=QuestionStatus.ANSWERED,
    )  # fmt: skip
    plan = await run_plan(
        out([task("t1", due_at="2026-10-30T09:00:00+07:00")]), plan_in(questions=[q])
    )
    assert plan.tasks[0].due_at


async def test_vague_answer_never_authorises_a_due_date():
    q = ClarificationQuestion(
        id="q1", question="When?", why_it_matters="w", blocking=True,
        answer="Friday", status=QuestionStatus.ANSWERED,
    )  # fmt: skip
    plan = await run_plan(
        out([task("t1", due_at="2026-10-23T09:00:00+07:00")]), plan_in(questions=[q])
    )
    assert plan.tasks[0].due_at is None


async def test_due_date_without_utc_offset_is_stripped():
    confirmed = req("r2", RequirementKind.DEADLINE, "Due 2026-10-30", evidence="x", confirmed="t")
    plan = await run_plan(
        out([task("t1", due_at="2026-10-30T17:00:00")]), plan_in(requirements=[confirmed])
    )
    assert plan.tasks[0].due_at is None


async def test_open_blocking_questions_stay_visible_in_unresolved_items():
    q = ClarificationQuestion(id="q1", question="Who approves?", why_it_matters="w", blocking=True)
    plan = await run_plan(out([task("t1")]), plan_in(questions=[q]))
    assert "Open question: Who approves?" in plan.unresolved_items


# ---------------------------------------------------------------- preference mapping


@pytest.mark.parametrize("hide", [True, False])
async def test_time_estimates_hidden_when_user_chose_hide(hide):
    prefs = Preferences(time_estimates=TimeEstimates.HIDE if hide else TimeEstimates.SHOW)
    model_out = out(
        [
            task(
                "t1",
                estimated_minutes=30,
                title="Write the intro (about 20 minutes)",
                description="Takes ~30 min. Draft it.",
                definition_of_done="Intro done in 2 hours",
            )
        ]  # fmt: skip
    )
    plan = await run_plan(model_out, plan_in(prefs))
    t = plan.tasks[0]
    if hide:
        assert t.estimated_minutes is None
        blob = " ".join([t.title, t.description, t.definition_of_done])
        assert "minute" not in blob and "min." not in blob and "hours" not in blob
        assert t.title == "Write the intro"
    else:
        assert t.estimated_minutes == 30 and "20 minutes" in t.title


def test_strip_time_estimates_variants():
    assert strip_time_estimates("Draft (15 min) now") == "Draft now"
    assert strip_time_estimates("Review, roughly 2 hours") == "Review"
    assert strip_time_estimates("No numbers here") == "No numbers here"


async def test_hide_estimates_with_fake_model_that_prints_them():
    inp = plan_in(
        Preferences(time_estimates=TimeEstimates.HIDE),
        objective="Ship the proposal",
        requirements=[req("r1", RequirementKind.OBJECTIVE, "Ship the proposal", evidence="ship")],
    )
    plan, _ = await Engine(FakeLlm()).run(inp)  # fixture sets estimatedMinutes when asked to show
    assert all(t.estimated_minutes is None for t in plan.tasks)


@pytest.mark.parametrize(
    "gran,limit",
    [
        (TaskGranularity.SMALL_STEPS, 10),
        (TaskGranularity.BALANCED, 8),
        (TaskGranularity.LARGER_BLOCKS, 5),
    ],
)
async def test_granularity_limits_task_count_via_repair(gran, limit):
    too_many = out([task(f"t{i}") for i in range(limit + 1)])
    fine = out([task(f"t{i}") for i in range(limit)])
    llm = FakeLlm().script(EngineStep.PLAN, too_many, fine)
    plan, meta = await Engine(llm).run(plan_in(Preferences(task_granularity=gran)))
    assert len(plan.tasks) == limit and meta.repaired
    assert plan_shape(Preferences(task_granularity=gran)).max_tasks == limit


async def test_demo_plan_shape_follows_granularity():
    small = plan_in(
        Preferences(task_granularity=TaskGranularity.SMALL_STEPS),
        objective="Ship the proposal",
    )
    large = plan_in(
        Preferences(task_granularity=TaskGranularity.LARGER_BLOCKS), objective="Ship the proposal"
    )
    p_small, _ = await Engine(FakeLlm()).run(small)
    p_large, _ = await Engine(FakeLlm()).run(large)
    assert len(p_small.tasks) > len(p_large.tasks)
    assert len(p_large.tasks) <= plan_shape(large.preferences).max_tasks


async def test_information_density_limits_text_length():
    long_desc = "This is a sentence about the work. " * 30
    concise = await run_plan(
        out([task("t1", description=long_desc)]),
        plan_in(Preferences(information_density=InformationDensity.CONCISE)),
    )
    detailed = await run_plan(
        out([task("t1", description=long_desc)]),
        plan_in(Preferences(information_density=InformationDensity.DETAILED)),
    )
    assert len(concise.tasks[0].description) <= 160
    assert len(detailed.tasks[0].description) > 400


def test_plan_layout_is_mapped_and_explained_without_inferring_anything():
    shape = plan_shape(Preferences(plan_layout=PlanLayout.ONE_STEP))
    assert shape.layout is PlanLayout.ONE_STEP
    lines = explain_adaptations(Preferences(task_granularity=TaskGranularity.SMALL_STEPS))
    assert lines[0] == "Because you selected small steps, tasks are presented as shorter actions."
    assert all(line.startswith("Because you") for line in lines)


async def test_first_task_can_start_now_for_one_step_layout():
    model_out = out([task("t3", ["t2"]), task("t2", ["t1"]), task("t1")])
    plan = await run_plan(model_out, plan_in(Preferences(plan_layout=PlanLayout.ONE_STEP)))
    assert plan.tasks[0].draft_id == "t1" and plan.tasks[0].depends_on_draft_ids == []


# ---------------------------------------------------------------- cleanup of references


async def test_unknown_requirement_refs_are_dropped_and_titles_normalised():
    plan = await run_plan(
        out([task("t1", requirement_ids=["r1", "ghost"], title="Step 1: Write the intro")])
    )
    assert plan.tasks[0].requirement_ids == ["r1"]
    assert plan.tasks[0].title == "Write the intro"


async def test_duplicate_of_existing_task_is_not_recreated():
    existing = ExistingTask(id="e1", title="Write the intro", status=TaskStatus.TODO)
    plan = await run_plan(
        out([task("t1", title="Write the intro"), task("t2", ["t1"], title="Edit the intro")]),
        plan_in(existing_tasks=[existing]),
    )
    assert [t.title for t in plan.tasks] == ["Edit the intro"]
    assert plan.tasks[0].depends_on_draft_ids == []
    assert any("already exists" in i for i in plan.unresolved_items)


# ---------------------------------------------------------------- replan / Domino Recovery


def replan_fixture_input(**kw) -> ReplanInput:
    tasks = [
        task("t1", title="Collect inputs", due_at="2026-10-20T09:00:00+07:00"),
        task("t2", ["t1"], title="Write draft", due_at="2026-10-22T09:00:00+07:00"),
        task("t3", ["t2"], title="Send draft", due_at="2026-10-23T09:00:00+07:00"),
        task("t4", title="Unrelated cleanup"),
    ]
    current = WorkflowPlanDraft(version=1, goal="Ship it", tasks=tasks)
    existing = [
        ExistingTask(id="e1", draft_id="t1", title="Collect inputs", status=TaskStatus.DONE,
                     due_at="2026-10-20T09:00:00+07:00"),
        ExistingTask(id="e2", draft_id="t2", title="Write draft", status=TaskStatus.TODO,
                     due_at="2026-10-22T09:00:00+07:00", depends_on=["e1"]),
        ExistingTask(id="e3", draft_id="t3", title="Send draft", status=TaskStatus.TODO,
                     due_at="2026-10-23T09:00:00+07:00", depends_on=["e2"]),
        ExistingTask(id="e4", draft_id="t4", title="Unrelated cleanup", status=TaskStatus.TODO),
    ]  # fmt: skip
    base = {
        "objective": "Ship it",
        "requirements": [req("r1", RequirementKind.OBJECTIVE, "Ship it", evidence="ship")],
        "questions": [],
        "preferences": Preferences(),
        "context": CTX,
        "current_plan": current,
        "existing_tasks": existing,
        "trigger": ReplanTrigger.REQUEST_CHANGED,
        "new_due_at": "2026-10-28T09:00:00+07:00",
        "blast_radius_task_ids": ["e2", "e3"],
        "next_version": 2,
    }
    base.update(kw)
    return ReplanInput(**base)


async def test_replan_moves_only_blast_radius_and_preserves_completed_work():
    inp = replan_fixture_input()
    plan, meta = await Engine(FakeLlm()).run(inp)
    assert meta.step is EngineStep.REPLAN and plan.version == 2
    by = {t.draft_id: t for t in plan.tasks}
    assert by["t2"].due_at == by["t3"].due_at == "2026-10-28T09:00:00+07:00"
    assert by["t1"].due_at == "2026-10-20T09:00:00+07:00"  # done: untouched
    assert by["t4"].due_at is None  # outside blast radius: untouched
    kinds = {c.existing_task_id: c.change_type for c in plan.proposed_changes}
    assert kinds == {
        "e1": ChangeType.KEEP, "e2": ChangeType.UPDATE, "e3": ChangeType.UPDATE,
        "e4": ChangeType.KEEP,
    }  # fmt: skip
    diff = next(c for c in plan.proposed_changes if c.existing_task_id == "e2")
    assert diff.before == {"due_at": "2026-10-22T09:00:00+07:00"}
    assert diff.after == {"due_at": "2026-10-28T09:00:00+07:00"} and diff.reason


async def test_replan_guard_reverts_edits_to_done_or_out_of_scope_tasks_and_restores_omissions():
    inp = replan_fixture_input()
    sneaky = ReplanModelOutput(
        goal="Ship it",
        tasks=[
            task("t1", title="Collect inputs, rewritten"),  # done: must be reverted
            task("t2", ["t1"], title="Write draft", due_at="2026-10-28T09:00:00+07:00"),
            task("t4", title="Unrelated cleanup, rewritten"),  # outside blast radius
            task("t5", ["t2"], title="Add stakeholder review"),  # genuinely new
        ],  # t3 omitted: must be restored
    )
    llm = FakeLlm().script(EngineStep.REPLAN, sneaky)
    plan, _ = await Engine(llm).run(inp)
    by = {t.draft_id: t for t in plan.tasks}
    assert by["t1"].title == "Collect inputs"
    assert by["t4"].title == "Unrelated cleanup"
    assert "t3" in by and by["t3"].title == "Send draft"
    assert by["t5"].title == "Add stakeholder review"
    creates = [c for c in plan.proposed_changes if c.change_type is ChangeType.CREATE]
    assert len(creates) == 1 and creates[0].existing_task_id is None


async def test_replan_does_not_invent_dates_outside_new_due_at():
    inp = replan_fixture_input()
    out_ = ReplanModelOutput(
        goal="Ship it",
        tasks=[
            task("t1", title="Collect inputs", due_at="2026-10-20T09:00:00+07:00"),
            task("t2", ["t1"], title="Write draft", due_at="2026-11-15T09:00:00+07:00"),
            task("t3", ["t2"], title="Send draft", due_at="2026-10-23T09:00:00+07:00"),
            task("t4", title="Unrelated cleanup"),
        ],
    )
    plan, _ = await Engine(FakeLlm().script(EngineStep.REPLAN, out_)).run(inp)
    assert {t.draft_id: t for t in plan.tasks}["t2"].due_at is None


async def test_could_not_work_marks_blocked_without_guilt_wording():
    inp = replan_fixture_input(trigger=ReplanTrigger.COULD_NOT_WORK, new_due_at=None)
    plan, _ = await Engine(FakeLlm()).run(inp)
    blocked = [c for c in plan.proposed_changes if c.change_type is ChangeType.MARK_BLOCKED]
    assert {c.existing_task_id for c in blocked} == {"e2", "e3"}
    assert all(c.after == {"status": "blocked"} for c in blocked)
    assert not any(
        w in c.reason.lower() for c in plan.proposed_changes for w in ("overdue", "late", "missed")
    )


async def test_replan_reasons_with_guilt_wording_are_replaced():
    from ritme_ai.schemas import ChangeReason

    inp = replan_fixture_input()
    model_out = ReplanModelOutput(
        goal="Ship it",
        tasks=list(inp.current_plan.tasks[:1])
        + [task("t2", ["t1"], title="Write draft", due_at="2026-10-28T09:00:00+07:00")]
        + list(inp.current_plan.tasks[2:]),
        changes=[
            ChangeReason(task_ref="t2", change_type=ChangeType.UPDATE, reason="You were late.")
        ],
    )
    plan, _ = await Engine(FakeLlm().script(EngineStep.REPLAN, model_out)).run(inp)
    update = next(c for c in plan.proposed_changes if c.existing_task_id == "e2")
    assert "late" not in update.reason.lower() and update.reason
