"""Adapter from the backend's EngineGateway port to the in-process `ritme_ai` library."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable
from typing import Any

from ritme_ai import ConfigError, Engine, EngineConfig
from ritme_ai import EngineError as LibEngineError
from ritme_ai.llm.factory import create_llm
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

from .config import get_settings
from .engine_port import EngineError


def _run[T](coro: Awaitable[T]) -> T:
    """Sync bridge: API endpoints and worker threads have no running event loop."""
    return asyncio.run(coro)  # type: ignore[arg-type]


class RitmeAiEngine:
    def __init__(self) -> None:
        s = get_settings()
        try:
            config = EngineConfig(
                provider=s.llm_provider,
                project=s.gcp_project_id or None,
                location=s.vertex_location,
                model_fast=s.llm_model_fast,
                model_plan=s.llm_model_plan,
                timeout_ms=s.llm_timeout_ms,
            )
            self._engine = Engine(create_llm(config), timeout_ms=config.timeout_ms)
        except ConfigError as exc:
            raise EngineError("unavailable", "The AI engine is not configured.", retryable=False) from exc

    def _call(self, step_input: Any) -> Any:
        try:
            return _run(self._engine.run(step_input))
        except LibEngineError as exc:
            raise EngineError(exc.kind.value, "The assistant could not produce a valid result.", exc.retryable) from None

    def extract(self, inp: ExtractInput) -> tuple[WorkflowExtraction, StepMeta]:
        return self._call(inp)

    def plan(self, inp: PlanInput) -> tuple[WorkflowPlanDraft, StepMeta]:
        return self._call(inp)

    def replan(self, inp: ReplanInput) -> tuple[WorkflowPlanDraft, StepMeta]:
        return self._call(inp)

    def draft_clarification(self, inp: DraftClarificationInput) -> tuple[DraftClarification, StepMeta]:
        return self._call(inp)

    def collab_guide(self, inp: CollabGuideInput) -> tuple[CollabGuideOutput, StepMeta]:
        return self._call(inp)
