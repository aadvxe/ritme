"""Adapter contract: schema validation, one repair retry, error classification, config."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from pydantic import BaseModel
from ritme_ai.config import ConfigError, EngineConfig
from ritme_ai.llm.base import ModelNames
from ritme_ai.llm.factory import create_llm
from ritme_ai.llm.fake import FakeLlm
from ritme_ai.llm.result import Err, LlmErrorKind, LlmFailure, Ok
from ritme_ai.llm.vertex import VertexLlm, classify_exception
from ritme_contracts import EngineStep, WorkflowExtraction


class Tiny(BaseModel):
    n: int


async def gen(llm, schema=Tiny, validate=None, timeout_ms=1000):
    return await llm.generate_structured(
        step=EngineStep.EXTRACT,
        prompt_version="t.v1",
        system="policy",
        untrusted_input="data",
        schema=schema,
        timeout_ms=timeout_ms,
        validate=validate,
    )


async def test_valid_output_first_try():
    llm = FakeLlm().script(EngineStep.EXTRACT, '{"n": 3}')
    res = await gen(llm)
    assert isinstance(res, Ok) and res.value.n == 3
    assert (res.meta.attempts, res.meta.repaired, res.meta.model) == (1, False, "fake-fast")


async def test_models_come_from_step():
    llm = FakeLlm(models=ModelNames(fast="f", plan="p"))
    llm.script(EngineStep.PLAN, '{"n": 1}')
    res = await llm.generate_structured(
        step=EngineStep.PLAN, prompt_version="x", system="s", untrusted_input="u",
        schema=Tiny, timeout_ms=100,
    )  # fmt: skip
    assert isinstance(res, Ok) and res.meta.model == "p"


async def test_repair_retry_succeeds_once():
    llm = FakeLlm().script(EngineStep.EXTRACT, "not json", '{"n": 7}')
    res = await gen(llm)
    assert isinstance(res, Ok) and res.value.n == 7
    assert res.meta.attempts == 2 and res.meta.repaired is True
    first, second = llm.calls
    assert len(first.turns) == 1
    assert [t.role for t in second.turns] == ["user", "model", "user"]
    assert "rejected" in second.turns[2].text


async def test_at_most_one_repair_retry():
    llm = FakeLlm().script(EngineStep.EXTRACT, "bad", "still bad", '{"n": 1}')
    res = await gen(llm)
    assert isinstance(res, Err)
    assert res.error.kind is LlmErrorKind.INVALID_OUTPUT
    assert res.error.attempts == 2
    assert len(llm.calls) == 2  # the third scripted item is never consumed


async def test_semantic_validate_hook_triggers_repair():
    def must_be_even(v: Tiny) -> None:
        if v.n % 2:
            raise ValueError("n must be even")

    llm = FakeLlm().script(EngineStep.EXTRACT, '{"n": 3}', '{"n": 4}')
    res = await gen(llm, validate=must_be_even)
    assert isinstance(res, Ok) and res.value.n == 4 and res.meta.repaired


async def test_code_fences_are_tolerated():
    llm = FakeLlm().script(EngineStep.EXTRACT, '```json\n{"n": 2}\n```')
    res = await gen(llm)
    assert isinstance(res, Ok) and res.value.n == 2


async def test_validation_error_text_never_echoes_input():
    secret = "SECRET-CAPTURE-TEXT"
    bad = f'{{"n": "{secret}"}}'
    llm = FakeLlm().script(EngineStep.EXTRACT, bad, bad)
    res = await gen(llm)
    assert isinstance(res, Err)
    assert secret not in res.error.message
    assert all(secret not in t.text for t in llm.calls[1].turns[2:])


async def test_schema_failure_explicit_requires_evidence():
    payload = (
        '{"suggestedTitle":"t","objective":"o","summary":"s","questions":[],'
        '"requirements":[{"id":"r1","kind":"fact","text":"x","certainty":"explicit",'
        '"importance":"useful","evidence":[]}]}'
    )
    llm = FakeLlm().script(EngineStep.EXTRACT, payload, payload)
    res = await gen(llm, schema=WorkflowExtraction)
    assert isinstance(res, Err) and res.error.kind is LlmErrorKind.INVALID_OUTPUT


@pytest.mark.parametrize(
    "failure,kind",
    [
        (LlmFailure(LlmErrorKind.TIMEOUT, "t"), LlmErrorKind.TIMEOUT),
        (LlmFailure(LlmErrorKind.RATE_LIMIT, "r"), LlmErrorKind.RATE_LIMIT),
        (LlmFailure(LlmErrorKind.PROVIDER, "p"), LlmErrorKind.PROVIDER),
    ],
)
async def test_non_output_failures_are_not_retried(failure, kind):
    llm = FakeLlm().script(EngineStep.EXTRACT, failure, '{"n": 1}')
    res = await gen(llm)
    assert isinstance(res, Err) and res.error.kind is kind
    assert len(llm.calls) == 1


async def test_per_call_timeout_is_enforced():
    class Slow(FakeLlm):
        async def _complete(self, **kw):
            await asyncio.sleep(1)
            return '{"n": 1}'

    res = await gen(Slow(), timeout_ms=20)
    assert isinstance(res, Err) and res.error.kind is LlmErrorKind.TIMEOUT
    assert res.error.retryable


def test_error_retryability():
    from ritme_ai.llm.result import LlmError

    assert not LlmError(LlmErrorKind.INVALID_OUTPUT, "x").retryable
    assert LlmError(LlmErrorKind.RATE_LIMIT, "x").retryable


# ---------------------------------------------------------------- vertex adapter (no network)


class ClientError(Exception):  # same shape as google.genai.errors.ClientError
    def __init__(self, code: int):
        super().__init__("provider said: PRIVATE DETAILS")
        self.code = code


class ReadTimeout(Exception):
    pass


@pytest.mark.parametrize(
    "exc,kind",
    [
        (ClientError(429), LlmErrorKind.RATE_LIMIT),
        (ClientError(504), LlmErrorKind.TIMEOUT),
        (ClientError(400), LlmErrorKind.PROVIDER),
        (ClientError(503), LlmErrorKind.PROVIDER),
        (ReadTimeout(), LlmErrorKind.TIMEOUT),
        (TimeoutError(), LlmErrorKind.TIMEOUT),
        (RuntimeError("boom"), LlmErrorKind.PROVIDER),
    ],
)
def test_vertex_error_classification(exc, kind):
    failure = classify_exception(exc)
    assert failure.kind is kind
    assert "PRIVATE DETAILS" not in failure.message and "boom" not in failure.message


class _FakeModels:
    def __init__(self, outcome):
        self.outcome, self.calls = outcome, []

    async def generate_content(self, **kw):
        self.calls.append(kw)
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return SimpleNamespace(text=self.outcome)


def _vertex(outcome):
    models = _FakeModels(outcome)
    client = SimpleNamespace(aio=SimpleNamespace(models=models))
    llm = VertexLlm(
        project="p", location="us-central1", models=ModelNames("fast-m", "plan-m"),
        client_factory=lambda project, location: client,
    )  # fmt: skip
    return llm, models


async def test_vertex_sends_schema_system_timeout_and_temperature():
    llm, models = _vertex('{"n": 5}')
    res = await gen(llm, timeout_ms=4321)
    assert isinstance(res, Ok) and res.value.n == 5 and res.meta.model == "fast-m"
    call = models.calls[0]
    cfg = call["config"]
    assert call["model"] == "fast-m"
    assert cfg.response_schema is Tiny
    assert cfg.response_mime_type == "application/json"
    assert cfg.system_instruction == "policy"
    assert cfg.temperature == 0.2
    assert cfg.http_options.timeout == 4321
    assert call["contents"][0].parts[0].text == "data"


async def test_vertex_classifies_provider_errors():
    llm, _ = _vertex(ClientError(429))
    res = await gen(llm)
    assert isinstance(res, Err) and res.error.kind is LlmErrorKind.RATE_LIMIT


async def test_vertex_empty_response_is_invalid_output_with_one_repair():
    llm, models = _vertex("")
    res = await gen(llm)
    assert isinstance(res, Err) and res.error.kind is LlmErrorKind.INVALID_OUTPUT
    assert len(models.calls) == 2


# ---------------------------------------------------------------- config / factory


def test_config_defaults_to_fake():
    cfg = EngineConfig.from_env({})
    assert cfg.provider == "fake" and cfg.timeout_ms == 30000
    assert isinstance(create_llm(cfg), FakeLlm)


def test_config_reads_env_names():
    cfg = EngineConfig.from_env(
        {
            "LLM_PROVIDER": "vertex",
            "GCP_PROJECT_ID": "proj",
            "VERTEX_LOCATION": "europe-west4",
            "LLM_MODEL_FAST": "fast-x",
            "LLM_MODEL_PLAN": "plan-x",
            "LLM_TIMEOUT_MS": "1500",
        }
    )
    assert (cfg.project, cfg.location, cfg.model_fast, cfg.model_plan, cfg.timeout_ms) == (
        "proj", "europe-west4", "fast-x", "plan-x", 1500,
    )  # fmt: skip
    llm = create_llm(cfg)
    assert isinstance(llm, VertexLlm) and llm.models.plan == "plan-x"


@pytest.mark.parametrize(
    "env",
    [
        {"LLM_PROVIDER": "vertex"},  # no project
        {"LLM_PROVIDER": "openai"},
        {"LLM_TIMEOUT_MS": "abc"},
        {"LLM_TIMEOUT_MS": "0"},
    ],
)
def test_config_rejects_bad_env(env):
    with pytest.raises(ConfigError):
        EngineConfig.from_env(env)
