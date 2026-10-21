"""Identity, preferences, captures, workflows (read/patch/pause/resume/cancel/delete), activity."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Response
from ritme_contracts import (
    ActivityPage,
    AgentRunTrigger,
    CaptureCreate,
    CaptureCreateResponse,
    CaptureOut,
    Citation,
    DeletionResult,
    MeOut,
    PreferencesOut,
    PreferencesPatch,
    ResumeCard,
    WorkflowDetail,
    WorkflowPatch,
    WorkflowStatus,
    WorkflowSummary,
)
from ritme_contracts.preferences import CONSENT_VERSION
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import mappers
from ..auth.deps import Principal, capture_writer, rate_limit, web_user
from ..config import Settings, get_settings
from ..db import models as m
from ..db.session import get_session
from ..domain import state_machine as sm
from ..domain.captures import create_capture
from ..domain.deletion import delete_capture, delete_workflow
from ..errors import conflict
from ..queue import create_run, get_queue
from ..repos import get_owned, get_workflow, log_event

router = APIRouter()

# ------------------------------------------------------------------ identity


@router.get("/me", response_model=MeOut, response_model_by_alias=True)
def me(user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")) -> MeOut:
    u = session.get(m.User, user_id)
    assert u is not None
    return MeOut(
        id=u.id,
        email=u.email,
        display_name=u.display_name,
        photo_url=u.photo_url,
        onboarding_completed=u.onboarding_completed,
    )


@router.post("/me/onboarding", response_model=MeOut, response_model_by_alias=True)
def complete_onboarding(user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")) -> MeOut:
    u = session.get(m.User, user_id)
    assert u is not None
    u.onboarding_completed = True
    return me(user_id, session)


# ------------------------------------------------------------------ preferences

_PREF_FIELDS = (
    "task_granularity",
    "information_density",
    "plan_layout",
    "clarification_help",
    "communication_style",
    "time_estimates",
    "pacing_support",
)


def _prefs_out(row: m.UserPreferences | None) -> PreferencesOut:
    if row is None:
        return PreferencesOut()
    return PreferencesOut.model_validate(
        {
            **{f: getattr(row, f) for f in _PREF_FIELDS},
            "consentVersion": row.consent_version,
            "consentRecordedAt": row.consent_recorded_at,
            "isSet": row.is_set,
        }
    )


@router.get("/preferences", response_model=PreferencesOut, response_model_by_alias=True)
def get_preferences(user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")) -> PreferencesOut:
    return _prefs_out(session.get(m.UserPreferences, user_id))


def _apply_prefs(session: Session, user_id: uuid.UUID, patch: PreferencesPatch) -> PreferencesOut:
    row = session.get(m.UserPreferences, user_id)
    if row is None:
        row = m.UserPreferences(user_id=user_id)
        session.add(row)
    for f in _PREF_FIELDS:
        v = getattr(patch, f)
        if v is not None:
            setattr(row, f, v.value)
    row.is_set = True
    row.consent_version = CONSENT_VERSION
    row.consent_recorded_at = datetime.now(UTC)
    session.flush()
    log_event(session, user_id, "preferences_updated", "Working-style settings were updated.")
    return _prefs_out(row)


@router.patch("/preferences", response_model=PreferencesOut, response_model_by_alias=True)
def patch_preferences(
    body: PreferencesPatch, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")
) -> PreferencesOut:
    return _apply_prefs(session, user_id, body)


@router.post("/preferences/import", response_model=PreferencesOut, response_model_by_alias=True)
def import_preferences(
    body: PreferencesPatch, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")
) -> PreferencesOut:
    return _apply_prefs(session, user_id, body)


@router.get("/preferences/export", response_model=PreferencesOut, response_model_by_alias=True)
def export_preferences(user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")) -> PreferencesOut:
    return _prefs_out(session.get(m.UserPreferences, user_id))


@router.delete("/preferences", response_model=PreferencesOut, response_model_by_alias=True)
def reset_preferences(user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")) -> PreferencesOut:
    row = session.get(m.UserPreferences, user_id)
    if row is not None:
        session.delete(row)
        session.flush()
    log_event(session, user_id, "preferences_reset", "Working-style settings were reset to defaults.")
    return PreferencesOut()


# ------------------------------------------------------------------ captures


@router.post(
    "/captures",
    response_model=CaptureCreateResponse,
    response_model_by_alias=True,
    status_code=201,
    dependencies=[Depends(rate_limit("captures"))],
)
def post_capture(
    body: CaptureCreate,
    response: Response,
    principal: Principal = Depends(capture_writer),
    session: Session = Depends(get_session, scope="function"),
    settings: Settings = Depends(get_settings),
) -> CaptureCreateResponse:
    result = create_capture(session, principal.user_id, body, settings)
    if result.created:
        run = create_run(session, principal.user_id, result.workflow.id, AgentRunTrigger.CAPTURE)
        session.commit()  # persist BEFORE enqueueing so the worker can always load state
        try:
            get_queue().enqueue(run.id)
        except Exception:  # capture is saved regardless; user can press "Analyse" later
            pass
    else:
        response.status_code = 200
    return CaptureCreateResponse(
        capture=mappers.capture_out(result.capture, result.workflow.id),
        workflow=mappers.workflow_summary(result.workflow),
        next_url=f"/workflows/{result.workflow.id}",
        created=result.created,
    )


@router.get("/captures", response_model=list[CaptureOut], response_model_by_alias=True)
def list_captures(
    limit: int = Query(20, ge=1, le=100),
    user_id: uuid.UUID = Depends(web_user),
    session: Session = Depends(get_session, scope="function"),
) -> list[CaptureOut]:
    rows = session.scalars(
        select(m.Capture).where(m.Capture.user_id == user_id).order_by(m.Capture.created_at.desc()).limit(limit)
    ).all()
    wf_by_capture = {
        w.capture_id: w.id
        for w in session.scalars(select(m.Workflow).where(m.Workflow.user_id == user_id, m.Workflow.capture_id.in_([r.id for r in rows])))
    }
    return [mappers.capture_out(c, wf_by_capture.get(c.id)) for c in rows]


@router.get("/captures/{capture_id}", response_model=CaptureOut, response_model_by_alias=True)
def get_capture(capture_id: uuid.UUID, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")) -> CaptureOut:
    c = get_owned(session, m.Capture, capture_id, user_id, "Capture")
    wf = session.scalar(select(m.Workflow).where(m.Workflow.capture_id == c.id))
    return mappers.capture_out(c, wf.id if wf else None)


@router.delete("/captures/{capture_id}", response_model=DeletionResult, response_model_by_alias=True)
def remove_capture(capture_id: uuid.UUID, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")) -> DeletionResult:
    c = get_owned(session, m.Capture, capture_id, user_id, "Capture")
    return delete_capture(session, user_id, c)


@router.post(
    "/captures/{capture_id}/analyze",
    response_model=WorkflowSummary,
    response_model_by_alias=True,
    dependencies=[Depends(rate_limit("analyze"))],
)
def analyze_capture(capture_id: uuid.UUID, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")) -> WorkflowSummary:
    c = get_owned(session, m.Capture, capture_id, user_id, "Capture")
    wf = session.scalar(select(m.Workflow).where(m.Workflow.capture_id == c.id))
    if wf is None:
        raise conflict("This capture has no workflow.")
    # Idempotent: a workflow that already moved past `captured` (or has a live run) is returned as is.
    live = session.scalar(
        select(m.AgentRun).where(
            m.AgentRun.workflow_id == wf.id, m.AgentRun.status.in_(["waiting", "running"])
        )
    )
    if wf.status != WorkflowStatus.CAPTURED.value and wf.status != WorkflowStatus.FAILED.value or live:
        return mappers.workflow_summary(wf)
    run = create_run(session, user_id, wf.id, AgentRunTrigger.RESUME)
    session.commit()
    get_queue().enqueue(run.id)
    return mappers.workflow_summary(wf)


# ------------------------------------------------------------------ workflows


@router.get("/workflows", response_model=list[WorkflowSummary], response_model_by_alias=True)
def list_workflows(
    status: WorkflowStatus | None = None,
    user_id: uuid.UUID = Depends(web_user),
    session: Session = Depends(get_session, scope="function"),
) -> list[WorkflowSummary]:
    q = select(m.Workflow).where(m.Workflow.user_id == user_id)
    if status:
        q = q.where(m.Workflow.status == status.value)
    rows = session.scalars(q.order_by(m.Workflow.updated_at.desc()).limit(200)).all()
    return [mappers.workflow_summary(w) for w in rows]


def build_detail(session: Session, wf: m.Workflow) -> WorkflowDetail:
    capture = session.get(m.Capture, wf.capture_id) if wf.capture_id else None
    reqs = session.scalars(
        select(m.Requirement)
        .where(m.Requirement.workflow_id == wf.id, m.Requirement.rejected.is_(False))
        .order_by(m.Requirement.created_at, m.Requirement.id)
    ).all()
    qs = session.scalars(
        select(m.ClarificationQuestionRow)
        .where(m.ClarificationQuestionRow.workflow_id == wf.id)
        .order_by(m.ClarificationQuestionRow.created_at, m.ClarificationQuestionRow.id)
    ).all()
    plan = session.scalar(
        select(m.PlanVersion)
        .where(m.PlanVersion.workflow_id == wf.id, m.PlanVersion.status != "superseded")
        .order_by(m.PlanVersion.version.desc())
        .limit(1)
    )
    tasks = session.scalars(
        select(m.Task).where(m.Task.workflow_id == wf.id).order_by(m.Task.created_at, m.Task.title)
    ).all()
    actions = session.scalars(
        select(m.ProposedAction).where(m.ProposedAction.workflow_id == wf.id).order_by(m.ProposedAction.created_at.desc())
    ).all()

    sources: list[Citation] = []
    if capture:
        sources.append(
            Citation(
                source_id=str(capture.id),
                source_kind="capture",
                title=capture.source_page_title or capture.title or "Captured text",
                excerpt=capture.content_text[:300],
                location=capture.source_domain,
                source_date=capture.created_at,
            )
        )
    for raw in (wf.state_json or {}).get("citations", []):
        sources.append(Citation.model_validate(raw))

    open_qs = [q for q in qs if q.status == "open"]
    resume = ResumeCard(
        source_title=(capture.source_page_title or capture.title) if capture else None,
        source_url=capture.source_url if capture else None,
        user_note=capture.user_note if capture else None,
        status=WorkflowStatus(wf.status),
        last_completed_step=wf.current_step,
        next_action=wf.next_action,
        open_question_count=len(open_qs),
    )
    return WorkflowDetail(
        workflow=mappers.workflow_summary(wf),
        capture=mappers.capture_out(capture, wf.id) if capture else None,
        requirements=[mappers.requirement_item(r) for r in reqs],
        questions=[mappers.question_item(q) for q in qs],
        latest_plan=mappers.plan_out(plan) if plan else None,
        tasks=[mappers.task_out(session, t) for t in tasks],
        actions=[mappers.action_out(a) for a in actions],
        sources=sources,
        resume=resume,
    )


@router.get("/workflows/{workflow_id}", response_model=WorkflowDetail, response_model_by_alias=True)
def get_workflow_detail(workflow_id: uuid.UUID, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")) -> WorkflowDetail:
    return build_detail(session, get_workflow(session, workflow_id, user_id))


@router.patch("/workflows/{workflow_id}", response_model=WorkflowSummary, response_model_by_alias=True)
def patch_workflow(
    workflow_id: uuid.UUID,
    body: WorkflowPatch,
    user_id: uuid.UUID = Depends(web_user),
    session: Session = Depends(get_session, scope="function"),
) -> WorkflowSummary:
    wf = get_workflow(session, workflow_id, user_id)
    if body.version != wf.version:
        raise conflict("This workflow changed since you opened it. Reload to see the latest.")
    fields = body.model_fields_set - {"version"}
    if "title" in fields and body.title:
        wf.title = body.title
        wf.state_json = {**(wf.state_json or {}), "title_locked": True}  # re-analysis won't overwrite your title
    if "objective" in fields:
        wf.objective = body.objective
    if "next_action" in fields:
        wf.next_action = body.next_action
    if "confirmed_due_at" in fields:
        wf.confirmed_due_at = body.confirmed_due_at
    wf.version += 1
    session.flush()
    log_event(session, user_id, "workflow_edited", "You edited the workflow details.", workflow_id=wf.id)
    return mappers.workflow_summary(wf)


@router.delete("/workflows/{workflow_id}", response_model=DeletionResult, response_model_by_alias=True)
def remove_workflow(workflow_id: uuid.UUID, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")) -> DeletionResult:
    wf = get_workflow(session, workflow_id, user_id)
    removed = delete_workflow(session, user_id, wf)
    log_event(session, user_id, "workflow_deleted", "A workflow was deleted.")
    return DeletionResult(deleted=True, removed=removed)


def _set_paused(session: Session, user_id: uuid.UUID, workflow_id: uuid.UUID, paused: bool) -> WorkflowSummary:
    wf = get_workflow(session, workflow_id, user_id)
    if wf.paused != paused:  # idempotent
        wf.paused = paused
        wf.version += 1
        log_event(
            session, user_id, "workflow_paused" if paused else "workflow_resumed",
            "You paused this workflow." if paused else "You resumed this workflow.",
            workflow_id=wf.id,
        )
    return mappers.workflow_summary(wf)


@router.post("/workflows/{workflow_id}/pause", response_model=WorkflowSummary, response_model_by_alias=True)
def pause_workflow(workflow_id: uuid.UUID, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")) -> WorkflowSummary:
    return _set_paused(session, user_id, workflow_id, True)


@router.post("/workflows/{workflow_id}/resume", response_model=WorkflowSummary, response_model_by_alias=True)
def resume_workflow(workflow_id: uuid.UUID, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")) -> WorkflowSummary:
    return _set_paused(session, user_id, workflow_id, False)


@router.post("/workflows/{workflow_id}/cancel", response_model=WorkflowSummary, response_model_by_alias=True)
def cancel_workflow(workflow_id: uuid.UUID, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")) -> WorkflowSummary:
    wf = get_workflow(session, workflow_id, user_id)
    if wf.status != WorkflowStatus.CANCELLED.value:  # idempotent
        sm.assert_workflow(wf.status, WorkflowStatus.CANCELLED.value)
        wf.status = WorkflowStatus.CANCELLED.value
        wf.next_action = None
        wf.version += 1
        # Pending proposals can never run after a cancel.
        for a in session.scalars(
            select(m.ProposedAction).where(m.ProposedAction.workflow_id == wf.id, m.ProposedAction.status == "pending_approval")
        ):
            a.status = "cancelled"
        log_event(session, user_id, "workflow_cancelled", "You cancelled this workflow.", workflow_id=wf.id)
    return mappers.workflow_summary(wf)


# ------------------------------------------------------------------ activity


def _page(session: Session, q, limit: int, cursor: str | None) -> ActivityPage:
    if cursor:
        try:
            q = q.where(m.ActivityEvent.created_at < datetime.fromisoformat(cursor))
        except ValueError:
            pass
    rows = session.scalars(q.order_by(m.ActivityEvent.created_at.desc()).limit(limit + 1)).all()
    more = len(rows) > limit
    rows = rows[:limit]
    return ActivityPage(
        items=[mappers.event_out(e) for e in rows],
        next_cursor=rows[-1].created_at.isoformat() if more and rows else None,
    )


@router.get("/workflows/{workflow_id}/activity", response_model=ActivityPage, response_model_by_alias=True)
def workflow_activity(
    workflow_id: uuid.UUID,
    cursor: str | None = None,
    limit: int = Query(30, ge=1, le=100),
    user_id: uuid.UUID = Depends(web_user),
    session: Session = Depends(get_session, scope="function"),
) -> ActivityPage:
    wf = get_workflow(session, workflow_id, user_id)
    return _page(session, select(m.ActivityEvent).where(m.ActivityEvent.workflow_id == wf.id), limit, cursor)


@router.get("/activity", response_model=ActivityPage, response_model_by_alias=True)
def user_activity(
    cursor: str | None = None,
    limit: int = Query(30, ge=1, le=100),
    user_id: uuid.UUID = Depends(web_user),
    session: Session = Depends(get_session, scope="function"),
) -> ActivityPage:
    return _page(session, select(m.ActivityEvent).where(m.ActivityEvent.user_id == user_id), limit, cursor)
