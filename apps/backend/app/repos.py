"""Ownership-checked data access. Every read/write of user data goes through these helpers.

Ownership is enforced here (and in each query's `user_id` filter), not by hiding UI. Per spec §10:
absent → 404, present but someone else's → 403.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from .db.models import ActivityEvent, Workflow
from .errors import forbidden, not_found


def get_owned[M](session: Session, model: type[M], obj_id: Any, user_id: uuid.UUID, what: str = "Item") -> M:
    obj = session.get(model, obj_id)
    if obj is None:
        raise not_found(what)
    if getattr(obj, "user_id", None) != user_id:
        raise forbidden()
    return obj


def get_workflow(session: Session, workflow_id: uuid.UUID, user_id: uuid.UUID) -> Workflow:
    return get_owned(session, Workflow, workflow_id, user_id, "Workflow")


def log_event(
    session: Session,
    user_id: uuid.UUID,
    event_type: str,
    summary: str,
    *,
    workflow_id: uuid.UUID | None = None,
    details: dict[str, Any] | None = None,
) -> ActivityEvent:
    """Summaries only — no chain-of-thought and no raw source text in `details`."""
    ev = ActivityEvent(
        user_id=user_id, workflow_id=workflow_id, event_type=event_type, summary=summary, details_json=details
    )
    session.add(ev)
    return ev
