"""LlmAdapter interface and the shared validate-and-repair loop.

Providers only implement `_complete` (one model call, raw text back). Everything else is shared so
the fake and the real adapter behave identically: JSON parse, Pydantic validation, an optional
semantic `validate` hook, and at most ONE repair retry on invalid output (spec §7).
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, ValidationError
from ritme_contracts import EngineStep

from .result import Err, GenerationMeta, LlmError, LlmErrorKind, LlmFailure, Ok, Result

Validator = Callable[[BaseModel], None]


class LlmAdapter(Protocol):
    async def generate_structured[T: BaseModel](
        self,
        *,
        step: EngineStep,
        prompt_version: str,
        system: str,
        untrusted_input: str,
        schema: type[T],
        timeout_ms: int,
        validate: Callable[[T], None] | None = None,
    ) -> Result[T]:
        """Return a validated `schema` instance or a classified error.

        `system` is policy only. `untrusted_input` holds captured text and retrieved chunks,
        already delimited as data. `validate` may raise ValueError for semantic problems the
        schema cannot express; that counts as invalid output and may trigger the repair retry.
        """
        ...


@dataclass(frozen=True, slots=True)
class Turn:
    role: str  # "user" | "model"
    text: str


@dataclass(frozen=True, slots=True)
class ModelNames:
    fast: str
    plan: str

    def for_step(self, step: EngineStep) -> str:
        return self.plan if step in (EngineStep.PLAN, EngineStep.REPLAN) else self.fast


def describe_validation_error(exc: Exception) -> str:
    """Compact, input-free description (Pydantic's default text echoes the offending values)."""
    if isinstance(exc, ValidationError):
        parts = []
        for e in exc.errors(include_input=False, include_url=False, include_context=False)[:12]:
            loc = ".".join(str(p) for p in e["loc"]) or "(root)"
            parts.append(f"{loc}: {e['msg']}")
        return "; ".join(parts)
    if isinstance(exc, json.JSONDecodeError):
        return "response was not valid JSON"
    return str(exc)[:300]


def _strip_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rsplit("```", 1)[0]
    return text.strip()


class StructuredAdapter:
    """Base class implementing `generate_structured` on top of `_complete`."""

    models: ModelNames

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
        raise NotImplementedError

    async def _attempt(
        self,
        step: EngineStep,
        model: str,
        system: str,
        turns: list[Turn],
        schema: type[BaseModel],
        timeout_ms: int,
    ) -> str:
        try:
            async with asyncio.timeout(timeout_ms / 1000):
                return await self._complete(
                    step=step,
                    model=model,
                    system=system,
                    turns=turns,
                    schema=schema,
                    timeout_ms=timeout_ms,
                )
        except TimeoutError as exc:
            raise LlmFailure(LlmErrorKind.TIMEOUT, "The model call timed out.") from exc

    async def generate_structured[T: BaseModel](
        self,
        *,
        step: EngineStep,
        prompt_version: str,
        system: str,
        untrusted_input: str,
        schema: type[T],
        timeout_ms: int,
        validate: Callable[[T], None] | None = None,
    ) -> Result[T]:
        model = self.models.for_step(step)
        turns = [Turn("user", untrusted_input)]
        problem = ""
        for attempt in (1, 2):
            try:
                raw = await self._attempt(step, model, system, turns, schema, timeout_ms)
            except LlmFailure as failure:
                if failure.kind is not LlmErrorKind.INVALID_OUTPUT:
                    return Err(LlmError(failure.kind, failure.message, attempt))
                raw, problem = "", failure.message
            else:
                try:
                    value = schema.model_validate_json(_strip_fences(raw))
                    if validate is not None:
                        validate(value)
                except (ValidationError, ValueError) as exc:
                    problem = describe_validation_error(exc)
                else:
                    return Ok(value, GenerationMeta(model, attempt, repaired=attempt == 2))
            if attempt == 1:
                turns = [
                    Turn("user", untrusted_input),
                    Turn("model", raw or "(no usable output)"),
                    Turn(
                        "user",
                        "Your previous response was rejected: "
                        f"{problem}. Return the corrected JSON only, following the same schema "
                        "and the same rules. Do not add commentary.",
                    ),
                ]
        return Err(
            LlmError(LlmErrorKind.INVALID_OUTPUT, f"Invalid output after repair: {problem}", 2)
        )
