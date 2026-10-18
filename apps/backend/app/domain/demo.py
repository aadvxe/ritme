"""Clearly labelled seeded demo (spec §16). No external accounts needed; clearly marked as demo data."""

from __future__ import annotations

import uuid

from ritme_contracts import CaptureSourceType, KnowledgeDocCreate, KnowledgeSourceType
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import models as m
from ..repos import log_event
from . import knowledge
from .deletion import delete_capture

DEMO_KEY = "demo-seed-v1"
DEMO_TITLE = "Demo: proposal request from your manager"

DEMO_CAPTURE = (
    "Hi! Can you get the proposal over the line by Friday? "
    "Let's make sure everyone is aligned before we send it."
)

DEMO_DOC_TITLE = "Intern Onboarding Doc (demo document)"
DEMO_DOC = """# Intern onboarding guide (demo document)

This is demo content included with Ritme so you can try the app without connecting anything.

## Client documents

All client-facing decks and proposals need a 48-hour peer review before they are sent to the client.
Ask one teammate who did not write the document to review it, and keep their comments in the shared folder.

## Brief summaries

A "brief summary" means one page: the goal, the three key points, and the decision you need from the reader.

## Approvals

Proposals are approved by the team lead. If you are not sure who the approver is, ask before sending.
"""


def reset_demo(session: Session, user_id: uuid.UUID) -> m.Workflow:
    # Remove any previous demo capture (and the workflow derived from it) and the seed document.
    for cap in session.scalars(
        select(m.Capture).where(m.Capture.user_id == user_id, m.Capture.source_type == CaptureSourceType.SEED_DEMO.value)
    ).all():
        delete_capture(session, user_id, cap)
    for doc in session.scalars(select(m.KnowledgeDocument).where(m.KnowledgeDocument.user_id == user_id, m.KnowledgeDocument.is_seed.is_(True))).all():
        session.delete(doc)
    session.flush()

    knowledge.add_document(
        session, user_id,
        KnowledgeDocCreate(title=DEMO_DOC_TITLE, content=DEMO_DOC, source_type=KnowledgeSourceType.SEED_DEMO),
        is_seed=True,
    )
    cap = m.Capture(
        user_id=user_id, source_type=CaptureSourceType.SEED_DEMO.value, title=DEMO_TITLE,
        content_text=DEMO_CAPTURE, user_note="Demo data — not from a real conversation.",
        source_page_title="Demo message", status="submitted", idempotency_key=DEMO_KEY,
    )
    session.add(cap)
    session.flush()
    wf = m.Workflow(
        user_id=user_id, capture_id=cap.id, title=DEMO_TITLE, status="captured", is_demo=True,
        current_step="Demo saved — not analysed yet", next_action="Analysis will start shortly.",
    )
    session.add(wf)
    session.flush()
    log_event(session, user_id, "demo_created", "Added the labelled demo workflow and demo document.", workflow_id=wf.id)
    return wf
