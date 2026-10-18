"""Deterministic post-processing of plan drafts (spec §8.4).

* due dates only from dates the user confirmed (never invented, never from a vague phrase);
* estimates never invented and hidden entirely when `time_estimates=hide`;
* text length follows `information_density`; task count honours `task_granularity`;
* tasks are topologically ordered so the first task can start now (Micro-Step view);
* dependencies and requirement references resolve; duplicates of existing tasks are not re-created;
* open blocking questions stay visible in `unresolved_items`.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import date

from ritme_contracts import (
    PlanInput,
    PlanTaskDraft,
    QuestionStatus,
    WorkflowPlanDraft,
)

from . import dates
from .graph import topological_order
from .preferences import PlanShape, apply_density, plan_shape, strip_time_estimates
from .text import norm

_LEAD = re.compile(r"^\s*(?:task|step)?\s*\d+\s*[.):-]\s*|^\s*(?:task|step)\s*:\s*", re.IGNORECASE)


def check_task_count(task_count: int, shape: PlanShape) -> None:
    """`validate` hook: too many tasks for the chosen granularity (triggers one repair)."""
    if task_count > shape.max_tasks:
        raise ValueError(
            f"too many tasks ({task_count}); the chosen granularity allows at most "
            f"{shape.max_tasks}"
        )


def allowed_due_dates(inp: PlanInput, extra: Iterable[str] = ()) -> set[date]:
    """Calendar dates a task may legitimately carry: only ones the user confirmed or already set."""
    try:
        today: date | None = date.fromisoformat(inp.context.today)
    except ValueError:
        today = None
    found: set[date] = set()
    texts: list[str] = [r.text for r in inp.requirements if r.user_confirmed_at]
    texts += [q.answer for q in inp.questions if q.answer and q.status is QuestionStatus.ANSWERED]
    texts += [t.due_at for t in inp.existing_tasks if t.due_at]
    texts += [x for x in extra if x]
    for text in texts:
        found.update(e.value for e in dates.find_exact_dates(text, today))
        iso = dates.iso_date_part(text)
        if iso:
            found.add(iso)
    return found


def _clean_due(
    task: PlanTaskDraft, allowed: set[date], notes: list[str], keep_if_equal: str | None
) -> str | None:
    if task.due_at is None:
        return None
    if keep_if_equal is not None and task.due_at == keep_if_equal:
        return task.due_at
    d = dates.iso_date_part(task.due_at)
    if d is None or d not in allowed or not dates.has_utc_offset(task.due_at):
        notes.append(f'No due date set for "{task.title}": no confirmed date supports it.')
        return None
    return task.due_at


def finalize_tasks(
    tasks: list[PlanTaskDraft],
    inp: PlanInput,
    *,
    allowed: set[date],
    unchanged_due: dict[str, str | None] | None = None,
    known_ids: set[str] | None = None,
) -> tuple[list[PlanTaskDraft], list[str]]:
    """Per-task cleaning shared by plan and replan. Returns tasks and visible notes."""
    shape = plan_shape(inp.preferences)
    known_reqs = {r.id for r in inp.requirements}
    unchanged_due = unchanged_due or {}
    notes: list[str] = []
    existing_titles = {norm(t.title) for t in inp.existing_tasks}
    existing_drafts = {t.draft_id for t in inp.existing_tasks if t.draft_id}

    cleaned: list[PlanTaskDraft] = []
    for t in tasks:
        title = _LEAD.sub("", t.title).strip() or t.title
        if t.draft_id not in existing_drafts and norm(title) in existing_titles:
            notes.append(f'Left out "{title}": a task with that title already exists.')
            continue
        desc = apply_density(t.description, shape.description_limit)
        why = apply_density(t.rationale, shape.rationale_limit) if t.rationale else None
        done = t.definition_of_done
        minutes = t.estimated_minutes
        if not shape.show_estimates:
            minutes = None
            title = strip_time_estimates(title) or title
            desc = strip_time_estimates(desc)
            done = strip_time_estimates(done) or done
            why = strip_time_estimates(why) if why else None
        cleaned.append(
            t.model_copy(
                update={
                    "title": title,
                    "description": desc,
                    "definition_of_done": done,
                    "rationale": why or None,
                    "estimated_minutes": minutes,
                    "due_at": _clean_due(t, allowed, notes, unchanged_due.get(t.draft_id)),
                    "requirement_ids": [i for i in t.requirement_ids if i in known_reqs],
                }
            )
        )
    kept = {t.draft_id for t in cleaned} | (known_ids or set())
    cleaned = [
        t.model_copy(
            update={"depends_on_draft_ids": [d for d in t.depends_on_draft_ids if d in kept]}
        )
        for t in cleaned
    ]
    return topological_order(cleaned), notes


def open_question_items(inp: PlanInput) -> list[str]:
    return [
        f"Open question: {q.question}"
        for q in inp.questions
        if q.blocking and q.status is QuestionStatus.OPEN
    ]


def merge_unresolved(model_items: list[str], inp: PlanInput, notes: list[str]) -> list[str]:
    items = [i.strip() for i in model_items if i.strip()]
    present = norm(" ".join(items))
    for extra in open_question_items(inp) + notes:
        key = norm(extra.removeprefix("Open question: "))
        if key not in present:
            items.append(extra)
            present += " " + key
    return items


def apply_plan_guards(
    model_tasks: list[PlanTaskDraft], goal: str, unresolved: list[str], inp: PlanInput
) -> WorkflowPlanDraft:
    allowed = allowed_due_dates(inp)
    tasks, notes = finalize_tasks(model_tasks, inp, allowed=allowed)
    return WorkflowPlanDraft(
        version=inp.next_version,
        goal=goal.strip(),
        tasks=tasks,
        unresolved_items=merge_unresolved(unresolved, inp, notes),
    )
