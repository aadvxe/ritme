"""Capture creation: idempotent, user-bound, creates a workflow, never claims analysis finished."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from urllib.parse import urlparse

from ritme_contracts import CaptureCreate, CaptureStatus, WorkflowStatus
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import Settings
from ..db.models import Capture, Workflow
from ..errors import invalid_input, too_large
from ..repos import log_event


@dataclass
class CaptureResult:
    capture: Capture
    workflow: Workflow
    created: bool


def _title_from(body: CaptureCreate) -> str:
    if body.title:
        return body.title[:160]
    first = next((ln.strip() for ln in body.content_text.splitlines() if ln.strip()), "")
    return (first[:77] + "…") if len(first) > 80 else (first or "Untitled capture")


def _domain(body: CaptureCreate) -> str | None:
    if body.source_domain:
        return body.source_domain
    if body.source_url:
        return urlparse(body.source_url).hostname
    return None


def create_capture(
    session: Session, user_id: uuid.UUID, body: CaptureCreate, settings: Settings
) -> CaptureResult:
    if len(body.content_text) > settings.max_capture_chars:
        # Reject rather than silently truncate (spec §11).
        raise too_large(f"Captures can be up to {settings.max_capture_chars} characters.")
    if not body.content_text.strip():
        raise invalid_input("There is no text to save.")

    existing = _find(session, user_id, body.idempotency_key)
    if existing:
        return existing

    capture = Capture(
        user_id=user_id,
        source_type=body.source_type.value,
        title=body.title,
        content_text=body.content_text,
        user_note=body.user_note,
        source_url=body.source_url,  # None when the user removed it in the preview
        source_domain=_domain(body) if body.source_url or body.source_domain else None,
        source_page_title=body.source_page_title,
        status=CaptureStatus.SUBMITTED.value,
        idempotency_key=body.idempotency_key,
    )
    workflow = Workflow(
        user_id=user_id,
        title=_title_from(body),
        status=WorkflowStatus.CAPTURED.value,
        current_step="Saved — not analysed yet",
        next_action="Analysis will start shortly.",
    )
    try:
        with session.begin_nested():
            session.add(capture)
            session.flush()
            workflow.capture_id = capture.id
            session.add(workflow)
            session.flush()
            log_event(
                session,
                user_id,
                "capture_saved",
                "Capture saved. Nothing has been analysed yet.",
                workflow_id=workflow.id,
                details={"captureId": str(capture.id)},
            )
    except IntegrityError:
        # Concurrent retry with the same idempotency key won the race.
        existing = _find(session, user_id, body.idempotency_key)
        if existing:
            return existing
        raise
    return CaptureResult(capture, workflow, True)


def _find(session: Session, user_id: uuid.UUID, key: str) -> CaptureResult | None:
    capture = session.scalar(
        select(Capture).where(Capture.user_id == user_id, Capture.idempotency_key == key)
    )
    if capture is None:
        return None
    workflow = session.scalar(select(Workflow).where(Workflow.capture_id == capture.id))
    if workflow is None:
        return None
    return CaptureResult(capture, workflow, False)
