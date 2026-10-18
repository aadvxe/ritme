"""Engine-level error raised to the backend when a step cannot produce a valid output."""

from __future__ import annotations

from ritme_contracts import EngineStep

from .llm.result import LlmError, LlmErrorKind


class EngineError(Exception):
    """A step failed. `error.kind` is timeout | rate_limit | invalid_output | provider.

    The message is generic and never contains captured text, prompts or raw provider output.
    """

    def __init__(self, step: EngineStep, error: LlmError) -> None:
        super().__init__(f"{step.value}: {error.kind.value}: {error.message}")
        self.step = step
        self.error = error

    @property
    def kind(self) -> LlmErrorKind:
        return self.error.kind

    @property
    def retryable(self) -> bool:
        return self.error.retryable
