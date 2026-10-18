"""Dependency validation helpers (cycle detection itself lives in ritme_contracts.find_cycle)."""

from __future__ import annotations

from ritme_contracts import PlanTaskDraft, find_cycle


def validate_dependencies(tasks: list[PlanTaskDraft]) -> None:
    """Raise ValueError for duplicate ids, unknown/self dependencies or cycles (ids only)."""
    ids = [t.draft_id for t in tasks]
    if len(set(ids)) != len(ids):
        raise ValueError("draft ids must be unique")
    known = set(ids)
    for t in tasks:
        if t.draft_id in t.depends_on_draft_ids:
            raise ValueError(f"task {t.draft_id} depends on itself")
        bad = [d for d in t.depends_on_draft_ids if d not in known]
        if bad:
            raise ValueError(f"task {t.draft_id} depends on unknown drafts: {bad}")
    cycle = find_cycle({t.draft_id: t.depends_on_draft_ids for t in tasks})
    if cycle:
        raise ValueError(f"dependency cycle: {' -> '.join(cycle)}")


def topological_order(tasks: list[PlanTaskDraft]) -> list[PlanTaskDraft]:
    """Stable topological sort so the first task is always one that can start now."""
    by_id = {t.draft_id: t for t in tasks}
    done: set[str] = set()
    ordered: list[PlanTaskDraft] = []
    remaining = list(tasks)
    while remaining:
        progressed = False
        for t in list(remaining):
            if all(d in done or d not in by_id for d in t.depends_on_draft_ids):
                ordered.append(t)
                done.add(t.draft_id)
                remaining.remove(t)
                progressed = True
        if not progressed:  # cycle: callers validate first, keep input order as a fallback
            ordered.extend(remaining)
            break
    return ordered
