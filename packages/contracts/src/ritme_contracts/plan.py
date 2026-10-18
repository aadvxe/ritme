"""Canonical plan schema (spec §8.4) with deterministic graph validation."""

from __future__ import annotations

from typing import Any, Self

from pydantic import Field, model_validator

from .base import RitmeModel
from .enums import ChangeType


class PlanTaskDraft(RitmeModel):
    draft_id: str
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    definition_of_done: str = Field(min_length=1)
    estimated_minutes: int | None = Field(default=None, ge=1, le=60 * 24)
    due_at: str | None = None  # ISO-8601 with offset; only ever set from a confirmed date
    depends_on_draft_ids: list[str] = Field(default_factory=list)
    requirement_ids: list[str] = Field(default_factory=list)
    rationale: str | None = None


class ProposedChange(RitmeModel):
    existing_task_id: str | None = None
    change_type: ChangeType
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    reason: str


def find_cycle(edges: dict[str, list[str]]) -> list[str] | None:
    """Return one cycle as a list of ids, or None. Iterative DFS (no recursion limit)."""
    WHITE, GREY, BLACK = 0, 1, 2
    color = {n: WHITE for n in edges}
    for start in edges:
        if color[start] != WHITE:
            continue
        stack: list[tuple[str, int]] = [(start, 0)]
        path: list[str] = [start]
        color[start] = GREY
        while stack:
            node, i = stack[-1]
            deps = edges.get(node, [])
            if i < len(deps):
                stack[-1] = (node, i + 1)
                nxt = deps[i]
                if color.get(nxt, BLACK) == GREY:
                    return path[path.index(nxt):] + [nxt]
                if color.get(nxt) == WHITE:
                    color[nxt] = GREY
                    stack.append((nxt, 0))
                    path.append(nxt)
            else:
                color[node] = BLACK
                stack.pop()
                path.pop()
    return None


class WorkflowPlanDraft(RitmeModel):
    version: int = Field(ge=1)
    goal: str
    tasks: list[PlanTaskDraft]
    unresolved_items: list[str] = Field(default_factory=list)
    proposed_changes: list[ProposedChange] | None = None

    @model_validator(mode="after")
    def _graph_is_valid(self) -> Self:
        ids = [t.draft_id for t in self.tasks]
        if len(set(ids)) != len(ids):
            raise ValueError("draft ids must be unique")
        known = set(ids)
        for t in self.tasks:
            bad = [d for d in t.depends_on_draft_ids if d not in known]
            if bad:
                raise ValueError(f"task {t.draft_id} depends on unknown drafts: {bad}")
            if t.draft_id in t.depends_on_draft_ids:
                raise ValueError(f"task {t.draft_id} depends on itself")
        cycle = find_cycle({t.draft_id: t.depends_on_draft_ids for t in self.tasks})
        if cycle:
            raise ValueError(f"dependency cycle: {' -> '.join(cycle)}")
        return self
