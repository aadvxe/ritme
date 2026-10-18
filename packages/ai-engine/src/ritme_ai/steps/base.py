"""Shared plumbing for steps: build the call, run it, turn failures into EngineError."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pydantic import BaseModel
from ritme_contracts import EngineStep, Preferences, StepContext, StepMeta

from ..blocks import render_untrusted
from ..errors import EngineError
from ..llm.base import LlmAdapter
from ..llm.result import Err, GenerationMeta, Ok
from ..prompts import build_system


def base_parameters(prefs: Preferences, ctx: StepContext) -> dict[str, Any]:
    return {
        "today": ctx.today,
        "timezone": ctx.timezone,
        "locale": ctx.locale,
        "preferences": prefs.model_dump(mode="json"),
    }


async def call_llm[T: BaseModel](
    llm: LlmAdapter,
    *,
    step: EngineStep,
    parameters: dict[str, Any],
    blocks: list[str],
    schema: type[T],
    timeout_ms: int,
    validate: Callable[[T], None] | None = None,
) -> tuple[T, str, GenerationMeta]:
    system, prompt_version = build_system(step.value, parameters)
    result = await llm.generate_structured(
        step=step,
        prompt_version=prompt_version,
        system=system,
        untrusted_input=render_untrusted(blocks),
        schema=schema,
        timeout_ms=timeout_ms,
        validate=validate,
    )
    if isinstance(result, Err):
        raise EngineError(step, result.error)
    assert isinstance(result, Ok)
    return result.value, prompt_version, result.meta


def make_meta(step: EngineStep, prompt_version: str, gen: GenerationMeta) -> StepMeta:
    return StepMeta(
        step=step,
        prompt_version=prompt_version,
        model=gen.model,
        attempts=gen.attempts,
        repaired=gen.repaired,
    )
