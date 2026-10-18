"""HTTP DTOs (spec §10). Shapes shared by backend, frontend and extension via generated types."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from .base import RitmeModel
from .enums import (
    ActionStatus,
    ActionType,
    AnswerDisposition,
    CaptureSourceType,
    CaptureStatus,
    ErrorCode,
    IngestionStatus,
    KnowledgeSourceType,
    PlanAuthor,
    PlanStatus,
    ReplanTrigger,
    TaskStatus,
    VerificationState,
    WorkflowStatus,
)
from .extraction import ClarificationQuestion, RequirementItem
from .plan import PlanTaskDraft, ProposedChange, WorkflowPlanDraft

MAX_CAPTURE_CHARS_DEFAULT = 20_000
MAX_NOTE_CHARS = 2_000

# ---------------------------------------------------------------- errors


class ErrorBody(RitmeModel):
    code: ErrorCode
    message: str
    retryable: bool = False
    request_id: str


class ErrorResponse(RitmeModel):
    error: ErrorBody


# ---------------------------------------------------------------- identity


class MeOut(RitmeModel):
    id: UUID
    email: str | None = None
    display_name: str | None = None
    photo_url: str | None = None
    onboarding_completed: bool = False


# ---------------------------------------------------------------- captures


class CaptureCreate(RitmeModel):
    title: str | None = Field(default=None, max_length=300)
    content_text: str = Field(min_length=1, max_length=MAX_CAPTURE_CHARS_DEFAULT)
    user_note: str | None = Field(default=None, max_length=MAX_NOTE_CHARS)
    source_page_title: str | None = Field(default=None, max_length=300)
    source_url: str | None = Field(default=None, max_length=2048)
    source_domain: str | None = Field(default=None, max_length=255)
    source_type: CaptureSourceType
    idempotency_key: str = Field(min_length=8, max_length=128)


class CaptureOut(RitmeModel):
    id: UUID
    title: str | None = None
    content_text: str
    user_note: str | None = None
    source_page_title: str | None = None
    source_url: str | None = None
    source_domain: str | None = None
    source_type: CaptureSourceType
    status: CaptureStatus
    workflow_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class WorkflowSummary(RitmeModel):
    id: UUID
    capture_id: UUID | None = None
    title: str
    objective: str | None = None
    status: WorkflowStatus
    paused: bool = False
    current_step: str | None = None
    next_action: str | None = None
    confirmed_due_at: datetime | None = None
    version: int
    current_plan_version: int | None = None
    is_demo: bool = False
    created_at: datetime
    updated_at: datetime


class CaptureCreateResponse(RitmeModel):
    capture: CaptureOut
    workflow: WorkflowSummary
    next_url: str
    created: bool = True  # false when an idempotent replay returned the existing capture


# ---------------------------------------------------------------- workflow detail


class Citation(RitmeModel):
    """A source excerpt that resolves to a stored chunk (or to the capture itself)."""

    source_id: str  # capture id or knowledge document id
    source_kind: Literal["capture", "knowledge"]
    title: str
    chunk_id: str | None = None
    excerpt: str
    location: str | None = None
    source_date: datetime | None = None


class ResumeCard(RitmeModel):
    source_title: str | None = None
    source_url: str | None = None
    user_note: str | None = None
    status: WorkflowStatus
    last_completed_step: str | None = None
    next_action: str | None = None
    open_question_count: int = 0


class TaskOut(RitmeModel):
    id: UUID
    workflow_id: UUID
    plan_version_id: UUID | None = None
    title: str
    description: str = ""
    definition_of_done: str = ""
    status: TaskStatus
    estimated_minutes: int | None = None
    due_at: datetime | None = None
    depends_on: list[UUID] = Field(default_factory=list)
    requirement_ids: list[str] = Field(default_factory=list)
    created_by_action_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class PlanVersionOut(RitmeModel):
    id: UUID
    workflow_id: UUID
    version: int
    row_version: int  # used for If-Match on edits
    goal: str
    status: PlanStatus
    created_by: PlanAuthor
    plan: WorkflowPlanDraft
    created_at: datetime
    updated_at: datetime


class ProposedActionOut(RitmeModel):
    id: UUID
    workflow_id: UUID
    plan_version_id: UUID | None = None
    action_type: ActionType
    provider: str = "ritme"
    payload: dict[str, Any]
    reason_summary: str
    status: ActionStatus
    verification: VerificationState = VerificationState.NOT_RUN
    result_summary: str | None = None
    result_ids: list[str] = Field(default_factory=list)
    error_code: str | None = None
    approved_at: datetime | None = None
    executed_at: datetime | None = None
    created_at: datetime


class ActivityEventOut(RitmeModel):
    id: UUID
    workflow_id: UUID | None = None
    event_type: str
    summary: str
    details: dict[str, Any] | None = None
    created_at: datetime


class ActivityPage(RitmeModel):
    items: list[ActivityEventOut]
    next_cursor: str | None = None


class WorkflowDetail(RitmeModel):
    workflow: WorkflowSummary
    capture: CaptureOut | None = None
    requirements: list[RequirementItem]
    questions: list[ClarificationQuestion]
    latest_plan: PlanVersionOut | None = None
    tasks: list[TaskOut]
    actions: list[ProposedActionOut]
    sources: list[Citation]
    resume: ResumeCard


class WorkflowPatch(RitmeModel):
    version: int  # optimistic concurrency; 409 when stale
    title: str | None = Field(default=None, max_length=160)
    objective: str | None = None
    next_action: str | None = Field(default=None, max_length=500)
    confirmed_due_at: datetime | None = None


class RequirementPatch(RitmeModel):
    """Truth Board edits: confirm / edit / reject an item. Confirmed items become the latest truth."""

    text: str | None = Field(default=None, min_length=1)
    confirm: bool | None = None
    reject: bool | None = None


class AnswerRequest(RitmeModel):
    answer: str | None = Field(default=None, max_length=2000)
    disposition: AnswerDisposition = AnswerDisposition.ANSWER
    assumption_label: str | None = Field(default=None, max_length=500)  # for defer_nonblocking
    # Optional: when the answer is a real, user-confirmed date/time (e.g. a deadline question), the
    # client sends it here. Vague text like "Friday" is never turned into a date by the server.
    confirmed_due_at: datetime | None = None


class DraftClarificationResponse(RitmeModel):
    question_id: str
    message: str
    notes: str | None = None


class PlanPatch(RitmeModel):
    row_version: int
    goal: str | None = None
    tasks: list[PlanTaskDraft] | None = None


class ProposeActionRequest(RitmeModel):
    plan_version_id: UUID


class ReplanRequest(RitmeModel):
    trigger: ReplanTrigger
    requirement_id: str | None = None
    new_text: str | None = None
    new_due_at: datetime | None = None


class ReplanResponse(RitmeModel):
    plan: PlanVersionOut
    action: ProposedActionOut
    blast_radius_task_ids: list[UUID]
    diff: list[ProposedChange]


class TaskPatch(RitmeModel):
    status: TaskStatus | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    definition_of_done: str | None = None


# ---------------------------------------------------------------- dashboard + calendar


class NeedsInputItem(RitmeModel):
    workflow_id: UUID
    workflow_title: str
    question_id: str
    question: str


class NeedsApprovalItem(RitmeModel):
    action_id: UUID
    workflow_id: UUID
    workflow_title: str
    summary: str


class NextBestStep(RitmeModel):
    workflow_id: UUID
    workflow_title: str
    text: str


class DashboardOut(RitmeModel):
    next_best_step: NextBestStep | None = None
    active_workflows: list[WorkflowSummary]
    needs_input: list[NeedsInputItem]
    needs_approval: list[NeedsApprovalItem]
    recent_captures: list[CaptureOut]
    recent_activity: list[ActivityEventOut]


class CalendarItem(RitmeModel):
    type: Literal["task", "workflow_deadline"]
    id: UUID
    workflow_id: UUID
    workflow_title: str
    title: str
    due_at: datetime | None = None
    status: str  # task status or workflow status, shown as text
    depends_on: list[UUID] = Field(default_factory=list)  # only for the Timeline's links


class CalendarOverview(RitmeModel):
    items: list[CalendarItem]  # dated items only
    undated: list[CalendarItem]


# ---------------------------------------------------------------- knowledge (Context Library)


class KnowledgeDocCreate(RitmeModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=100_000)
    source_type: KnowledgeSourceType = KnowledgeSourceType.USER_TEXT
    source_date: datetime | None = None


class KnowledgeDocOut(RitmeModel):
    id: UUID
    title: str
    source_type: KnowledgeSourceType
    ingestion_status: IngestionStatus
    content_hash: str
    chunk_count: int
    source_date: datetime | None = None
    is_seed: bool = False
    conflicts_with: list[UUID] = Field(default_factory=list)
    created_at: datetime


class KnowledgeSearchRequest(RitmeModel):
    query: str = Field(min_length=1, max_length=500)
    document_ids: list[UUID] | None = None


class KnowledgeSearchResponse(RitmeModel):
    results: list[Citation]


# ---------------------------------------------------------------- extension connection


class ExtensionConnectRequest(RitmeModel):
    extension_id: str = Field(min_length=10, max_length=64)
    label: str | None = Field(default=None, max_length=80)


class ExtensionTokenResponse(RitmeModel):
    access_token: str
    refresh_token: str
    expires_at: datetime
    scopes: list[Literal["captures:write"]]
    device_id: UUID


class ExtensionRefreshRequest(RitmeModel):
    refresh_token: str


class ConnectedDevice(RitmeModel):
    id: UUID
    label: str | None = None
    created_at: datetime
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None


# ---------------------------------------------------------------- privacy


class PrivacyOverview(RitmeModel):
    captures_count: int
    workflows_count: int
    tasks_count: int
    knowledge_documents_count: int
    model_provider: str
    model_processing_note: str
    log_retention_note: str
    employer_access: Literal["none"] = "none"


class DeletionResult(RitmeModel):
    deleted: bool
    removed: dict[str, int] = Field(default_factory=dict)
