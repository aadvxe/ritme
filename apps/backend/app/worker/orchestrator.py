"""Bounded, resumable orchestrator (spec §8.2). State lives in the database; this code only sequences steps.

* Max AGENT_MAX_STEPS steps per run (retrieval, each model call, each persistence boundary counts).
* State is persisted at every boundary, so a refresh, timeout or restart resumes from stored rows.
* The model never writes: it returns an extraction/plan; code validates, stores, and proposes actions.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from ritme_contracts import (
    AgentRunStatus,
    ExistingTask,
    ExtractInput,
    PlanInput,
    Preferences,
    ReplanInput,
    ReplanRequest,
    StepContext,
    WorkflowExtraction,
    WorkflowPlanDraft,
    WorkflowStatus,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import mappers
from ..config import get_settings
from ..db import models as m
from ..db.session import new_session
from ..domain import actions, knowledge, recovery
from ..domain import state_machine as sm
from ..engine_port import EngineError, get_engine
from ..errors import invalid_action
from ..logging import get_logger
from ..repos import log_event

log = get_logger()


class StepBudget:
    """Hard cap on orchestrator/model/tool steps in one run."""

    def __init__(self, limit: int):
        self.limit = limit
        self.used = 0

    def spend(self, what: str) -> None:
        self.used += 1
        if self.used > self.limit:
            raise EngineError("step_budget", f"Run exceeded {self.limit} steps at {what}.", retryable=False)


# ------------------------------------------------------------------ helpers


def _prefs(session: Session, user_id: uuid.UUID) -> Preferences:
    row = session.get(m.UserPreferences, user_id)
    if row is None:
        return Preferences()
    return Preferences.model_validate(
        {f: getattr(row, f) for f in (
            "task_granularity", "information_density", "plan_layout", "clarification_help",
            "communication_style", "time_estimates", "pacing_support",
        )}
    )


def _context(tz: str = "UTC") -> StepContext:
    try:
        now = datetime.now(ZoneInfo(tz))
    except Exception:
        tz, now = "UTC", datetime.now(UTC)
    return StepContext(today=now.date().isoformat(), timezone=tz)


def _set_status(session: Session, wf: m.Workflow, status: WorkflowStatus, step: str | None = None, next_action: str | None = None) -> None:
    sm.assert_workflow(wf.status, status.value)
    wf.status = status.value
    if step is not None:
        wf.current_step = step
    if next_action is not None:
        wf.next_action = next_action
    wf.version += 1


def _record_meta(run: m.AgentRun, meta: Any) -> None:
    pv = dict(run.prompt_versions or {})
    pv[str(meta.step.value if hasattr(meta.step, "value") else meta.step)] = meta.prompt_version
    run.prompt_versions = pv
    run.model = meta.model


def _finish_run(session: Session, run: m.AgentRun, status: AgentRunStatus, error: str | None = None) -> None:
    run.status = status.value
    run.ended_at = datetime.now(UTC)
    run.error_code = error


def _blocking_open(session: Session, wf: m.Workflow) -> list[m.ClarificationQuestionRow]:
    return list(
        session.scalars(
            select(m.ClarificationQuestionRow).where(
                m.ClarificationQuestionRow.workflow_id == wf.id,
                m.ClarificationQuestionRow.blocking.is_(True),
                m.ClarificationQuestionRow.status == "open",
            ).order_by(m.ClarificationQuestionRow.created_at, m.ClarificationQuestionRow.id)
        )
    )


# ------------------------------------------------------------------ entry point


def execute_run(run_id: uuid.UUID) -> None:
    """Worker entry. Safe to call twice: finished runs are ignored, interrupted runs resume."""
    session = new_session()
    try:
        run = session.get(m.AgentRun, run_id)
        if run is None or run.status in (AgentRunStatus.SUCCEEDED.value, AgentRunStatus.CANCELLED.value):
            return
        wf = session.get(m.Workflow, run.workflow_id)
        if wf is None or wf.status == WorkflowStatus.CANCELLED.value or wf.paused:
            _finish_run(session, run, AgentRunStatus.CANCELLED)  # pause/cancel prevent future steps
            session.commit()
            return
        run.status = AgentRunStatus.RUNNING.value
        session.commit()
        budget = StepBudget(get_settings().agent_max_steps)
        try:
            if run.trigger in ("capture", "resume"):
                analyze(session, run, wf, budget)
            elif run.trigger in ("answer", "plan"):
                plan(session, run, wf, budget)
            else:
                raise EngineError("unsupported_trigger", run.trigger, retryable=False)
            _finish_run(session, run, AgentRunStatus.SUCCEEDED)
            session.commit()
        except EngineError as exc:
            _fail(session, run, wf, exc.code)
        except Exception as exc:
            log.error("run_failed", run_id=str(run.id), error_type=type(exc).__name__)
            _fail(session, run, wf, "internal")
    finally:
        session.close()


def _fail(session: Session, run: m.AgentRun, wf: m.Workflow, code: str) -> None:
    session.rollback()
    run = session.get(m.AgentRun, run.id)  # type: ignore[assignment]
    wf = session.get(m.Workflow, wf.id)  # type: ignore[assignment]
    assert run and wf
    _finish_run(session, run, AgentRunStatus.FAILED, code)
    if wf.status not in (WorkflowStatus.CANCELLED.value, WorkflowStatus.FAILED.value):
        try:
            _set_status(session, wf, WorkflowStatus.FAILED, "Analysis did not finish", "Something went wrong on our side. Your text is saved — you can try again.")
        except Exception:  # transition not allowed from here: keep status, still surface the message
            wf.next_action = "Something went wrong on our side. Your text is saved — you can try again."
    log_event(session, wf.user_id, "run_failed", "The analysis could not finish. Nothing was lost; you can retry.", workflow_id=wf.id, details={"runId": str(run.id), "code": code})
    session.commit()


# ------------------------------------------------------------------ analysis


def analyze(session: Session, run: m.AgentRun, wf: m.Workflow, budget: StepBudget) -> None:
    user_id = wf.user_id
    capture = session.get(m.Capture, wf.capture_id) if wf.capture_id else None
    if capture is None:
        raise EngineError("no_capture", "There is no captured text to analyse.", retryable=False)

    _set_status(session, wf, WorkflowStatus.ANALYZING, "Reading what you saved", "Finding requirements and what is missing…")
    log_event(session, user_id, "analysis_started", "Started reading your capture.", workflow_id=wf.id)
    session.commit()

    budget.spend("retrieve")
    query = " ".join(filter(None, [capture.title, capture.content_text[:400], capture.user_note]))
    citations = knowledge.search(session, user_id, query, limit=5)

    budget.spend("extract")
    prior = _stored_extraction(session, wf)
    inp = ExtractInput(
        capture_id=str(capture.id),
        title=capture.title,
        content_text=capture.content_text,
        user_note=capture.user_note,
        source_domain=capture.source_domain,
        knowledge=citations,
        preferences=_prefs(session, user_id),
        context=_context(),
        prior=prior,
    )
    extraction, meta = get_engine().extract(inp)
    _record_meta(run, meta)

    budget.spend("persist")
    _store_extraction(session, wf, extraction, citations)
    run.step_count = budget.used
    log_event(
        session, user_id, "extraction_saved",
        f"Found {len(extraction.requirements)} item(s) and {len(extraction.questions)} question(s).",
        workflow_id=wf.id, details={"requirements": len(extraction.requirements), "questions": len(extraction.questions)},
    )
    session.commit()

    blockers = _blocking_open(session, wf)
    if blockers:
        _set_status(session, wf, WorkflowStatus.NEEDS_INPUT, "Waiting for your answer", blockers[0].question)
        log_event(session, user_id, "needs_input", "One thing is unclear and needs your answer before planning.", workflow_id=wf.id)
        session.commit()
        return
    plan(session, run, wf, budget)


def _stored_extraction(session: Session, wf: m.Workflow) -> WorkflowExtraction | None:
    reqs = session.scalars(select(m.Requirement).where(m.Requirement.workflow_id == wf.id, m.Requirement.rejected.is_(False))).all()
    if not reqs:
        return None
    qs = session.scalars(select(m.ClarificationQuestionRow).where(m.ClarificationQuestionRow.workflow_id == wf.id)).all()
    return WorkflowExtraction(
        suggested_title=wf.title,
        objective=wf.objective or "",
        requirements=[mappers.requirement_item(r) for r in reqs],
        questions=[mappers.question_item(q) for q in qs],
        summary="",
    )


def _store_extraction(session: Session, wf: m.Workflow, ex: WorkflowExtraction, citations: list) -> None:
    """Merge: anything the user edited, confirmed, rejected or answered is never overwritten."""
    existing_r = {r.id: r for r in session.scalars(select(m.Requirement).where(m.Requirement.workflow_id == wf.id))}
    for r in ex.requirements:
        row = existing_r.get(r.id)
        ev = [e.model_dump(by_alias=True) for e in r.evidence]
        if row is None:
            session.add(m.Requirement(
                workflow_id=wf.id, id=r.id, kind=r.kind.value, text=r.text, certainty=r.certainty.value,
                importance=r.importance.value, evidence_json=ev, schema_version=ex.schema_version,
            ))
        elif not (row.edited_by_user or row.user_confirmed_at or row.rejected):
            row.kind, row.text, row.certainty, row.importance = r.kind.value, r.text, r.certainty.value, r.importance.value
            row.evidence_json = ev
    existing_q = {q.id: q for q in session.scalars(select(m.ClarificationQuestionRow).where(m.ClarificationQuestionRow.workflow_id == wf.id))}
    for q in ex.questions:
        row = existing_q.get(q.id)
        if row is None:
            session.add(m.ClarificationQuestionRow(
                workflow_id=wf.id, id=q.id, question=q.question, why_it_matters=q.why_it_matters, blocking=q.blocking,
                related_requirement_ids=q.related_requirement_ids, suggested_answers_json=q.suggested_answers, status="open",
            ))
        elif row.status == "open":
            row.question, row.why_it_matters, row.blocking = q.question, q.why_it_matters, q.blocking
            row.related_requirement_ids, row.suggested_answers_json = q.related_requirement_ids, q.suggested_answers
    state = dict(wf.state_json or {})
    if not state.get("title_locked"):
        wf.title = ex.suggested_title[:160]
    wf.objective = wf.objective or ex.objective
    # Only keep citations that an extracted item actually cites (every grounded claim resolves to a stored chunk).
    cited_docs = {e.source_id for r in ex.requirements for e in r.evidence}
    state["citations"] = [c.model_dump(by_alias=True, mode="json") for c in citations if c.source_id in cited_docs]
    state["summary"] = ex.summary
    state["confidence_notes"] = ex.confidence_notes
    wf.state_json = state
    session.flush()


# ------------------------------------------------------------------ planning


def _plan_input(session: Session, wf: m.Workflow, user_id: uuid.UUID, next_version: int) -> PlanInput:
    reqs = session.scalars(
        select(m.Requirement).where(m.Requirement.workflow_id == wf.id, m.Requirement.rejected.is_(False)).order_by(m.Requirement.created_at, m.Requirement.id)
    ).all()
    qs = session.scalars(select(m.ClarificationQuestionRow).where(m.ClarificationQuestionRow.workflow_id == wf.id)).all()
    tasks = session.scalars(select(m.Task).where(m.Task.workflow_id == wf.id)).all()
    from ritme_contracts import Citation  # noqa: PLC0415

    return PlanInput(
        objective=wf.objective or wf.title,
        requirements=[mappers.requirement_item(r) for r in reqs],
        questions=[mappers.question_item(q) for q in qs],
        knowledge=[Citation.model_validate(c) for c in (wf.state_json or {}).get("citations", [])],
        existing_tasks=[
            ExistingTask(
                id=str(t.id), draft_id=t.draft_id, title=t.title, status=t.status,
                due_at=t.due_at.isoformat() if t.due_at else None,
                depends_on=[str(d) for d in session.scalars(select(m.TaskDependency.depends_on_id).where(m.TaskDependency.task_id == t.id))],
            )
            for t in tasks
        ],
        preferences=_prefs(session, user_id),
        context=_context(),
        next_version=next_version,
    )


def plan(session: Session, run: m.AgentRun, wf: m.Workflow, budget: StepBudget) -> m.PlanVersion:
    """Generate a draft plan and propose the create-tasks action. Gate: blocking questions must be resolved."""
    user_id = wf.user_id
    if _blocking_open(session, wf):
        raise invalid_action("Please answer or set aside the open questions before planning.")
    if wf.status != WorkflowStatus.PLANNING.value:
        _set_status(session, wf, WorkflowStatus.PLANNING, "Making a plan", "Drafting a plan from what is confirmed…")
        log_event(session, user_id, "planning_started", "Started drafting a plan from your confirmed details.", workflow_id=wf.id)
        session.commit()

    budget.spend("plan")
    last = session.scalar(select(m.PlanVersion.version).where(m.PlanVersion.workflow_id == wf.id).order_by(m.PlanVersion.version.desc()).limit(1)) or 0
    draft, meta = get_engine().plan(_plan_input(session, wf, user_id, last + 1))
    _record_meta(run, meta)

    budget.spend("persist")
    for old in session.scalars(select(m.PlanVersion).where(m.PlanVersion.workflow_id == wf.id, m.PlanVersion.status == "draft")):
        old.status = "superseded"
    draft = WorkflowPlanDraft.model_validate({**draft.model_dump(by_alias=True), "version": last + 1})
    row = m.PlanVersion(
        workflow_id=wf.id, version=last + 1, goal=draft.goal,
        plan_json=draft.model_dump(by_alias=True, mode="json"), status="draft", created_by="agent",
    )
    session.add(row)
    session.flush()
    log_event(session, user_id, "plan_drafted", f"Drafted a plan with {len(draft.tasks)} task(s).", workflow_id=wf.id, details={"planVersion": row.version})
    actions.propose_from_plan(session, user_id, wf, row)
    run.step_count = budget.used
    session.commit()
    return row


# ------------------------------------------------------------------ Domino Recovery (called synchronously by the API)


def replan(session: Session, wf: m.Workflow, body: ReplanRequest) -> tuple[m.PlanVersion, m.ProposedAction, set[uuid.UUID], list]:
    user_id = wf.user_id
    run = m.AgentRun(user_id=user_id, workflow_id=wf.id, trigger="replan", status="running", input_json={"trigger": body.trigger.value})
    session.add(run)
    session.flush()
    budget = StepBudget(get_settings().agent_max_steps)
    try:
        current = session.scalar(
            select(m.PlanVersion).where(m.PlanVersion.workflow_id == wf.id, m.PlanVersion.status == "approved").order_by(m.PlanVersion.version.desc()).limit(1)
        )
        if current is None:
            raise invalid_action("There is no approved plan to change yet.")
        radius = recovery.blast_radius(session, wf.id, body.trigger, changed_requirement_id=body.requirement_id, new_due_at=body.new_due_at)
        last = session.scalar(select(m.PlanVersion.version).where(m.PlanVersion.workflow_id == wf.id).order_by(m.PlanVersion.version.desc()).limit(1)) or 0

        budget.spend("replan")
        base = _plan_input(session, wf, user_id, last + 1)
        inp = ReplanInput(
            **base.model_dump(),
            current_plan=WorkflowPlanDraft.model_validate(current.plan_json),
            trigger=body.trigger,
            changed_requirement_id=body.requirement_id,
            new_text=body.new_text,
            new_due_at=body.new_due_at.isoformat() if body.new_due_at else None,
            blast_radius_task_ids=[str(i) for i in radius],
        )
        proposal, meta = get_engine().replan(inp)
        _record_meta(run, meta)

        budget.spend("validate")
        confirmed = body.new_due_at or wf.confirmed_due_at
        payload, diff = recovery.build_change_set(session, wf.id, proposal, radius, confirmed_due_at=confirmed)
        if body.new_due_at is not None:
            payload["workflowChanges"] = {"confirmedDueAt": body.new_due_at.isoformat()}
        if body.requirement_id and body.new_text:
            payload["requirementChange"] = {"id": body.requirement_id, "text": body.new_text}
        if not payload["updates"] and not payload["creates"] and "workflowChanges" not in payload and "requirementChange" not in payload:
            raise invalid_action("Nothing in the plan needs to change.")

        stored = WorkflowPlanDraft.model_validate({**proposal.model_dump(by_alias=True), "version": last + 1, "proposedChanges": [d.model_dump(by_alias=True) for d in diff]})
        for old in session.scalars(select(m.PlanVersion).where(m.PlanVersion.workflow_id == wf.id, m.PlanVersion.status == "draft")):
            old.status = "superseded"
        row = m.PlanVersion(workflow_id=wf.id, version=last + 1, goal=stored.goal, plan_json=stored.model_dump(by_alias=True, mode="json"), status="draft", created_by="agent")
        session.add(row)
        session.flush()
        log_event(session, user_id, "replan_proposed", f"Proposed changes to {len(radius)} task(s); nothing changes until you approve.", workflow_id=wf.id, details={"affected": len(radius)})
        from ritme_contracts import ActionType  # noqa: PLC0415

        action = actions.propose(
            session, user_id, wf, plan=row, action_type=ActionType.UPDATE_TASKS, payload=payload,
            reason=f"Update the plan ({len(payload['updates'])} changed, {len(payload['creates'])} new)",
            idempotency_key=f"replan:{row.id}",
        )
        _finish_run(session, run, AgentRunStatus.SUCCEEDED)
        run.step_count = budget.used
        return row, action, radius, diff
    except Exception as exc:
        _finish_run(session, run, AgentRunStatus.FAILED, getattr(exc, "code", type(exc).__name__)[:60])
        raise
