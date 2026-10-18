"""Domino Recovery — deterministic parts (spec §7 "What is code", §13.2 C).

Code computes the blast radius and validates what the model proposes. The model only suggests
re-scoped wording. Completed tasks are always preserved; dates come only from a user-confirmed value.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from ritme_contracts import ChangeType, ProposedChange, ReplanTrigger, TaskStatus, WorkflowPlanDraft
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import models as m

_CLOSED = {TaskStatus.DONE.value, TaskStatus.SKIPPED.value}


def draft_key(t: m.Task) -> str:
    """Stable handle the engine sees for an existing task."""
    return t.draft_id or str(t.id)


def blast_radius(
    session: Session,
    workflow_id: uuid.UUID,
    trigger: ReplanTrigger,
    *,
    changed_requirement_id: str | None,
    new_due_at: datetime | None,
) -> set[uuid.UUID]:
    """Open tasks affected by the change, plus everything that depends on them (transitively)."""
    tasks = session.scalars(select(m.Task).where(m.Task.workflow_id == workflow_id)).all()
    open_tasks = [t for t in tasks if t.status not in _CLOSED]
    if trigger == ReplanTrigger.COULD_NOT_WORK:
        return {t.id for t in open_tasks}  # replan all remaining work from now, no justification needed

    direct: set[uuid.UUID] = set()
    for t in open_tasks:
        if changed_requirement_id and changed_requirement_id in (t.requirement_ids_json or []):
            direct.add(t.id)
        if new_due_at is not None and (t.due_at is None or t.due_at > new_due_at):
            direct.add(t.id)

    dependents: dict[uuid.UUID, set[uuid.UUID]] = {}
    for dep in session.scalars(select(m.TaskDependency).where(m.TaskDependency.task_id.in_([t.id for t in tasks] or [uuid.uuid4()]))):
        dependents.setdefault(dep.depends_on_id, set()).add(dep.task_id)
    open_ids = {t.id for t in open_tasks}
    radius = set(direct)
    frontier = list(direct)
    while frontier:
        for nxt in dependents.get(frontier.pop(), ()):
            if nxt in open_ids and nxt not in radius:
                radius.add(nxt)
                frontier.append(nxt)
    return radius


_FIELDS = {
    "title": ("title", lambda t: t.title),
    "description": ("description", lambda t: t.description),
    "definitionOfDone": ("definition_of_done", lambda t: t.definition_of_done),
    "estimatedMinutes": ("estimated_minutes", lambda t: t.estimated_minutes),
    "dueAt": ("due_at", lambda t: t.due_at.isoformat() if t.due_at else None),
}


def _same_instant(a: str | None, b: str | None) -> bool:
    if a == b:
        return True
    if not a or not b:
        return False
    return datetime.fromisoformat(a.replace("Z", "+00:00")) == datetime.fromisoformat(b.replace("Z", "+00:00"))


def _date_allowed(new: str | None, existing: str | None, confirmed: datetime | None) -> bool:
    """A due date may only be cleared, kept, or set on/before a deadline the user confirmed. Never invented."""
    if new is None or _same_instant(new, existing):
        return True
    return confirmed is not None and datetime.fromisoformat(new.replace("Z", "+00:00")) <= confirmed


def build_change_set(
    session: Session,
    workflow_id: uuid.UUID,
    proposal: WorkflowPlanDraft,
    radius: set[uuid.UUID],
    *,
    confirmed_due_at: datetime | None,
) -> tuple[dict[str, Any], list[ProposedChange]]:
    """Validate the model's proposal into an update_tasks payload + a readable Before/After diff."""
    existing = {draft_key(t): t for t in session.scalars(select(m.Task).where(m.Task.workflow_id == workflow_id))}
    seen: set[str] = set()
    updates: list[dict[str, Any]] = []
    creates: list[dict[str, Any]] = []
    diff: list[ProposedChange] = []

    for d in proposal.tasks:
        raw = d.model_dump(by_alias=True)
        task = existing.get(d.draft_id)
        if task is None:
            creates.append({k: raw.get(k) for k in ("draftId", "title", "description", "definitionOfDone", "estimatedMinutes", "dueAt", "dependsOnDraftIds", "requirementIds")})
            if not _date_allowed(raw.get("dueAt"), None, confirmed_due_at):
                creates[-1]["dueAt"] = None
            diff.append(ProposedChange(change_type=ChangeType.CREATE, after={"title": d.title, "definitionOfDone": d.definition_of_done}, reason=d.rationale or "New step needed after the change."))
            continue
        seen.add(d.draft_id)
        if task.status in _CLOSED or task.id not in radius:
            diff.append(ProposedChange(existing_task_id=str(task.id), change_type=ChangeType.KEEP, reason="Not affected by the change." if task.status not in _CLOSED else "Already finished — kept as is."))
            continue
        before: dict[str, Any] = {}
        after: dict[str, Any] = {}
        changes: dict[str, Any] = {}
        for key, (_, getter) in _FIELDS.items():
            new = raw.get(key)
            old = getter(task)
            if key == "dueAt":
                if not _date_allowed(new, old, confirmed_due_at) or _same_instant(new, old):
                    continue
            elif new == old or new is None:
                continue
            before[key], after[key], changes[key] = old, new, new
        if changes:
            updates.append({"taskId": str(task.id), "changes": changes})
            diff.append(ProposedChange(existing_task_id=str(task.id), change_type=ChangeType.UPDATE, before=before, after=after, reason=d.rationale or "Adjusted to fit the change."))
        else:
            diff.append(ProposedChange(existing_task_id=str(task.id), change_type=ChangeType.KEEP, reason="Still fits after the change."))

    # Affected open tasks the model left out are set aside (skipped), never deleted.
    for key, task in existing.items():
        if key not in seen and task.id in radius and task.status not in _CLOSED:
            updates.append({"taskId": str(task.id), "changes": {"status": TaskStatus.SKIPPED.value}})
            diff.append(ProposedChange(existing_task_id=str(task.id), change_type=ChangeType.UPDATE, before={"status": task.status}, after={"status": TaskStatus.SKIPPED.value}, reason="No longer needed after the change. It stays in your history."))

    payload: dict[str, Any] = {"updates": updates, "creates": creates}
    return payload, diff
