"""Proposed-action lifecycle (spec §8.5): propose → approve/reject → execute exactly once → verify.

Exactly-once is enforced in the database, not in memory:
  * compare-and-set  UPDATE … SET status='executing' WHERE id=? AND status='approved'
  * unique idempotency key per user, deterministic task ids, unique (action, draft) constraint
Verification uses a FRESH session after the write transaction commits and compares ids AND values.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from ritme_contracts import ActionStatus, ActionType, VerificationState, WorkflowStatus
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import models as m
from ..db.session import new_session
from ..errors import AppError, conflict, invalid_action
from ..logging import get_logger
from ..repos import get_owned, log_event
from ..tools import tasks as tools
from . import state_machine as sm

log = get_logger()
STALE_EXECUTING = timedelta(seconds=30)


def plan_to_create_payload(plan_json: dict[str, Any]) -> dict[str, Any]:
    keep = ("draftId", "title", "description", "definitionOfDone", "estimatedMinutes", "dueAt", "dependsOnDraftIds", "requirementIds")
    return {"tasks": [{k: t.get(k) for k in keep if k in t} for t in plan_json["tasks"]]}


def _set_workflow(session: Session, wf: m.Workflow, status: WorkflowStatus, **fields: Any) -> None:
    sm.assert_workflow(wf.status, status.value)
    wf.status = status.value
    for k, v in fields.items():
        setattr(wf, k, v)
    wf.version += 1


def propose(
    session: Session,
    user_id: uuid.UUID,
    wf: m.Workflow,
    *,
    plan: m.PlanVersion | None,
    action_type: ActionType,
    payload: dict[str, Any],
    reason: str,
    idempotency_key: str,
) -> m.ProposedAction:
    """Create a pending action. Older pending actions for the workflow are cancelled first
    (approved payloads are immutable: a changed plan means a NEW action)."""
    existing = session.scalar(
        select(m.ProposedAction).where(m.ProposedAction.user_id == user_id, m.ProposedAction.idempotency_key == idempotency_key)
    )
    if existing:
        return existing
    if action_type == ActionType.CREATE_TASKS:
        tools.validate_create_payload(payload)
    else:
        tools.validate_update_payload(session, user_id, wf.id, payload)
    for old in session.scalars(
        select(m.ProposedAction).where(m.ProposedAction.workflow_id == wf.id, m.ProposedAction.status == ActionStatus.PENDING_APPROVAL.value)
    ):
        old.status = ActionStatus.CANCELLED.value
    action = m.ProposedAction(
        user_id=user_id,
        workflow_id=wf.id,
        plan_version_id=plan.id if plan else None,
        action_type=action_type.value,
        provider="ritme",
        payload_json=payload,
        reason_summary=reason,
        status=ActionStatus.PENDING_APPROVAL.value,
        idempotency_key=idempotency_key,
    )
    try:
        with session.begin_nested():
            session.add(action)
            session.flush()
    except IntegrityError:
        raise conflict("This proposal already exists.") from None
    if wf.status in (WorkflowStatus.PLANNING.value, WorkflowStatus.IN_PROGRESS.value, WorkflowStatus.COMPLETED.value, WorkflowStatus.BLOCKED.value):
        _set_workflow(session, wf, WorkflowStatus.READY_FOR_APPROVAL, current_step="Plan ready for your approval", next_action="Review the plan and approve it, or edit it first.")
    log_event(session, user_id, "action_proposed", f"Proposed: {reason}", workflow_id=wf.id, details={"actionId": str(action.id), "type": action_type.value})
    return action


def propose_from_plan(session: Session, user_id: uuid.UUID, wf: m.Workflow, plan: m.PlanVersion) -> m.ProposedAction:
    n = len(plan.plan_json["tasks"])
    return propose(
        session, user_id, wf,
        plan=plan,
        action_type=ActionType.CREATE_TASKS,
        payload=plan_to_create_payload(plan.plan_json),
        reason=f"Create {n} task{'s' if n != 1 else ''} in Ritme",
        idempotency_key=f"plan:{plan.id}:{plan.row_version}:create",
    )


def approve(session: Session, user_id: uuid.UUID, action_id: uuid.UUID) -> m.ProposedAction:
    a = get_owned(session, m.ProposedAction, action_id, user_id, "Action")
    if a.status == ActionStatus.APPROVED.value:
        return a  # idempotent
    sm.assert_action(a.status, ActionStatus.APPROVED.value)
    # Re-validate: ownership/shape may have changed since the proposal was made.
    if a.action_type == ActionType.CREATE_TASKS.value:
        tools.validate_create_payload(a.payload_json)
    else:
        tools.validate_update_payload(session, user_id, a.workflow_id, a.payload_json)
    a.status = ActionStatus.APPROVED.value
    a.approved_by = user_id
    a.approved_at = datetime.now(UTC)
    log_event(session, user_id, "action_approved", f"You approved: {a.reason_summary}", workflow_id=a.workflow_id, details={"actionId": str(a.id)})
    return a


def reject(session: Session, user_id: uuid.UUID, action_id: uuid.UUID) -> m.ProposedAction:
    a = get_owned(session, m.ProposedAction, action_id, user_id, "Action")
    if a.status == ActionStatus.REJECTED.value:
        return a
    sm.assert_action(a.status, ActionStatus.REJECTED.value)
    a.status = ActionStatus.REJECTED.value
    wf = session.get(m.Workflow, a.workflow_id)
    if wf:
        wf.next_action = "You rejected that proposal. Edit the plan or ask for a new one."
    log_event(session, user_id, "action_rejected", f"You rejected: {a.reason_summary}", workflow_id=a.workflow_id, details={"actionId": str(a.id)})
    return a


def _run_tool(session: Session, user_id: uuid.UUID, a: m.ProposedAction) -> tools.ToolResult:
    if a.action_type == ActionType.CREATE_TASKS.value:
        return tools.create_tasks(session, user_id, a)
    if a.action_type == ActionType.UPDATE_TASKS.value:
        return tools.update_tasks(session, user_id, a)
    raise invalid_action("Unknown action type.")


def _verify_fresh(a: m.ProposedAction, ids: list[str]) -> tools.Verification:
    """Fresh session = a real read-after-write, not the transaction that did the write."""
    with new_session() as fresh:
        row = fresh.get(m.ProposedAction, a.id)
        assert row is not None
        if a.action_type == ActionType.CREATE_TASKS.value:
            return tools.verify_create(fresh, row, ids)
        return tools.verify_update(fresh, row, ids)


def execute(session: Session, user_id: uuid.UUID, action_id: uuid.UUID) -> m.ProposedAction:
    a = get_owned(session, m.ProposedAction, action_id, user_id, "Action")
    if a.status == ActionStatus.SUCCEEDED.value:
        return a  # repeated execute with the same action never writes again
    resuming = False
    if a.status == ActionStatus.EXECUTING.value:
        if datetime.now(UTC) - a.updated_at < STALE_EXECUTING:
            raise conflict("This action is already running.")
        resuming = True  # a previous attempt may have written before timing out: verify before retrying
    elif a.status != ActionStatus.APPROVED.value:
        # Includes pending_approval: nothing can be written before approval.
        raise invalid_action("This action has not been approved.")

    if not resuming:
        claimed = session.execute(
            update(m.ProposedAction)
            .where(m.ProposedAction.id == a.id, m.ProposedAction.status == ActionStatus.APPROVED.value)
            .values(status=ActionStatus.EXECUTING.value, updated_at=datetime.now(UTC))
        ).rowcount
        session.commit()  # make the claim visible to every instance
        if claimed != 1:
            session.refresh(a)
            if a.status == ActionStatus.SUCCEEDED.value:
                return a
            raise conflict("This action is already running.")
        session.refresh(a)

    ids: list[str] = []
    try:
        if resuming:
            ids = [str(t) for t in session.scalars(select(m.Task.id).where(m.Task.created_by_action_id == a.id))]
            prior = _verify_fresh(a, ids)
            if prior.ok:
                return _finish(session, user_id, a, ids, prior, tools.ToolResult(ids=ids, summary="Recovered after interruption."))
        result = _run_tool(session, user_id, a)
        session.commit()  # the write transaction ends BEFORE verification
        ids = result.ids
    except AppError:
        session.rollback()
        return _fail(session, user_id, a, "invalid_action")
    except Exception as exc:  # tool/DB error or timeout: never report success
        session.rollback()
        log.error("action_failed", action_id=str(a.id), error_type=type(exc).__name__)
        return _fail(session, user_id, a, "tool_error")

    verification = _verify_fresh(a, ids)
    return _finish(session, user_id, a, ids, verification, result)


def _fail(session: Session, user_id: uuid.UUID, a: m.ProposedAction, code: str, verification: VerificationState = VerificationState.NOT_RUN) -> m.ProposedAction:
    a = session.get(m.ProposedAction, a.id)  # type: ignore[assignment]
    assert a is not None
    a.status = ActionStatus.FAILED.value
    a.error_code = code
    a.verification = verification.value
    a.executed_at = datetime.now(UTC)
    log_event(session, user_id, "action_failed", "That action did not complete. Nothing was marked as done.", workflow_id=a.workflow_id, details={"actionId": str(a.id), "code": code})
    session.commit()
    return a


def _finish(
    session: Session, user_id: uuid.UUID, a: m.ProposedAction, ids: list[str], v: tools.Verification, res: tools.ToolResult
) -> m.ProposedAction:
    a = session.get(m.ProposedAction, a.id)  # type: ignore[assignment]
    assert a is not None
    if not v.ok:
        # Inconclusive or mismatching read-back: never `succeeded`, never a Verified badge.
        a.result_json = {"ids": ids, "summary": res.summary, "verification": v.detail}
        return _fail(session, user_id, a, "verification_failed", VerificationState.UNVERIFIED)
    a.status = ActionStatus.SUCCEEDED.value
    a.verification = VerificationState.VERIFIED.value
    a.result_json = {"ids": ids, "summary": res.summary, "verification": v.detail}
    a.executed_at = datetime.now(UTC)
    wf = session.get(m.Workflow, a.workflow_id)
    assert wf is not None
    if a.plan_version_id:
        plan = session.get(m.PlanVersion, a.plan_version_id)
        if plan:
            for old in session.scalars(
                select(m.PlanVersion).where(m.PlanVersion.workflow_id == wf.id, m.PlanVersion.status == "approved", m.PlanVersion.id != plan.id)
            ):
                old.status = "superseded"
            plan.status = "approved"
            wf.current_plan_version = plan.version
    first = session.scalar(
        select(m.Task).where(m.Task.workflow_id == wf.id, m.Task.status.in_(["todo", "in_progress"])).order_by(m.Task.created_at, m.Task.title).limit(1)
    )
    if wf.status != WorkflowStatus.IN_PROGRESS.value:
        sm.assert_workflow(wf.status, WorkflowStatus.IN_PROGRESS.value)
        wf.status = WorkflowStatus.IN_PROGRESS.value
    wf.current_step = "Tasks created and verified"
    wf.next_action = first.title if first else None
    wf.version += 1
    log_event(session, user_id, "action_executed", a.reason_summary + " — done.", workflow_id=wf.id, details={"actionId": str(a.id), "ids": ids})
    log_event(session, user_id, "action_verified", "Verified: re-read from storage and matched what you approved.", workflow_id=wf.id, details={"actionId": str(a.id), "ids": ids})
    session.commit()
    return a
