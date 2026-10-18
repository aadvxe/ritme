"""ORM rows → contract DTOs."""

from __future__ import annotations

import uuid
from typing import Any

from ritme_contracts import (
    ActionStatus,
    ActionType,
    ActivityEventOut,
    CaptureOut,
    CaptureSourceType,
    CaptureStatus,
    ClarificationQuestion,
    PlanAuthor,
    PlanStatus,
    PlanVersionOut,
    ProposedActionOut,
    QuestionStatus,
    RequirementItem,
    TaskOut,
    TaskStatus,
    VerificationState,
    WorkflowPlanDraft,
    WorkflowStatus,
    WorkflowSummary,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import models as m


def capture_out(c: m.Capture, workflow_id: uuid.UUID | None = None) -> CaptureOut:
    return CaptureOut(
        id=c.id,
        title=c.title,
        content_text=c.content_text,
        user_note=c.user_note,
        source_page_title=c.source_page_title,
        source_url=c.source_url,
        source_domain=c.source_domain,
        source_type=CaptureSourceType(c.source_type),
        status=CaptureStatus(c.status),
        workflow_id=workflow_id,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


def workflow_summary(w: m.Workflow) -> WorkflowSummary:
    return WorkflowSummary(
        id=w.id,
        capture_id=w.capture_id,
        title=w.title,
        objective=w.objective,
        status=WorkflowStatus(w.status),
        paused=w.paused,
        current_step=w.current_step,
        next_action=w.next_action,
        confirmed_due_at=w.confirmed_due_at,
        version=w.version,
        current_plan_version=w.current_plan_version,
        is_demo=w.is_demo,
        created_at=w.created_at,
        updated_at=w.updated_at,
    )


def requirement_item(r: m.Requirement) -> RequirementItem:
    return RequirementItem.model_validate(
        {
            "id": r.id,
            "kind": r.kind,
            "text": r.text,
            "certainty": r.certainty,
            "importance": r.importance,
            "evidence": r.evidence_json or [],
            "userConfirmedAt": r.user_confirmed_at.isoformat() if r.user_confirmed_at else None,
        }
    )


def question_item(q: m.ClarificationQuestionRow) -> ClarificationQuestion:
    return ClarificationQuestion(
        id=q.id,
        question=q.question,
        why_it_matters=q.why_it_matters,
        blocking=q.blocking,
        related_requirement_ids=list(q.related_requirement_ids or []),
        suggested_answers=q.suggested_answers_json,
        answer=q.answer,
        status=QuestionStatus(q.status),
    )


def task_out(session: Session, t: m.Task) -> TaskOut:
    deps = session.scalars(
        select(m.TaskDependency.depends_on_id).where(m.TaskDependency.task_id == t.id)
    ).all()
    return TaskOut(
        id=t.id,
        workflow_id=t.workflow_id,
        plan_version_id=t.plan_version_id,
        title=t.title,
        description=t.description,
        definition_of_done=t.definition_of_done,
        status=TaskStatus(t.status),
        estimated_minutes=t.estimated_minutes,
        due_at=t.due_at,
        depends_on=list(deps),
        requirement_ids=list(t.requirement_ids_json or []),
        created_by_action_id=t.created_by_action_id,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def plan_out(p: m.PlanVersion) -> PlanVersionOut:
    return PlanVersionOut(
        id=p.id,
        workflow_id=p.workflow_id,
        version=p.version,
        row_version=p.row_version,
        goal=p.goal,
        status=PlanStatus(p.status),
        created_by=PlanAuthor(p.created_by),
        plan=WorkflowPlanDraft.model_validate(p.plan_json),
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def action_out(a: m.ProposedAction) -> ProposedActionOut:
    result: dict[str, Any] = a.result_json or {}
    return ProposedActionOut(
        id=a.id,
        workflow_id=a.workflow_id,
        plan_version_id=a.plan_version_id,
        action_type=ActionType(a.action_type),
        provider=a.provider,
        payload=a.payload_json,
        reason_summary=a.reason_summary,
        status=ActionStatus(a.status),
        verification=VerificationState(a.verification),
        result_summary=result.get("summary"),
        result_ids=[str(i) for i in result.get("ids", [])],
        error_code=a.error_code,
        approved_at=a.approved_at,
        executed_at=a.executed_at,
        created_at=a.created_at,
    )


def event_out(e: m.ActivityEvent) -> ActivityEventOut:
    return ActivityEventOut(
        id=e.id,
        workflow_id=e.workflow_id,
        event_type=e.event_type,
        summary=e.summary,
        details=e.details_json,
        created_at=e.created_at,
    )
