"""extract: captured text -> WorkflowExtraction (known / assumed / missing, with blockers)."""

from __future__ import annotations

from ritme_contracts import EngineStep, ExtractInput, StepMeta, WorkflowExtraction

from ..blocks import render_block, render_json_block
from ..guards.extraction import apply_extraction_guards, check_extraction
from ..guards.transcript import parse_transcript
from ..llm.base import LlmAdapter
from .base import base_parameters, call_llm, make_meta


def build_blocks(inp: ExtractInput) -> list[str]:
    thread = parse_transcript(inp.content_text)
    blocks = [
        render_block(
            "capture",
            inp.content_text,
            source_id=inp.capture_id,
            title=inp.title,
            source_domain=inp.source_domain,
            format="transcript" if thread else None,
            senders=" | ".join(thread.senders) if thread else None,
        )
    ]
    if inp.user_note:
        blocks.append(render_block("user_note", inp.user_note, source_id=inp.capture_id))
    for c in inp.knowledge:
        blocks.append(
            render_block(
                "knowledge", c.excerpt, source_id=c.source_id, chunk_id=c.chunk_id, title=c.title
            )
        )
    if inp.prior is not None:
        blocks.append(
            render_json_block("prior_extraction", inp.prior.model_dump(mode="json", by_alias=True))
        )
    return blocks


async def run(
    llm: LlmAdapter, inp: ExtractInput, timeout_ms: int
) -> tuple[WorkflowExtraction, StepMeta]:
    value, prompt_version, gen = await call_llm(
        llm,
        step=EngineStep.EXTRACT,
        parameters=base_parameters(inp.preferences, inp.context),
        blocks=build_blocks(inp),
        schema=WorkflowExtraction,
        timeout_ms=timeout_ms,
        validate=check_extraction,
    )
    out, _ = apply_extraction_guards(value, inp)
    return out, make_meta(EngineStep.EXTRACT, prompt_version, gen)
