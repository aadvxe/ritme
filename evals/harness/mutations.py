"""Negative controls: deliberately break one safeguard and confirm the evals notice.

    uv run python evals/run.py --negative-control guards-off

A control run exits 0 only if at least one scenario FAILS (i.e. the evals can detect the breakage).
Nothing is changed on disk: the patches live in this process only.
"""

from __future__ import annotations

import uuid


def _guards_off() -> None:
    import ritme_ai.steps.extract as ex
    import ritme_ai.steps.plan as pl
    from ritme_contracts import WorkflowPlanDraft

    ex.apply_extraction_guards = lambda out, inp: (out, list(out.confidence_notes))  # type: ignore[assignment]
    pl.check_task_count = lambda n, shape: None  # type: ignore[assignment]

    def passthrough(tasks, goal, unresolved, inp):  # type: ignore[no-untyped-def]
        return WorkflowPlanDraft(version=inp.next_version, goal=goal, tasks=tasks, unresolved_items=unresolved)

    pl.apply_plan_guards = passthrough  # type: ignore[assignment]


def _random_task_ids() -> None:
    import app.tools.tasks as tools

    tools.task_id_for = lambda action_id, draft_id: uuid.uuid4()  # type: ignore[assignment]


def _no_approval_gate() -> None:
    import app.domain.actions as actions
    from ritme_contracts import ActionStatus

    original = actions.approve

    def execute_without_approval(session, user_id, action_id):  # type: ignore[no-untyped-def]
        # "Execute" now auto-approves first: an unapproved action can be written.
        a = actions.get_owned(session, actions.m.ProposedAction, action_id, user_id, "Action")
        if a.status == ActionStatus.PENDING_APPROVAL.value:
            original(session, user_id, action_id)
            session.commit()
        return _real_execute(session, user_id, action_id)

    _real_execute = actions.execute
    actions.execute = execute_without_approval  # type: ignore[assignment]


CONTROLS = {
    "guards-off": ("extraction and plan guards replaced by pass-through", _guards_off),
    "random-task-ids": ("task ids no longer deterministic, so a retried write can duplicate", _random_task_ids),
    "no-approval-gate": ("execute auto-approves pending actions", _no_approval_gate),
}


def apply(name: str) -> str:
    desc, fn = CONTROLS[name]
    fn()
    return desc
