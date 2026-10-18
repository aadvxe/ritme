"""Flat model-output schemas for plan and replan.

Gemini structured output is fragile with open dicts, so the model returns only what it should
author (goal, tasks, per-task change reasons). Code builds `version` and the Before/After
`proposed_changes` (which carry free-form dicts) deterministically.
"""

from __future__ import annotations

from typing import Self

from pydantic import Field, model_validator
from ritme_contracts import ChangeType, PlanTaskDraft, RitmeModel

from .guards.graph import validate_dependencies


class PlanModelOutput(RitmeModel):
    goal: str = Field(min_length=1)
    tasks: list[PlanTaskDraft] = Field(min_length=1)
    unresolved_items: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _graph_is_valid(self) -> Self:
        validate_dependencies(self.tasks)  # duplicate ids, unknown ids, self-loops, cycles
        return self


class ChangeReason(RitmeModel):
    task_ref: str  # draft id (or existing task id) the reason is about
    change_type: ChangeType
    reason: str = Field(min_length=1)


class ReplanModelOutput(PlanModelOutput):
    changes: list[ChangeReason] = Field(default_factory=list)
