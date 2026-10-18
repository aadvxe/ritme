"""replan ("Something changed"): propose a revised plan; code enforces blast radius and diff."""

from __future__ import annotations

from ritme_contracts import EngineStep, ReplanInput, StepMeta, WorkflowPlanDraft

from ..blocks import render_block, render_json_block
from ..guards.replan import apply_replan_guards
from ..llm.base import LlmAdapter
from ..schemas import ReplanModelOutput
from .base import call_llm, make_meta
from .plan import plan_parameters, state_payload


def build_blocks(inp: ReplanInput) -> list[str]:
    blocks = [
        render_json_block("workflow_state", state_payload(inp)),
        render_json_block("current_plan", inp.current_plan.model_dump(mode="json", by_alias=True)),
    ]
    if inp.new_text:
        blocks.append(render_block("new_text", inp.new_text))
    for c in inp.knowledge:
        blocks.append(
            render_block(
                "knowledge", c.excerpt, source_id=c.source_id, chunk_id=c.chunk_id, title=c.title
            )
        )
    return blocks


async def run(
    llm: LlmAdapter, inp: ReplanInput, timeout_ms: int
) -> tuple[WorkflowPlanDraft, StepMeta]:
    params = plan_parameters(inp)
    params.update(
        trigger=inp.trigger.value,
        changed_requirement_id=inp.changed_requirement_id,
        new_due_at=inp.new_due_at,
        blast_radius_task_ids=inp.blast_radius_task_ids,
    )

    def validate(out: ReplanModelOutput) -> None:
        apply_replan_guards(out, inp)

    value, prompt_version, gen = await call_llm(
        llm,
        step=EngineStep.REPLAN,
        parameters=params,
        blocks=build_blocks(inp),
        schema=ReplanModelOutput,
        timeout_ms=timeout_ms,
        validate=validate,
    )
    return apply_replan_guards(value, inp), make_meta(EngineStep.REPLAN, prompt_version, gen)
