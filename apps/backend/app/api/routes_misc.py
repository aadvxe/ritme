"""Dashboard, calendar overview, Context Library, privacy, demo."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from ritme_contracts import (
    AgentRunTrigger,
    CalendarOverview,
    DashboardOut,
    DeletionResult,
    KnowledgeDocCreate,
    KnowledgeDocOut,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
    NeedsApprovalItem,
    NeedsInputItem,
    NextBestStep,
    PrivacyOverview,
    WorkflowSummary,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import mappers
from ..auth.deps import rate_limit, web_user
from ..config import Settings, get_settings
from ..db import models as m
from ..db.session import get_session
from ..domain import calendar as cal
from ..domain import demo, knowledge
from ..domain.deletion import delete_all_user_data
from ..errors import invalid_input
from ..queue import create_run, get_queue
from ..repos import get_owned, log_event

router = APIRouter()

_ACTIVE = ("captured", "analyzing", "needs_input", "planning", "ready_for_approval", "in_progress", "blocked", "failed")

# ------------------------------------------------------------------ dashboard


@router.get("/dashboard", response_model=DashboardOut, response_model_by_alias=True)
def dashboard(user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session)) -> DashboardOut:
    wfs = session.scalars(
        select(m.Workflow).where(m.Workflow.user_id == user_id, m.Workflow.status.in_(_ACTIVE)).order_by(m.Workflow.updated_at.desc()).limit(12)
    ).all()
    titles = {w.id: w.title for w in wfs}

    needs_input: list[NeedsInputItem] = []
    for w in wfs:
        if w.status == "needs_input":
            q = session.scalar(
                select(m.ClarificationQuestionRow).where(
                    m.ClarificationQuestionRow.workflow_id == w.id, m.ClarificationQuestionRow.status == "open", m.ClarificationQuestionRow.blocking.is_(True)
                ).order_by(m.ClarificationQuestionRow.created_at, m.ClarificationQuestionRow.id).limit(1)
            )
            if q:
                needs_input.append(NeedsInputItem(workflow_id=w.id, workflow_title=w.title, question_id=q.id, question=q.question))

    pending = session.scalars(
        select(m.ProposedAction).where(m.ProposedAction.user_id == user_id, m.ProposedAction.status == "pending_approval").order_by(m.ProposedAction.created_at.desc())
    ).all()
    wf_titles = {**titles, **{w.id: w.title for w in session.scalars(select(m.Workflow).where(m.Workflow.id.in_([a.workflow_id for a in pending] or [uuid.uuid4()])))}}
    needs_approval = [
        NeedsApprovalItem(action_id=a.id, workflow_id=a.workflow_id, workflow_title=wf_titles.get(a.workflow_id, ""), summary=a.reason_summary)
        for a in pending
    ]

    next_step: NextBestStep | None = None
    if needs_approval:
        n = needs_approval[0]
        next_step = NextBestStep(workflow_id=n.workflow_id, workflow_title=n.workflow_title, text="Review and approve the proposed plan.")
    elif needs_input:
        n2 = needs_input[0]
        next_step = NextBestStep(workflow_id=n2.workflow_id, workflow_title=n2.workflow_title, text=n2.question)
    else:
        w = next((w for w in wfs if w.status == "in_progress" and w.next_action and not w.paused), None)
        if w:
            next_step = NextBestStep(workflow_id=w.id, workflow_title=w.title, text=w.next_action or "")

    caps = session.scalars(select(m.Capture).where(m.Capture.user_id == user_id).order_by(m.Capture.created_at.desc()).limit(5)).all()
    wf_by_cap = {w.capture_id: w.id for w in session.scalars(select(m.Workflow).where(m.Workflow.capture_id.in_([c.id for c in caps] or [uuid.uuid4()])))}
    events = session.scalars(select(m.ActivityEvent).where(m.ActivityEvent.user_id == user_id).order_by(m.ActivityEvent.created_at.desc()).limit(10)).all()
    return DashboardOut(
        next_best_step=next_step,
        active_workflows=[mappers.workflow_summary(w) for w in wfs],
        needs_input=needs_input,
        needs_approval=needs_approval,
        recent_captures=[mappers.capture_out(c, wf_by_cap.get(c.id)) for c in caps],
        recent_activity=[mappers.event_out(e) for e in events],
    )


@router.get("/calendar-overview", response_model=CalendarOverview, response_model_by_alias=True)
def calendar_overview(
    from_: datetime = Query(alias="from"), to: datetime = Query(),
    user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session),
) -> CalendarOverview:
    if from_.tzinfo is None or to.tzinfo is None:
        raise invalid_input("Dates need a time zone, for example 2026-10-18T00:00:00Z.")
    return cal.overview(session, user_id, from_, to)


# ------------------------------------------------------------------ Context Library


@router.post("/knowledge/documents", response_model=KnowledgeDocOut, response_model_by_alias=True, status_code=201)
def add_knowledge(body: KnowledgeDocCreate, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session)) -> KnowledgeDocOut:
    return knowledge.add_document(session, user_id, body)


@router.get("/knowledge/documents", response_model=list[KnowledgeDocOut], response_model_by_alias=True)
def list_knowledge(user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session)) -> list[KnowledgeDocOut]:
    return knowledge.list_documents(session, user_id)


@router.delete("/knowledge/documents/{doc_id}", response_model=DeletionResult, response_model_by_alias=True)
def delete_knowledge(doc_id: uuid.UUID, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session)) -> DeletionResult:
    doc = get_owned(session, m.KnowledgeDocument, doc_id, user_id, "Document")
    chunks = session.scalar(select(func.count()).select_from(m.KnowledgeChunk).where(m.KnowledgeChunk.document_id == doc.id)) or 0
    session.delete(doc)  # chunks cascade
    session.flush()
    log_event(session, user_id, "knowledge_deleted", "A document was removed from your Context Library.")
    return DeletionResult(deleted=True, removed={"documents": 1, "chunks": chunks})


@router.post("/knowledge/search", response_model=KnowledgeSearchResponse, response_model_by_alias=True, dependencies=[Depends(rate_limit("search"))])
def search_knowledge(body: KnowledgeSearchRequest, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session)) -> KnowledgeSearchResponse:
    return KnowledgeSearchResponse(results=knowledge.search(session, user_id, body.query, body.document_ids))


# ------------------------------------------------------------------ privacy


@router.get("/privacy", response_model=PrivacyOverview, response_model_by_alias=True)
def privacy(user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session), settings: Settings = Depends(get_settings)) -> PrivacyOverview:
    def count(model: type) -> int:
        return session.scalar(select(func.count()).select_from(model).where(model.user_id == user_id)) or 0  # type: ignore[attr-defined]

    live = settings.llm_provider == "vertex"
    return PrivacyOverview(
        captures_count=count(m.Capture),
        workflows_count=count(m.Workflow),
        tasks_count=count(m.Task),
        knowledge_documents_count=count(m.KnowledgeDocument),
        model_provider="Google Vertex AI (Gemini)" if live else "Local test model (nothing leaves this computer)",
        model_processing_note=(
            f"Text you choose to save is sent to Google Vertex AI (processing location: {settings.vertex_location}) "
            "only to read it and draft plans. Ritme does not use your content to train models, and nothing is shown to employers."
            if live
            else "This copy of Ritme is running with a local test model, so your text is not sent to any AI provider."
        ),
        log_retention_note="Server logs contain request IDs, routes and status codes only — never your text, notes or preferences.",
    )


@router.get("/privacy/export")
def export_all(user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session)) -> dict[str, Any]:
    """Everything Ritme stores about you, as JSON."""
    from .routes_core import _prefs_out, build_detail  # noqa: PLC0415

    wfs = session.scalars(select(m.Workflow).where(m.Workflow.user_id == user_id)).all()
    caps = session.scalars(select(m.Capture).where(m.Capture.user_id == user_id)).all()
    docs = session.scalars(select(m.KnowledgeDocument).where(m.KnowledgeDocument.user_id == user_id)).all()
    events = session.scalars(select(m.ActivityEvent).where(m.ActivityEvent.user_id == user_id).order_by(m.ActivityEvent.created_at)).all()
    def dump(model: Any) -> Any:
        return model.model_dump(by_alias=True, mode="json")

    return {
        "exportedAt": datetime.now().astimezone().isoformat(),
        "preferences": dump(_prefs_out(session.get(m.UserPreferences, user_id))),
        "captures": [dump(mappers.capture_out(c)) for c in caps],
        "workflows": [dump(build_detail(session, w)) for w in wfs],
        "knowledgeDocuments": [{"id": str(d.id), "title": d.title, "sourceType": d.source_type, "content": d.content_text, "isSeed": d.is_seed} for d in docs],
        "activity": [dump(mappers.event_out(e)) for e in events],
    }


@router.delete("/privacy/account", response_model=DeletionResult, response_model_by_alias=True)
def delete_account_data(user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session)) -> DeletionResult:
    return delete_all_user_data(session, user_id)


# ------------------------------------------------------------------ demo


@router.post("/demo/reset", response_model=WorkflowSummary, response_model_by_alias=True, status_code=201)
def reset_demo(user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session)) -> WorkflowSummary:
    wf = demo.reset_demo(session, user_id)
    run = create_run(session, user_id, wf.id, AgentRunTrigger.CAPTURE)
    summary = mappers.workflow_summary(wf)
    session.commit()
    try:
        get_queue().enqueue(run.id)
    except Exception:
        pass
    return summary
