"""User-driven deletion. Derived content is removed with its source (spec §9, §11).

Documented behaviour: deleting a capture also deletes the workflow built from it (requirements,
questions, plans, proposed actions, tasks and the workflow's activity events). A single minimal
audit event ("capture deleted", no title/text) is kept so the user's own timeline stays coherent.
"""

from __future__ import annotations

import uuid

from ritme_contracts import DeletionResult
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..db import models as m
from ..repos import log_event


def _count(session: Session, model: type, *where) -> int:
    return session.scalar(select(func.count()).select_from(model).where(*where)) or 0


def delete_workflow(session: Session, user_id: uuid.UUID, wf: m.Workflow) -> dict[str, int]:
    removed = {
        "tasks": _count(session, m.Task, m.Task.workflow_id == wf.id),
        "requirements": _count(session, m.Requirement, m.Requirement.workflow_id == wf.id),
        "plans": _count(session, m.PlanVersion, m.PlanVersion.workflow_id == wf.id),
        "actions": _count(session, m.ProposedAction, m.ProposedAction.workflow_id == wf.id),
        "workflows": 1,
    }
    session.delete(wf)  # FK ON DELETE CASCADE removes children
    session.flush()
    return removed


def delete_capture(session: Session, user_id: uuid.UUID, capture: m.Capture) -> DeletionResult:
    removed: dict[str, int] = {"captures": 1}
    for wf in session.scalars(select(m.Workflow).where(m.Workflow.capture_id == capture.id)).all():
        for k, v in delete_workflow(session, user_id, wf).items():
            removed[k] = removed.get(k, 0) + v
    session.delete(capture)
    session.flush()
    log_event(session, user_id, "capture_deleted", "A capture and what was derived from it were deleted.")
    return DeletionResult(deleted=True, removed=removed)


def delete_all_user_data(session: Session, user_id: uuid.UUID) -> DeletionResult:
    """Delete everything the user owns, including the account row. Returns what was removed."""
    removed = {
        "captures": _count(session, m.Capture, m.Capture.user_id == user_id),
        "workflows": _count(session, m.Workflow, m.Workflow.user_id == user_id),
        "tasks": _count(session, m.Task, m.Task.user_id == user_id),
        "knowledgeDocuments": _count(session, m.KnowledgeDocument, m.KnowledgeDocument.user_id == user_id),
    }
    # Users cascade to every owned table (FKs are ON DELETE CASCADE).
    session.execute(delete(m.User).where(m.User.id == user_id))
    session.flush()
    return DeletionResult(deleted=True, removed=removed)
