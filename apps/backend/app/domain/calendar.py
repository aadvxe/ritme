"""Read-only calendar overview (spec §14.2). Built only from tasks.due_at and workflows.confirmed_due_at.

Dates are never guessed or assigned here. Items without a date go to `undated`. Items with a date
that has passed stay in `items`; the client groups them neutrally as "Earlier, still open".
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from ritme_contracts import CalendarItem, CalendarOverview, TaskStatus, WorkflowStatus
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from ..db import models as m
from ..errors import invalid_input

MAX_RANGE_DAYS = 62
_CLOSED_WORKFLOWS = {WorkflowStatus.CANCELLED.value}


def overview(session: Session, user_id: uuid.UUID, start: datetime, end: datetime) -> CalendarOverview:
    if end <= start:
        raise invalid_input("The end of the range must be after the start.")
    if end - start > timedelta(days=MAX_RANGE_DAYS):
        raise invalid_input(f"Choose a range of at most {MAX_RANGE_DAYS} days.")

    wf_rows = {
        w.id: w
        for w in session.scalars(
            select(m.Workflow).where(m.Workflow.user_id == user_id, m.Workflow.status.notin_(_CLOSED_WORKFLOWS))
        )
    }
    deps: dict[uuid.UUID, list[uuid.UUID]] = {}
    task_ids = list(
        session.scalars(select(m.Task.id).where(m.Task.user_id == user_id, m.Task.workflow_id.in_(list(wf_rows) or [uuid.uuid4()])))
    )
    for td in session.scalars(select(m.TaskDependency).where(m.TaskDependency.task_id.in_(task_ids or [uuid.uuid4()]))):
        deps.setdefault(td.task_id, []).append(td.depends_on_id)

    tasks = session.scalars(
        select(m.Task).where(
            m.Task.user_id == user_id,
            m.Task.workflow_id.in_(list(wf_rows) or [uuid.uuid4()]),
            # dated items: inside the window, OR already in the past and still open
            or_(
                m.Task.due_at.is_(None),
                and_(m.Task.due_at >= start, m.Task.due_at < end),
                and_(m.Task.due_at < start, m.Task.status.notin_([TaskStatus.DONE.value, TaskStatus.SKIPPED.value])),
            ),
        )
    ).all()

    items: list[CalendarItem] = []
    undated: list[CalendarItem] = []
    for t in tasks:
        wf = wf_rows[t.workflow_id]
        item = CalendarItem(
            type="task", id=t.id, workflow_id=wf.id, workflow_title=wf.title, title=t.title,
            due_at=t.due_at, status=t.status, depends_on=deps.get(t.id, []),
        )
        (items if t.due_at else undated).append(item)

    for wf in wf_rows.values():
        if wf.confirmed_due_at is None:
            continue
        due = wf.confirmed_due_at
        open_ = wf.status != WorkflowStatus.COMPLETED.value
        if start <= due < end or (due < start and open_):
            items.append(
                CalendarItem(
                    type="workflow_deadline", id=wf.id, workflow_id=wf.id, workflow_title=wf.title,
                    title=wf.title, due_at=due, status=wf.status,
                )
            )

    items.sort(key=lambda i: (i.due_at, i.title))
    undated.sort(key=lambda i: (i.workflow_title, i.title))
    return CalendarOverview(items=items, undated=undated)
