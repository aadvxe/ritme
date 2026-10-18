"""Allowlisted write tools: create_tasks / update_tasks, each with read-after-write verification.

The model never calls these. Code builds the payload from an approved plan; server-side schema
validation and ownership checks decide acceptance (spec §8.5, §11).

Idempotency: task ids are derived deterministically from (action id, draft id) and a unique
constraint on (created_by_action_id, draft_id) backs it, so executing twice can never duplicate.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from ritme_contracts import TaskStatus
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from ..db import models as m
from ..errors import invalid_action

NAMESPACE = uuid.UUID("6f0d1b52-3f3a-4f7e-9d1e-0c5b2a7f9a11")


def task_id_for(action_id: uuid.UUID, draft_id: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, f"{action_id}:{draft_id}")


def _dt(v: Any) -> datetime | None:
    if v in (None, ""):
        return None
    return v if isinstance(v, datetime) else datetime.fromisoformat(str(v).replace("Z", "+00:00"))


@dataclass
class ToolResult:
    ids: list[str] = field(default_factory=list)
    summary: str = ""


# ------------------------------------------------------------------ create


def validate_create_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    tasks = payload.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        raise invalid_action("There are no tasks to create.")
    ids = [t.get("draftId") for t in tasks]
    if any(not i for i in ids) or len(set(ids)) != len(ids):
        raise invalid_action("Every task needs a unique id.")
    for t in tasks:
        if not str(t.get("title", "")).strip() or not str(t.get("definitionOfDone", "")).strip():
            raise invalid_action("Every task needs a title and a definition of done.")
        for d in t.get("dependsOnDraftIds", []):
            if d not in ids:
                raise invalid_action("A task depends on a task that is not in this plan.")
    return tasks


def create_tasks(session: Session, user_id: uuid.UUID, action: m.ProposedAction) -> ToolResult:
    tasks = validate_create_payload(action.payload_json)
    created = _insert_tasks(session, user_id, action, tasks)
    return ToolResult(ids=[str(i) for i in created], summary=f"Created {len(created)} task(s).")


def _insert_tasks(
    session: Session, user_id: uuid.UUID, action: m.ProposedAction, tasks: list[dict[str, Any]]
) -> list[uuid.UUID]:
    mapping = {t["draftId"]: task_id_for(action.id, t["draftId"]) for t in tasks}
    for t in tasks:
        stmt = (
            pg_insert(m.Task)
            .values(
                id=mapping[t["draftId"]],
                user_id=user_id,
                workflow_id=action.workflow_id,
                plan_version_id=action.plan_version_id,
                draft_id=t["draftId"],
                title=t["title"][:200],
                description=t.get("description", ""),
                definition_of_done=t["definitionOfDone"],
                status=TaskStatus.TODO.value,
                estimated_minutes=t.get("estimatedMinutes"),
                due_at=_dt(t.get("dueAt")),
                requirement_ids_json=list(t.get("requirementIds", [])),
                created_by_action_id=action.id,
            )
            .on_conflict_do_nothing(constraint="uq_tasks_action_draft")
        )
        session.execute(stmt)
    for t in tasks:
        for dep in t.get("dependsOnDraftIds", []):
            session.execute(
                pg_insert(m.TaskDependency)
                .values(task_id=mapping[t["draftId"]], depends_on_id=mapping[dep])
                .on_conflict_do_nothing()
            )
    return list(mapping.values())


# ------------------------------------------------------------------ update


def validate_update_payload(session: Session, user_id: uuid.UUID, workflow_id: uuid.UUID, payload: dict[str, Any]) -> None:
    updates = payload.get("updates", [])
    creates = payload.get("creates", [])
    if not updates and not creates:
        raise invalid_action("There is nothing to change.")
    if creates:
        validate_create_payload({"tasks": creates})
    for u in updates:
        task = session.get(m.Task, uuid.UUID(str(u["taskId"])))
        if task is None or task.user_id != user_id or task.workflow_id != workflow_id:
            raise invalid_action("A task in this change does not belong to this workflow.")
        if task.status == TaskStatus.DONE.value:
            raise invalid_action("Completed tasks are kept as they are.")


def update_tasks(session: Session, user_id: uuid.UUID, action: m.ProposedAction) -> ToolResult:
    payload = action.payload_json
    validate_update_payload(session, user_id, action.workflow_id, payload)
    touched: list[str] = []
    for u in payload.get("updates", []):
        task = session.get(m.Task, uuid.UUID(str(u["taskId"])))
        assert task is not None
        ch = u.get("changes", {})
        if "title" in ch:
            task.title = str(ch["title"])[:200]
        if "description" in ch:
            task.description = str(ch["description"])
        if "definitionOfDone" in ch:
            task.definition_of_done = str(ch["definitionOfDone"])
        if "estimatedMinutes" in ch:
            task.estimated_minutes = ch["estimatedMinutes"]
        if "dueAt" in ch:
            task.due_at = _dt(ch["dueAt"])
        if "status" in ch:
            task.status = str(ch["status"])
        touched.append(str(task.id))
    created = _insert_tasks(session, user_id, action, payload["creates"]) if payload.get("creates") else []
    wf_changes = payload.get("workflowChanges") or {}
    if "confirmedDueAt" in wf_changes:
        wf = session.get(m.Workflow, action.workflow_id)
        if wf is not None:
            wf.confirmed_due_at = _dt(wf_changes["confirmedDueAt"])
    rc = payload.get("requirementChange")
    if rc:
        req = session.get(m.Requirement, (action.workflow_id, rc["id"]))
        if req is not None:
            req.text = str(rc["text"])
            req.edited_by_user = True
            req.user_confirmed_at = datetime.now().astimezone()
    return ToolResult(
        ids=touched + [str(i) for i in created],
        summary=f"Updated {len(touched)} task(s) and created {len(created)}.",
    )


# ------------------------------------------------------------------ verification (fresh read)


@dataclass
class Verification:
    ok: bool
    detail: str


def verify_create(session: Session, action: m.ProposedAction, expected_ids: list[str]) -> Verification:
    """`session` must be a FRESH session opened after the write transaction committed."""
    tasks = validate_create_payload(action.payload_json)
    return _verify_creates(session, action, tasks, expected_ids)


def _verify_creates(session: Session, action: m.ProposedAction, tasks: list[dict[str, Any]], expected_ids: list[str]) -> Verification:
    rows = {
        t.draft_id: t
        for t in session.scalars(select(m.Task).where(m.Task.created_by_action_id == action.id)).all()
    }
    if len(rows) != len(tasks):
        return Verification(False, f"Found {len(rows)} of {len(tasks)} expected tasks.")
    for t in tasks:
        row = rows.get(t["draftId"])
        if row is None or str(row.id) not in expected_ids:
            return Verification(False, f"Task '{t['title']}' was not found.")
        if row.title != t["title"][:200] or row.definition_of_done != t["definitionOfDone"]:
            return Verification(False, f"Task '{t['title']}' was stored differently than approved.")
        if row.due_at != _dt(t.get("dueAt")) or row.estimated_minutes != t.get("estimatedMinutes"):
            return Verification(False, f"Task '{t['title']}' has a different date or estimate than approved.")
        want = {rows[d].id for d in t.get("dependsOnDraftIds", []) if d in rows}
        have = set(session.scalars(select(m.TaskDependency.depends_on_id).where(m.TaskDependency.task_id == row.id)))
        if want != have:
            return Verification(False, f"Task '{t['title']}' has different dependencies than approved.")
    return Verification(True, f"{len(tasks)} task(s) found and matching.")


def verify_update(session: Session, action: m.ProposedAction, expected_ids: list[str]) -> Verification:
    payload = action.payload_json
    for u in payload.get("updates", []):
        task = session.get(m.Task, uuid.UUID(str(u["taskId"])))
        if task is None:
            return Verification(False, "An updated task could not be found.")
        ch = u.get("changes", {})
        stored = {
            "title": task.title,
            "description": task.description,
            "definitionOfDone": task.definition_of_done,
            "estimatedMinutes": task.estimated_minutes,
            "dueAt": task.due_at,
            "status": task.status,
        }
        approved = {
            "title": str(ch["title"])[:200] if "title" in ch else None,
            "description": str(ch["description"]) if "description" in ch else None,
            "definitionOfDone": str(ch["definitionOfDone"]) if "definitionOfDone" in ch else None,
            "estimatedMinutes": ch.get("estimatedMinutes"),
            "dueAt": _dt(ch["dueAt"]) if "dueAt" in ch else None,
            "status": str(ch["status"]) if "status" in ch else None,
        }
        for key, want in approved.items():
            if key in ch and stored[key] != want:
                return Verification(False, f"'{task.title}' does not match the approved {key}.")
    if payload.get("creates"):
        res = _verify_creates(session, action, payload["creates"], expected_ids)
        if not res.ok:
            return res
    wf_changes = payload.get("workflowChanges") or {}
    if "confirmedDueAt" in wf_changes:
        wf = session.get(m.Workflow, action.workflow_id)
        if wf is None or wf.confirmed_due_at != _dt(wf_changes["confirmedDueAt"]):
            return Verification(False, "The confirmed deadline does not match what you approved.")
    rc = payload.get("requirementChange")
    if rc:
        req = session.get(m.Requirement, (action.workflow_id, rc["id"]))
        if req is None or req.text != str(rc["text"]):
            return Verification(False, "The changed requirement does not match what you approved.")
    return Verification(True, "All approved changes were found in the stored tasks.")
