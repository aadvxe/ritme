"""FakeLlm: deterministic, offline adapter for tests, CI and local dev (LLM_PROVIDER=fake).

It goes through the same parse -> validate -> repair loop as the Vertex adapter. By default each
step is answered by a fixture (see fixtures.py). Tests can script exact responses per step with
`script(step, ...)`: a str is returned as raw model text, a BaseModel is serialised, an
LlmFailure/Exception is raised. Every model call (including repair retries) consumes one item.
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel
from ritme_contracts import EngineStep

from .base import ModelNames, StructuredAdapter, Turn
from .fixtures import FIXTURES, render
from .result import LlmErrorKind, LlmFailure

DEFAULT_FAKE_MODELS = ModelNames(fast="fake-fast", plan="fake-plan")


@dataclass(frozen=True, slots=True)
class FakeCall:
    step: EngineStep
    model: str
    system: str
    turns: tuple[Turn, ...]
    timeout_ms: int

    @property
    def untrusted_input(self) -> str:
        return self.turns[0].text


class FakeLlm(StructuredAdapter):
    def __init__(
        self,
        models: ModelNames | None = None,
        fixtures: dict[EngineStep, Any] | None = None,
    ) -> None:
        self.models = models or DEFAULT_FAKE_MODELS
        self._fixtures = {**FIXTURES, **(fixtures or {})}
        self._scripted: dict[EngineStep, deque[Any]] = defaultdict(deque)
        self.calls: list[FakeCall] = []

    def script(self, step: EngineStep, *items: Any) -> FakeLlm:
        self._scripted[step].extend(items)
        return self

    async def _complete(
        self,
        *,
        step: EngineStep,
        model: str,
        system: str,
        turns: list[Turn],
        schema: type[BaseModel],
        timeout_ms: int,
    ) -> str:
        self.calls.append(FakeCall(step, model, system, tuple(turns), timeout_ms))
        queue = self._scripted[step]
        if queue:
            item = queue.popleft()
            if isinstance(item, BaseException):
                raise item
            if isinstance(item, BaseModel):
                return render(item)
            return str(item)
        fixture = self._fixtures.get(step)
        if fixture is None:
            raise LlmFailure(LlmErrorKind.PROVIDER, f"No fixture for step {step.value}.")
        return render(fixture(system, turns[0].text))
