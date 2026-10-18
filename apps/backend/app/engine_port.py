"""Port between the backend and the AI engine library. The backend only ever talks to this interface.

The real implementation (`engine_adapter.RitmeAiEngine`) wraps `packages/ai-engine`; tests inject a
scripted engine. Engine errors are classified so a provider failure becomes a recoverable state,
never a silent success.
"""

from __future__ import annotations

from typing import Protocol

from ritme_contracts import (
    CollabGuideInput,
    CollabGuideOutput,
    DraftClarification,
    DraftClarificationInput,
    ExtractInput,
    PlanInput,
    ReplanInput,
    StepMeta,
    WorkflowExtraction,
    WorkflowPlanDraft,
)


class EngineError(Exception):
    """Classified engine failure: timeout | rate_limit | invalid_output | provider | unavailable."""

    def __init__(self, code: str, message: str = "", retryable: bool = True):
        super().__init__(message or code)
        self.code = code
        self.retryable = retryable


class EngineGateway(Protocol):
    def extract(self, inp: ExtractInput) -> tuple[WorkflowExtraction, StepMeta]: ...
    def plan(self, inp: PlanInput) -> tuple[WorkflowPlanDraft, StepMeta]: ...
    def replan(self, inp: ReplanInput) -> tuple[WorkflowPlanDraft, StepMeta]: ...
    def draft_clarification(self, inp: DraftClarificationInput) -> tuple[DraftClarification, StepMeta]: ...
    def collab_guide(self, inp: CollabGuideInput) -> tuple[CollabGuideOutput, StepMeta]: ...


_engine: EngineGateway | None = None


def get_engine() -> EngineGateway:
    global _engine
    if _engine is None:
        try:
            from .engine_adapter import RitmeAiEngine  # noqa: PLC0415
        except ImportError as exc:
            raise EngineError("unavailable", "The AI engine is not available.", retryable=False) from exc
        _engine = RitmeAiEngine()
    return _engine


def set_engine(engine: EngineGateway | None) -> None:
    """Tests inject a scripted engine."""
    global _engine
    _engine = engine
