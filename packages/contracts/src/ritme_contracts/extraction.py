"""Canonical extraction schema (spec §8.3). Model output must validate against this."""

from __future__ import annotations

from typing import Self

from pydantic import Field, model_validator

from .base import RitmeModel
from .enums import Certainty, Importance, QuestionStatus, RequirementKind

EXTRACTION_SCHEMA_VERSION = 1
MAX_EXCERPT_CHARS = 400


class EvidenceRef(RitmeModel):
    source_id: str
    excerpt: str = Field(min_length=1, max_length=MAX_EXCERPT_CHARS)
    start_offset: int | None = None
    end_offset: int | None = None


class RequirementItem(RitmeModel):
    id: str
    kind: RequirementKind
    text: str = Field(min_length=1)
    certainty: Certainty
    importance: Importance
    evidence: list[EvidenceRef] = Field(default_factory=list)
    user_confirmed_at: str | None = None

    @model_validator(mode="after")
    def _explicit_needs_evidence(self) -> Self:
        # Spec §8.3: a requirement cannot be `explicit` without an evidence excerpt.
        if self.certainty == Certainty.EXPLICIT and not self.evidence:
            raise ValueError("explicit requirements need at least one evidence excerpt")
        return self


class ClarificationQuestion(RitmeModel):
    id: str
    question: str = Field(min_length=1)
    why_it_matters: str = Field(min_length=1)
    blocking: bool
    related_requirement_ids: list[str] = Field(default_factory=list)
    suggested_answers: list[str] | None = None
    answer: str | None = None
    status: QuestionStatus = QuestionStatus.OPEN


class WorkflowExtraction(RitmeModel):
    suggested_title: str = Field(min_length=1, max_length=160)
    objective: str
    requirements: list[RequirementItem]
    questions: list[ClarificationQuestion]
    summary: str
    confidence_notes: list[str] = Field(default_factory=list)
    schema_version: int = EXTRACTION_SCHEMA_VERSION

    @model_validator(mode="after")
    def _question_links_resolve(self) -> Self:
        ids = {r.id for r in self.requirements}
        if len(ids) != len(self.requirements):
            raise ValueError("requirement ids must be unique")
        for q in self.questions:
            missing = [rid for rid in q.related_requirement_ids if rid not in ids]
            if missing:
                raise ValueError(f"question {q.id} references unknown requirements: {missing}")
        return self


class DraftClarification(RitmeModel):
    """A polite, editable message the user may send themselves. Never auto-sent."""

    question_id: str
    message: str = Field(min_length=1)
    notes: str | None = None
