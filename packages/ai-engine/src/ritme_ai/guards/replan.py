"""Domino Recovery guards (spec §8.4, F32).

Code decides what may change: only tasks in the code-computed blast radius can be updated; completed
or skipped tasks are always preserved verbatim; tasks the model omitted are kept. The Before/After
diff (`proposed_changes`) is built here from real differences, with the model supplying reasons.
"""

from __future__ import annotations

import re
from typing import NamedTuple

from ritme_contracts import (
    ChangeType,
    PlanTaskDraft,
    ProposedChange,
    ReplanInput,
    ReplanTrigger,
    TaskStatus,
    WorkflowPlanDraft,
)

from ..schemas import ReplanModelOutput
from .graph import topological_order
from .plan import allowed_due_dates, finalize_tasks, merge_unresolved

_FROZEN = {TaskStatus.DONE, TaskStatus.SKIPPED}
_GUILT = re.compile(
    r"\b(?:overdue|late|missed|behind|failed|failure|fault|should\s+have|unfortunately|"
    r"your\s+mistake|slipped|delinquent|excuse)\b",
    re.IGNORECASE,
)


class ChangeReasonLite(NamedTuple):
    kind: ChangeType
    reason: str


_TRACKED = (
    "title",
    "description",
    "definition_of_done",
    "estimated_minutes",
    "due_at",
    "depends_on_draft_ids",
)


def _default_reason(kind: ChangeType, trigger: ReplanTrigger) -> str:
    if kind is ChangeType.KEEP:
        return "Not affected by this change."
    if kind is ChangeType.CREATE:
        return "Added to cover the change."
    if kind is ChangeType.MARK_BLOCKED:
        return "Paused until you are ready to pick it back up."
    if trigger is ReplanTrigger.REQUEST_CHANGED:
        return "Updated to match the changed request."
    return "Adjusted for now; nothing is lost."


def _reason(text: str | None, kind: ChangeType, trigger: ReplanTrigger) -> str:
    if not text or _GUILT.search(text):
        return _default_reason(kind, trigger)  # calm wording only: no guilt, no "overdue"
    return text.strip()


def _snapshot(task: PlanTaskDraft, fields: tuple[str, ...] = _TRACKED) -> dict[str, object]:
    return {f: getattr(task, f) for f in fields}


def apply_replan_guards(out: ReplanModelOutput, inp: ReplanInput) -> WorkflowPlanDraft:
    current = {t.draft_id: t for t in inp.current_plan.tasks}
    existing_by_draft = {t.draft_id: t for t in inp.existing_tasks if t.draft_id}
    existing_by_id = {t.id: t for t in inp.existing_tasks}
    blast = set(inp.blast_radius_task_ids)

    def frozen(draft_id: str) -> bool:
        e = existing_by_draft.get(draft_id)
        return e is not None and e.status in _FROZEN

    def may_change(draft_id: str) -> bool:
        e = existing_by_draft.get(draft_id)
        return e is None or (e.id in blast and e.status not in _FROZEN)

    model_by_id = {t.draft_id: t for t in out.tasks}
    allowed = allowed_due_dates(inp, extra=[inp.new_due_at or ""])
    unchanged_due = {d: t.due_at for d, t in current.items()}

    changed_or_new = [
        t
        for t in out.tasks
        if (t.draft_id not in current) or (may_change(t.draft_id) and not frozen(t.draft_id))
    ]
    all_ids = set(current) | set(model_by_id)
    cleaned, notes = finalize_tasks(
        changed_or_new, inp, allowed=allowed, unchanged_due=unchanged_due, known_ids=all_ids
    )
    cleaned_by_id = {t.draft_id: t for t in cleaned}

    final: list[PlanTaskDraft] = []
    for draft_id, old in current.items():
        if draft_id in cleaned_by_id and draft_id in model_by_id:
            final.append(cleaned_by_id[draft_id])
        else:
            final.append(old)  # completed, outside the blast radius, or omitted by the model
    final.extend(t for t in cleaned if t.draft_id not in current)

    ids = {t.draft_id for t in final}
    final = [
        t.model_copy(
            update={"depends_on_draft_ids": [d for d in t.depends_on_draft_ids if d in ids]}
        )
        for t in final
    ]
    ordered = topological_order(final)

    reasons: dict[str, ChangeReasonLite] = {}
    for c in out.changes:
        draft = c.task_ref
        if draft not in current and c.task_ref in existing_by_id:
            draft = existing_by_id[c.task_ref].draft_id or c.task_ref
        reasons[draft] = ChangeReasonLite(c.change_type, c.reason)

    changes: list[ProposedChange] = []
    for t in ordered:
        old = current.get(t.draft_id)
        e = existing_by_draft.get(t.draft_id)
        hint = reasons.get(t.draft_id)
        if old is None:
            changes.append(
                ProposedChange(
                    change_type=ChangeType.CREATE,
                    after=_snapshot(t),
                    reason=_reason(hint.reason if hint else None, ChangeType.CREATE, inp.trigger),
                )
            )
            continue
        if (
            hint
            and hint.kind is ChangeType.MARK_BLOCKED
            and e is not None
            and may_change(t.draft_id)
        ):
            changes.append(
                ProposedChange(
                    existing_task_id=e.id,
                    change_type=ChangeType.MARK_BLOCKED,
                    before={"status": e.status.value},
                    after={"status": TaskStatus.BLOCKED.value},
                    reason=_reason(hint.reason, ChangeType.MARK_BLOCKED, inp.trigger),
                )
            )
            continue
        diff = [f for f in _TRACKED if getattr(old, f) != getattr(t, f)]
        if diff:
            changes.append(
                ProposedChange(
                    existing_task_id=e.id if e else None,
                    change_type=ChangeType.UPDATE,
                    before=_snapshot(old, tuple(diff)),
                    after=_snapshot(t, tuple(diff)),
                    reason=_reason(hint.reason if hint else None, ChangeType.UPDATE, inp.trigger),
                )
            )
        else:
            changes.append(
                ProposedChange(
                    existing_task_id=e.id if e else None,
                    change_type=ChangeType.KEEP,
                    reason=_reason(None, ChangeType.KEEP, inp.trigger),
                )
            )

    return WorkflowPlanDraft(
        version=inp.next_version,
        goal=out.goal.strip(),
        tasks=ordered,
        unresolved_items=merge_unresolved(out.unresolved_items, inp, notes),
        proposed_changes=changes,
    )
