"""AI-engine step inputs/outputs. The engine is stateless: everything it needs arrives here.

`untrusted` fields carry captured text and retrieved chunks. They are delimited as data by the
engine and can never alter policy or authorise tool use (spec §11).
"""

from __future__ import annotations

from pydantic import Field

from .base import RitmeModel
from .dto import Citation
from .enums import EngineStep, ReplanTrigger, TaskStatus
from .extraction import ClarificationQuestion, RequirementItem, WorkflowExtraction
from .plan import WorkflowPlanDraft
from .preferences import Preferences


class StepContext(RitmeModel):
    today: str  # ISO date in the user's timezone
    timezone: str = "UTC"
    locale: str = "en"


class ExtractInput(RitmeModel):
    capture_id: str
    title: str | None = None
    content_text: str  # untrusted
    user_note: str | None = None  # untrusted
    source_domain: str | None = None
    knowledge: list[Citation] = Field(default_factory=list)  # untrusted
    preferences: Preferences
    context: StepContext
    prior: WorkflowExtraction | None = None  # present on re-analysis (user edits win)


class ExistingTask(RitmeModel):
    id: str
    draft_id: str | None = None
    title: str
    status: TaskStatus
    due_at: str | None = None
    depends_on: list[str] = Field(default_factory=list)


class PlanInput(RitmeModel):
    objective: str
    requirements: list[RequirementItem]
    questions: list[ClarificationQuestion]
    knowledge: list[Citation] = Field(default_factory=list)  # untrusted
    existing_tasks: list[ExistingTask] = Field(default_factory=list)
    preferences: Preferences
    context: StepContext
    next_version: int = 1


class ReplanInput(PlanInput):
    current_plan: WorkflowPlanDraft
    trigger: ReplanTrigger
    changed_requirement_id: str | None = None
    new_text: str | None = None  # untrusted (user typed)
    new_due_at: str | None = None
    blast_radius_task_ids: list[str] = Field(default_factory=list)  # computed by code


class DraftClarificationInput(RitmeModel):
    question: ClarificationQuestion
    objective: str
    related: list[RequirementItem] = Field(default_factory=list)
    source_excerpt: str | None = None  # untrusted
    preferences: Preferences
    context: StepContext


class CollabGuideInput(RitmeModel):
    preferences: Preferences
    context: StepContext


class CollabGuideOutput(RitmeModel):
    text: str


class StepMeta(RitmeModel):
    step: EngineStep
    prompt_version: str
    model: str
    attempts: int = 1
    repaired: bool = False
