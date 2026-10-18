"""plan: confirmed/known requirements -> WorkflowPlanDraft shaped by the user's preferences."""

from __future__ import annotations

from typing import Any

from ritme_contracts import EngineStep, PlanInput, StepMeta, WorkflowPlanDraft

from ..blocks import render_block, render_json_block
from ..guards.plan import apply_plan_guards, check_task_count
from ..guards.preferences import plan_shape
from ..llm.base import LlmAdapter
from ..schemas import PlanModelOutput
from .base import base_parameters, call_llm, make_meta


def state_payload(inp: PlanInput) -> dict[str, Any]:
    """Everything derived from captured text goes into one untrusted block."""
    return {
        "objective": inp.objective,
        "requirements": [
            {
                "id": r.id,
                "kind": r.kind.value,
                "text": r.text,
                "certainty": r.certainty.value,
                "importance": r.importance.value,
                "confirmed": r.user_confirmed_at is not None,
            }
            for r in inp.requirements
        ],
        "questions": [
            {
                "id": q.id,
                "question": q.question,
                "blocking": q.blocking,
                "status": q.status.value,
                "answer": q.answer,
            }
            for q in inp.questions
        ],
        "existing_tasks": [
            {
                "id": t.id,
                "draftId": t.draft_id,
                "title": t.title,
                "status": t.status.value,
                "dueAt": t.due_at,
                "dependsOn": t.depends_on,
            }
            for t in inp.existing_tasks
        ],
    }


def build_blocks(inp: PlanInput) -> list[str]:
    blocks = [render_json_block("workflow_state", state_payload(inp))]
    for c in inp.knowledge:
        blocks.append(
            render_block(
                "knowledge", c.excerpt, source_id=c.source_id, chunk_id=c.chunk_id, title=c.title
            )
        )
    return blocks


def plan_parameters(inp: PlanInput) -> dict[str, Any]:
    params = base_parameters(inp.preferences, inp.context)
    params["plan_shape"] = plan_shape(inp.preferences).as_parameters()
    return params


async def run(
    llm: LlmAdapter, inp: PlanInput, timeout_ms: int
) -> tuple[WorkflowPlanDraft, StepMeta]:
    shape = plan_shape(inp.preferences)

    def validate(out: PlanModelOutput) -> None:
        check_task_count(len(out.tasks), shape)
        apply_plan_guards(out.tasks, out.goal, out.unresolved_items, inp)

    value, prompt_version, gen = await call_llm(
        llm,
        step=EngineStep.PLAN,
        parameters=plan_parameters(inp),
        blocks=build_blocks(inp),
        schema=PlanModelOutput,
        timeout_ms=timeout_ms,
        validate=validate,
    )
    draft = apply_plan_guards(value.tasks, value.goal, value.unresolved_items, inp)
    return draft, make_meta(EngineStep.PLAN, prompt_version, gen)
