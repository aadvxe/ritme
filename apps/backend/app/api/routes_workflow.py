"""Truth Board edits, clarification, planning, actions (approve/reject/execute), tasks, replan."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header
from pydantic import ValidationError
from ritme_contracts import (
    ActionStatus,
    AgentRunTrigger,
    AnswerDisposition,
    AnswerRequest,
    DraftClarificationInput,
    DraftClarificationResponse,
    PlanPatch,
    PlanVersionOut,
    ProposeActionRequest,
    ProposedActionOut,
    ReplanRequest,
    ReplanResponse,
    RequirementItem,
    RequirementPatch,
    TaskOut,
    TaskPatch,
    TaskStatus,
    WorkflowDetail,
    WorkflowPlanDraft,
    WorkflowStatus,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import mappers
from ..auth.deps import rate_limit, web_user
from ..db import models as m
from ..db.session import get_session
from ..domain import actions
from ..domain import state_machine as sm
from ..engine_port import EngineError, get_engine
from ..errors import AppError, ErrorCode, conflict, invalid_action, invalid_input
from ..queue import create_run, get_queue
from ..repos import get_owned, get_workflow, log_event
from ..worker import orchestrator
from .routes_core import build_detail

router = APIRouter()


def _engine_error(exc: EngineError) -> AppError:
    return AppError(ErrorCode.PROVIDER_ERROR, "The assistant could not finish that. Your work is saved — please try again.", 502, exc.retryable)


# ------------------------------------------------------------------ Truth Board


@router.patch("/workflows/{workflow_id}/requirements/{req_id}", response_model=RequirementItem, response_model_by_alias=True)
def patch_requirement(
    workflow_id: uuid.UUID, req_id: str, body: RequirementPatch,
    user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session),
) -> RequirementItem:
    wf = get_workflow(session, workflow_id, user_id)
    r = session.get(m.Requirement, (wf.id, req_id))
    if r is None:
        from ..errors import not_found  # noqa: PLC0415

        raise not_found("Item")
    if body.reject:
        r.rejected = True
        log_event(session, user_id, "requirement_rejected", "You removed an item from the Truth Board.", workflow_id=wf.id)
        return mappers.requirement_item(r)
    if body.text is not None and body.text != r.text:
        r.text = body.text
        r.edited_by_user = True
        r.user_confirmed_at = datetime.now(UTC)  # your edit is the latest truth for future planning
        log_event(session, user_id, "requirement_edited", "You edited an item. It is now confirmed by you.", workflow_id=wf.id)
    elif body.confirm:
        r.user_confirmed_at = datetime.now(UTC)
        log_event(session, user_id, "requirement_confirmed", "You confirmed an item.", workflow_id=wf.id)
    session.flush()
    return mappers.requirement_item(r)


@router.post("/workflows/{workflow_id}/questions/{question_id}/answer", response_model=WorkflowDetail, response_model_by_alias=True)
def answer_question(
    workflow_id: uuid.UUID, question_id: str, body: AnswerRequest,
    user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session),
) -> WorkflowDetail:
    wf = get_workflow(session, workflow_id, user_id)
    q = session.get(m.ClarificationQuestionRow, (wf.id, question_id))
    if q is None:
        from ..errors import not_found  # noqa: PLC0415

        raise not_found("Question")

    if body.disposition == AnswerDisposition.ANSWER:
        if not (body.answer and body.answer.strip()) and body.confirmed_due_at is None:
            raise invalid_input("Please write an answer, or choose to set this aside.")
        q.answer = (body.answer or "").strip() or q.answer
        q.status = "answered"
        log_event(session, user_id, "question_answered", "You answered a question.", workflow_id=wf.id)
    else:
        label = (body.assumption_label or "").strip() or "Assumption: not decided yet — will confirm later."
        q.status = "deferred"
        q.blocking = False
        q.assumption_label = label
        if session.get(m.Requirement, (wf.id, f"assume-{q.id}")) is None:
            session.add(m.Requirement(
                workflow_id=wf.id, id=f"assume-{q.id}", kind="assumption", text=label, certainty="inferred",
                importance="useful", evidence_json=[], edited_by_user=True,
            ))
        log_event(session, user_id, "question_deferred", "You set a question aside with an explicit assumption.", workflow_id=wf.id)

    if body.confirmed_due_at is not None:
        wf.confirmed_due_at = body.confirmed_due_at

    session.flush()
    blockers = orchestrator._blocking_open(session, wf)
    if blockers:
        wf.next_action = blockers[0].question
    elif wf.status == WorkflowStatus.NEEDS_INPUT.value:
        wf.next_action = "Drafting your plan…"
        run = create_run(session, user_id, wf.id, AgentRunTrigger.ANSWER)
        session.commit()  # persist before enqueueing
        try:
            get_queue().enqueue(run.id)
        except Exception:
            pass
    wf.version += 1
    return build_detail(session, wf)


@router.post(
    "/workflows/{workflow_id}/questions/{question_id}/draft",
    response_model=DraftClarificationResponse, response_model_by_alias=True,
    dependencies=[Depends(rate_limit("model"))],
)
def draft_clarification(
    workflow_id: uuid.UUID, question_id: str,
    user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session),
) -> DraftClarificationResponse:
    """Pre-writes a message for the user to send THEMSELVES. Never sent by Ritme."""
    wf = get_workflow(session, workflow_id, user_id)
    q = session.get(m.ClarificationQuestionRow, (wf.id, question_id))
    if q is None:
        from ..errors import not_found  # noqa: PLC0415

        raise not_found("Question")
    capture = session.get(m.Capture, wf.capture_id) if wf.capture_id else None
    related = [r for r in session.scalars(select(m.Requirement).where(m.Requirement.workflow_id == wf.id)) if r.id in (q.related_requirement_ids or [])]
    try:
        out, _meta = get_engine().draft_clarification(
            DraftClarificationInput(
                question=mappers.question_item(q),
                objective=wf.objective or wf.title,
                related=[mappers.requirement_item(r) for r in related],
                source_excerpt=capture.content_text[:600] if capture else None,
                preferences=orchestrator._prefs(session, user_id),
                context=orchestrator._context(),
            )
        )
    except EngineError as exc:
        raise _engine_error(exc) from None
    log_event(session, user_id, "clarification_drafted", "Drafted a message you can edit and send yourself. Ritme never sends it.", workflow_id=wf.id)
    return DraftClarificationResponse(question_id=q.id, message=out.message, notes=out.notes)


# ------------------------------------------------------------------ plan


def _plan_out(session: Session, row: m.PlanVersion) -> PlanVersionOut:
    return mappers.plan_out(row)


@router.post("/workflows/{workflow_id}/plan", response_model=PlanVersionOut, response_model_by_alias=True, dependencies=[Depends(rate_limit("model"))])
def make_plan(workflow_id: uuid.UUID, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session)) -> PlanVersionOut:
    wf = get_workflow(session, workflow_id, user_id)
    if wf.status == WorkflowStatus.CANCELLED.value or wf.paused:
        raise invalid_action("This workflow is paused or cancelled.")
    if orchestrator._blocking_open(session, wf):
        raise invalid_action("Please answer or set aside the open questions first.")
    run = m.AgentRun(user_id=user_id, workflow_id=wf.id, trigger="plan", status="running")
    session.add(run)
    session.flush()
    try:
        # Allowed transitions into `planning` come from needs_input / failed / blocked / in_progress / completed.
        row = orchestrator.plan(session, run, wf, orchestrator.StepBudget(8))
        orchestrator._finish_run(session, run, orchestrator.AgentRunStatus.SUCCEEDED)
    except EngineError as exc:
        session.rollback()
        raise _engine_error(exc) from None
    return mappers.plan_out(row)


@router.patch("/plan-versions/{plan_id}", response_model=PlanVersionOut, response_model_by_alias=True)
def patch_plan(
    plan_id: uuid.UUID, body: PlanPatch,
    if_match: str | None = Header(default=None),
    user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session),
) -> PlanVersionOut:
    row = session.get(m.PlanVersion, plan_id)
    if row is None:
        from ..errors import not_found  # noqa: PLC0415

        raise not_found("Plan")
    wf = get_workflow(session, row.workflow_id, user_id)
    expected = int(if_match) if if_match and if_match.isdigit() else body.row_version
    if expected != row.row_version or body.row_version != row.row_version:
        raise conflict("This plan changed since you opened it. Reload to see the latest.")
    if row.status != "draft":
        raise invalid_action("Only a draft plan can be edited.")
    data = dict(row.plan_json)
    if body.goal is not None:
        data["goal"] = body.goal
    if body.tasks is not None:
        data["tasks"] = [t.model_dump(by_alias=True, mode="json") for t in body.tasks]
    try:
        validated = WorkflowPlanDraft.model_validate(data)  # dependency + cycle checks
    except ValidationError as exc:
        raise invalid_action(str(exc.errors()[0]["msg"]).replace("Value error, ", "")) from None
    row.plan_json = validated.model_dump(by_alias=True, mode="json")
    row.goal = validated.goal
    row.row_version += 1
    row.created_by = "user"
    log_event(session, user_id, "plan_edited", "You edited the plan.", workflow_id=wf.id, details={"planVersion": row.version})
    session.flush()
    if row.plan_json["tasks"]:
        actions.propose_from_plan(session, user_id, wf, row)  # approved payloads are immutable: edits make a NEW proposal
    return mappers.plan_out(row)


@router.post("/workflows/{workflow_id}/actions", response_model=ProposedActionOut, response_model_by_alias=True, status_code=201)
def propose_action(
    workflow_id: uuid.UUID, body: ProposeActionRequest,
    user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session),
) -> ProposedActionOut:
    wf = get_workflow(session, workflow_id, user_id)
    plan = session.get(m.PlanVersion, body.plan_version_id)
    if plan is None or plan.workflow_id != wf.id:
        raise invalid_action("That plan does not belong to this workflow.")
    if plan.status != "draft":
        raise invalid_action("Only a draft plan can be proposed.")
    return mappers.action_out(actions.propose_from_plan(session, user_id, wf, plan))


@router.post("/workflows/{workflow_id}/replan", response_model=ReplanResponse, response_model_by_alias=True, dependencies=[Depends(rate_limit("model"))])
def replan(
    workflow_id: uuid.UUID, body: ReplanRequest,
    user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session),
) -> ReplanResponse:
    wf = get_workflow(session, workflow_id, user_id)
    if wf.status == WorkflowStatus.CANCELLED.value or wf.paused:
        raise invalid_action("This workflow is paused or cancelled.")
    from ritme_contracts import ReplanTrigger  # noqa: PLC0415

    if body.trigger == ReplanTrigger.REQUEST_CHANGED and not (body.new_due_at or (body.requirement_id and body.new_text)):
        raise invalid_input("Tell us what changed: a new date, or new wording for an item.")
    try:
        row, action, radius, diff = orchestrator.replan(session, wf, body)
    except EngineError as exc:
        session.rollback()
        raise _engine_error(exc) from None
    return ReplanResponse(plan=mappers.plan_out(row), action=mappers.action_out(action), blast_radius_task_ids=sorted(radius), diff=diff)


# ------------------------------------------------------------------ actions


@router.post("/actions/{action_id}/approve", response_model=ProposedActionOut, response_model_by_alias=True)
def approve_action(action_id: uuid.UUID, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session)) -> ProposedActionOut:
    return mappers.action_out(actions.approve(session, user_id, action_id))


@router.post("/actions/{action_id}/reject", response_model=ProposedActionOut, response_model_by_alias=True)
def reject_action(action_id: uuid.UUID, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session)) -> ProposedActionOut:
    return mappers.action_out(actions.reject(session, user_id, action_id))


@router.post("/actions/{action_id}/execute", response_model=ProposedActionOut, response_model_by_alias=True)
def execute_action(action_id: uuid.UUID, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session)) -> ProposedActionOut:
    a = actions.execute(session, user_id, action_id)
    return mappers.action_out(a)


# ------------------------------------------------------------------ tasks


@router.get("/workflows/{workflow_id}/tasks", response_model=list[TaskOut], response_model_by_alias=True)
def list_tasks(workflow_id: uuid.UUID, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session)) -> list[TaskOut]:
    wf = get_workflow(session, workflow_id, user_id)
    rows = session.scalars(select(m.Task).where(m.Task.workflow_id == wf.id, m.Task.user_id == user_id).order_by(m.Task.created_at, m.Task.title)).all()
    return [mappers.task_out(session, t) for t in rows]


@router.patch("/tasks/{task_id}", response_model=TaskOut, response_model_by_alias=True)
def patch_task(task_id: uuid.UUID, body: TaskPatch, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session)) -> TaskOut:
    t = get_owned(session, m.Task, task_id, user_id, "Task")
    wf = get_workflow(session, t.workflow_id, user_id)  # ownership + workflow relationship verified
    if body.status is not None and body.status.value != t.status:
        sm.assert_task(t.status, body.status.value)
        t.status = body.status.value
    if body.title is not None:
        t.title = body.title
    if body.description is not None:
        t.description = body.description
    if body.definition_of_done is not None:
        t.definition_of_done = body.definition_of_done
    session.flush()
    open_left = session.scalar(
        select(m.Task.id).where(m.Task.workflow_id == wf.id, m.Task.status.in_([TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.BLOCKED.value])).limit(1)
    )
    if open_left is None and wf.status == WorkflowStatus.IN_PROGRESS.value:
        sm.assert_workflow(wf.status, WorkflowStatus.COMPLETED.value)
        wf.status, wf.next_action, wf.current_step = WorkflowStatus.COMPLETED.value, None, "All tasks are done"
        log_event(session, user_id, "workflow_completed", "All tasks are done.", workflow_id=wf.id)
    elif open_left is not None and wf.status == WorkflowStatus.COMPLETED.value:
        wf.status = WorkflowStatus.IN_PROGRESS.value
    if open_left is not None:
        nxt = session.scalar(select(m.Task).where(m.Task.workflow_id == wf.id, m.Task.status.in_(["todo", "in_progress"])).order_by(m.Task.created_at, m.Task.title).limit(1))
        wf.next_action = nxt.title if nxt else wf.next_action
    log_event(session, user_id, "task_updated", "You updated a task.", workflow_id=wf.id, details={"taskId": str(t.id), "status": t.status})
    return mappers.task_out(session, t)


_ = ActionStatus
