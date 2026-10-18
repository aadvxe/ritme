"""Public in-process entry point the backend calls.

    engine = Engine.from_env()
    output, meta = await engine.run(ExtractInput(...))

The engine is stateless: no DB, no HTTP framework, nothing persisted. Every call receives its
full input and returns a validated output plus `StepMeta` (step, prompt version, model, attempts)
for the backend to store on the agent run. Failures raise `EngineError` with a classified kind.
"""

from __future__ import annotations

from typing import overload

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

from .config import EngineConfig
from .llm.base import LlmAdapter
from .llm.factory import create_llm
from .steps import collab_guide, draft_clarification, extract, plan, replan

StepInput = ExtractInput | PlanInput | ReplanInput | DraftClarificationInput | CollabGuideInput
StepOutput = WorkflowExtraction | WorkflowPlanDraft | DraftClarification | CollabGuideOutput


class Engine:
    def __init__(self, llm: LlmAdapter, *, timeout_ms: int | None = None) -> None:
        self.llm = llm
        self.timeout_ms = timeout_ms if timeout_ms is not None else EngineConfig().timeout_ms

    @classmethod
    def from_env(cls) -> Engine:
        """Build from LLM_PROVIDER (fake | vertex) and the other documented env vars."""
        config = EngineConfig.from_env()
        return cls(create_llm(config), timeout_ms=config.timeout_ms)

    @overload
    async def run(self, step_input: ExtractInput) -> tuple[WorkflowExtraction, StepMeta]: ...
    @overload
    async def run(self, step_input: ReplanInput) -> tuple[WorkflowPlanDraft, StepMeta]: ...
    @overload
    async def run(self, step_input: PlanInput) -> tuple[WorkflowPlanDraft, StepMeta]: ...
    @overload
    async def run(
        self, step_input: DraftClarificationInput
    ) -> tuple[DraftClarification, StepMeta]: ...
    @overload
    async def run(self, step_input: CollabGuideInput) -> tuple[CollabGuideOutput, StepMeta]: ...

    async def run(self, step_input: StepInput) -> tuple[StepOutput, StepMeta]:
        # ReplanInput subclasses PlanInput, so test it first.
        if isinstance(step_input, ReplanInput):
            return await replan.run(self.llm, step_input, self.timeout_ms)
        if isinstance(step_input, PlanInput):
            return await plan.run(self.llm, step_input, self.timeout_ms)
        if isinstance(step_input, ExtractInput):
            return await extract.run(self.llm, step_input, self.timeout_ms)
        if isinstance(step_input, DraftClarificationInput):
            return await draft_clarification.run(self.llm, step_input, self.timeout_ms)
        if isinstance(step_input, CollabGuideInput):
            return await collab_guide.run(self.llm, step_input, self.timeout_ms)
        raise TypeError(f"unsupported step input: {type(step_input).__name__}")
