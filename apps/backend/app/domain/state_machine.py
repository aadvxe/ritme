"""Allowed transitions (spec §8.1). Every status change in the backend goes through `assert_*`."""

from __future__ import annotations

from ritme_contracts import ActionStatus, TaskStatus, WorkflowStatus

from ..errors import invalid_action

W = WorkflowStatus
A = ActionStatus
T = TaskStatus

WORKFLOW_TRANSITIONS: dict[WorkflowStatus, frozenset[WorkflowStatus]] = {
    W.CAPTURED: frozenset({W.ANALYZING, W.CANCELLED, W.FAILED}),
    W.ANALYZING: frozenset({W.NEEDS_INPUT, W.PLANNING, W.FAILED, W.CANCELLED}),
    W.NEEDS_INPUT: frozenset({W.PLANNING, W.ANALYZING, W.BLOCKED, W.CANCELLED}),
    W.PLANNING: frozenset({W.READY_FOR_APPROVAL, W.NEEDS_INPUT, W.FAILED, W.CANCELLED}),
    W.READY_FOR_APPROVAL: frozenset({W.IN_PROGRESS, W.PLANNING, W.NEEDS_INPUT, W.CANCELLED}),
    W.IN_PROGRESS: frozenset({W.COMPLETED, W.BLOCKED, W.PLANNING, W.READY_FOR_APPROVAL, W.CANCELLED}),
    W.BLOCKED: frozenset({W.IN_PROGRESS, W.NEEDS_INPUT, W.PLANNING, W.CANCELLED}),
    W.COMPLETED: frozenset({W.PLANNING, W.IN_PROGRESS}),  # "Something changed" can reopen
    W.FAILED: frozenset({W.ANALYZING, W.PLANNING, W.CANCELLED}),  # data stays recoverable
    W.CANCELLED: frozenset(),
}

ACTION_TRANSITIONS: dict[ActionStatus, frozenset[ActionStatus]] = {
    A.PENDING_APPROVAL: frozenset({A.APPROVED, A.REJECTED, A.CANCELLED}),
    A.APPROVED: frozenset({A.EXECUTING, A.CANCELLED}),
    A.EXECUTING: frozenset({A.SUCCEEDED, A.FAILED}),
    A.SUCCEEDED: frozenset(),
    A.FAILED: frozenset(),
    A.REJECTED: frozenset(),
    A.CANCELLED: frozenset(),
}

TASK_TRANSITIONS: dict[TaskStatus, frozenset[TaskStatus]] = {
    T.TODO: frozenset({T.IN_PROGRESS, T.BLOCKED, T.DONE, T.SKIPPED}),
    T.IN_PROGRESS: frozenset({T.TODO, T.BLOCKED, T.DONE, T.SKIPPED}),
    T.BLOCKED: frozenset({T.TODO, T.IN_PROGRESS, T.SKIPPED}),
    T.DONE: frozenset({T.TODO, T.IN_PROGRESS}),  # user may reopen
    T.SKIPPED: frozenset({T.TODO, T.IN_PROGRESS}),
}


def can_transition_workflow(src: WorkflowStatus, dst: WorkflowStatus) -> bool:
    return src == dst or dst in WORKFLOW_TRANSITIONS[src]


def assert_workflow(src: str, dst: str) -> None:
    s, d = WorkflowStatus(src), WorkflowStatus(dst)
    if not can_transition_workflow(s, d):
        raise invalid_action(f"A workflow cannot move from {s.value} to {d.value}.")


def assert_action(src: str, dst: str) -> None:
    s, d = ActionStatus(src), ActionStatus(dst)
    if d not in ACTION_TRANSITIONS[s]:
        raise invalid_action(f"An action cannot move from {s.value} to {d.value}.")


def assert_task(src: str, dst: str) -> None:
    s, d = TaskStatus(src), TaskStatus(dst)
    if s != d and d not in TASK_TRANSITIONS[s]:
        raise invalid_action(f"A task cannot move from {s.value} to {d.value}.")
