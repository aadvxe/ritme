"""Scenario-scripted FakeLlm and the engine gateway that wraps it.

The backend still talks to the real `RitmeAiEngine` adapter -> real `ritme_ai.Engine` -> real guards;
only the model call is replaced. A scenario can script the "model" per step:

    "llm": {
      "extract": [ <item>, <item>, ... ]                    # consumed in order, then the default fixture
      "plan":    {"queue": [<item>], "then": <item>}         # `then` repeats once the queue is empty
    }

<item> is one of:
    {...}                       a model-output JSON object (camelCase). Strings may use placeholders:
                                  "$capture"          source id of the capture block
                                  "$knowledge"        source id of the first knowledge block
                                  "$knowledge:<text>" knowledge block whose title contains <text>
                                  "$due:+5d"          ISO timestamp (UTC offset) 5 days from run start
    {"$fail": "timeout" | "rate_limit" | "provider" | "invalid_output"}   classified provider failure
    {"$raw": "<text>"}          raw model text (e.g. invalid JSON)
    "$default"                  the shipped FakeLlm fixture
"""

from __future__ import annotations

import json
import re
from collections import defaultdict, deque
from typing import Any

from pydantic import BaseModel
from ritme_ai import Engine
from ritme_ai.blocks import parse_blocks
from ritme_ai.llm.base import Turn
from ritme_ai.llm.fake import FakeLlm
from ritme_ai.llm.result import LlmErrorKind, LlmFailure
from ritme_contracts import EngineStep

_DUE = re.compile(r"^\$due:([+-]\d+)d$")


class ScenarioLlm(FakeLlm):
    def __init__(self, script: dict[str, Any], resolve_due) -> None:  # type: ignore[no-untyped-def]
        super().__init__()
        self._queues: dict[str, deque[Any]] = defaultdict(deque)
        self._then: dict[str, Any] = {}
        for step, spec in (script or {}).items():
            if isinstance(spec, list):
                self._queues[step].extend(spec)
            else:
                self._queues[step].extend(spec.get("queue", []))
                if "then" in spec:
                    self._then[step] = spec["then"]
        self._resolve_due = resolve_due

    # -- placeholder substitution -------------------------------------------------
    def _subst(self, value: Any, untrusted: str) -> Any:
        if isinstance(value, dict):
            return {k: self._subst(v, untrusted) for k, v in value.items()}
        if isinstance(value, list):
            return [self._subst(v, untrusted) for v in value]
        if not isinstance(value, str) or not value.startswith("$"):
            return value
        blocks = parse_blocks(untrusted)
        if value == "$capture":
            cap = next((b for b in blocks if b.name == "capture"), None)
            return cap.attrs.get("source_id", "capture") if cap else "capture"
        if value.startswith("$knowledge"):
            knowledge = [b for b in blocks if b.name == "knowledge"]
            needle = value.partition(":")[2].lower()
            for b in knowledge:
                if not needle or needle in b.attrs.get("title", "").lower():
                    return b.attrs.get("source_id", "knowledge")
            return "knowledge-missing"
        m = _DUE.match(value)
        if m:
            return self._resolve_due(int(m.group(1)))
        return value

    async def _complete(
        self, *, step: EngineStep, model: str, system: str, turns: list[Turn],
        schema: type[BaseModel], timeout_ms: int,
    ) -> str:
        key = step.value
        item = "$default"
        if self._queues[key]:
            item = self._queues[key].popleft()
        elif key in self._then:
            item = self._then[key]
        if item == "$default":
            return await super()._complete(
                step=step, model=model, system=system, turns=turns, schema=schema, timeout_ms=timeout_ms
            )
        self.calls.append(_call(step, model, system, turns, timeout_ms))  # same accounting as FakeLlm
        if isinstance(item, dict) and "$fail" in item:
            raise LlmFailure(LlmErrorKind(item["$fail"]), "scripted failure")
        if isinstance(item, dict) and "$raw" in item:
            return str(item["$raw"])
        return json.dumps(self._subst(item, turns[0].text))


def _call(step, model, system, turns, timeout_ms):  # type: ignore[no-untyped-def]
    from ritme_ai.llm.fake import FakeCall

    return FakeCall(step, model, system, tuple(turns), timeout_ms)


def build_gateway(llm: FakeLlm):  # type: ignore[no-untyped-def]
    """The real backend adapter, with its model replaced by `llm`."""
    from app.engine_adapter import RitmeAiEngine

    class EvalEngine(RitmeAiEngine):
        def __init__(self) -> None:
            super().__init__()  # LLM_PROVIDER=fake
            self.llm = llm
            self._engine = Engine(llm, timeout_ms=30_000)

    return EvalEngine()

