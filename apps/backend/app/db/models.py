"""Relational source of truth (spec §9). Core entities stay queryable; JSON only for versioned payloads."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(320))
    display_name: Mapped[str | None] = mapped_column(String(200))
    photo_url: Mapped[str | None] = mapped_column(String(1000))
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class UserPreferences(Base, TimestampMixin):
    __tablename__ = "user_preferences"
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    task_granularity: Mapped[str] = mapped_column(String(32), default="balanced")
    information_density: Mapped[str] = mapped_column(String(32), default="balanced")
    plan_layout: Mapped[str] = mapped_column(String(32), default="full_list")
    clarification_help: Mapped[str] = mapped_column(String(32), default="draft_message")
    communication_style: Mapped[str] = mapped_column(String(40), default="preserve_my_voice")
    time_estimates: Mapped[str] = mapped_column(String(16), default="show")
    pacing_support: Mapped[str] = mapped_column(String(32), default="off")
    is_set: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    consent_version: Mapped[str | None] = mapped_column(String(32))
    consent_recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Capture(Base, TimestampMixin):
    __tablename__ = "captures"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_captures_user_idem"),
        Index("ix_captures_user_created", "user_id", "created_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str | None] = mapped_column(String(300))
    content_text: Mapped[str] = mapped_column(Text, nullable=False)
    user_note: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String(2048))
    source_domain: Mapped[str | None] = mapped_column(String(255))
    source_page_title: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(24), default="submitted", nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)


class Workflow(Base, TimestampMixin):
    __tablename__ = "workflows"
    __table_args__ = (Index("ix_workflows_user_status", "user_id", "status"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    capture_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("captures.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    objective: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="captured", nullable=False)
    paused: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    current_step: Mapped[str | None] = mapped_column(String(120))
    next_action: Mapped[str | None] = mapped_column(String(500))
    confirmed_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    current_plan_version: Mapped[int | None] = mapped_column(Integer)
    state_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Requirement(Base, TimestampMixin):
    __tablename__ = "requirements"
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), primary_key=True
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    certainty: Mapped[str] = mapped_column(String(16), nullable=False)
    importance: Mapped[str] = mapped_column(String(16), nullable=False)
    evidence_json: Mapped[list[Any]] = mapped_column(JSONB, default=list, nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    user_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    edited_by_user: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class ClarificationQuestionRow(Base, TimestampMixin):
    __tablename__ = "clarification_questions"
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), primary_key=True
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    why_it_matters: Mapped[str] = mapped_column(Text, nullable=False)
    blocking: Mapped[bool] = mapped_column(Boolean, nullable=False)
    related_requirement_ids: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    suggested_answers_json: Mapped[list[str] | None] = mapped_column(JSONB)
    answer: Mapped[str | None] = mapped_column(Text)
    assumption_label: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(16), default="open", nullable=False)


class PlanVersion(Base, TimestampMixin):
    __tablename__ = "plan_versions"
    __table_args__ = (UniqueConstraint("workflow_id", "version", name="uq_plan_workflow_version"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    row_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    plan_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="draft", nullable=False)
    created_by: Mapped[str] = mapped_column(String(16), default="agent", nullable=False)


class ProposedAction(Base, TimestampMixin):
    __tablename__ = "proposed_actions"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_actions_user_idem"),
        Index("ix_actions_user_status", "user_id", "status"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    plan_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plan_versions.id", ondelete="SET NULL")
    )
    action_type: Mapped[str] = mapped_column(String(32), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), default="ritme", nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    reason_summary: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="pending_approval", nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    result_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    verification: Mapped[str] = mapped_column(String(16), default="not_run", nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(64))
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Task(Base, TimestampMixin):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_workflow_status", "workflow_id", "status"),
        # A create action can never insert the same draft twice, even if executed twice.
        UniqueConstraint("created_by_action_id", "draft_id", name="uq_tasks_action_draft"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    plan_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plan_versions.id", ondelete="SET NULL")
    )
    draft_id: Mapped[str | None] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    definition_of_done: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="todo", nullable=False)
    estimated_minutes: Mapped[int | None] = mapped_column(Integer)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    requirement_ids_json: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    external_provider: Mapped[str | None] = mapped_column(String(32))
    external_id: Mapped[str | None] = mapped_column(String(128))
    created_by_action_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("proposed_actions.id", ondelete="SET NULL")
    )


class TaskDependency(Base):
    __tablename__ = "task_dependencies"
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True
    )
    depends_on_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True
    )


class AgentRun(Base):
    __tablename__ = "agent_runs"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    trigger: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="running", nullable=False)
    step_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    prompt_versions: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    model: Mapped[str | None] = mapped_column(String(120))
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(64))
    input_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)  # ids/params only


class ActivityEvent(Base):
    __tablename__ = "activity_events"
    __table_args__ = (
        Index("ix_events_workflow_created", "workflow_id", "created_at"),
        Index("ix_events_user_created", "user_id", "created_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    workflow_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE")
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    details_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"
    __table_args__ = (
        UniqueConstraint("user_id", "content_hash", name="uq_knowledge_user_hash"),
        Index("ix_knowledge_user", "user_id"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    source_type: Mapped[str] = mapped_column(String(24), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    content_text: Mapped[str] = mapped_column(Text, nullable=False)
    ingestion_status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    is_seed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    chunks: Mapped[list[KnowledgeChunk]] = relationship(
        back_populates="document", cascade="all, delete-orphan", passive_deletes=True
    )


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[str | None] = mapped_column(String(200))
    tsv: Mapped[Any] = mapped_column(
        TSVECTOR, Computed("to_tsvector('english', text)", persisted=True)
    )
    document: Mapped[KnowledgeDocument] = relationship(back_populates="chunks")

    __table_args__ = (
        Index("ix_chunks_tsv", "tsv", postgresql_using="gin"),
        Index("ix_chunks_user", "user_id"),
    )


class ExtensionDevice(Base):
    __tablename__ = "extension_devices"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    extension_id: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str | None] = mapped_column(String(80))
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
