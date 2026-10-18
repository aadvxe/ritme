"""Gemini on Vertex AI through google-genai.

Mirrors the portfolio's gcp.ts pattern: ONE cached client, Vertex mode, project + location from
env, Application Default Credentials, temperature 0.2. Deliberately NOT copied: API-key fallback,
service-account JSON in env, raw provider errors surfaced to callers, JSON-in-prompt parsing,
missing timeouts.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel
from ritme_contracts import EngineStep

from .base import ModelNames, StructuredAdapter, Turn
from .result import LlmErrorKind, LlmFailure

log = logging.getLogger("ritme_ai.llm.vertex")

TEMPERATURE = 0.2
_CLOUD_PLATFORM = "https://www.googleapis.com/auth/cloud-platform"
_clients: dict[tuple[str, str], Any] = {}


def _build_client(project: str, location: str) -> Any:
    import google.auth
    from google import genai

    # Explicit ADC credentials: they take precedence over any API-key environment variable, so
    # this adapter can never fall into API-key (express) mode.
    credentials, _ = google.auth.default(scopes=[_CLOUD_PLATFORM])
    return genai.Client(vertexai=True, project=project, location=location, credentials=credentials)


def get_client(project: str, location: str) -> Any:
    """One cached client per (project, location)."""
    key = (project, location)
    if key not in _clients:
        _clients[key] = _build_client(project, location)
    return _clients[key]


def classify_exception(exc: BaseException) -> LlmFailure:
    """Map a provider/transport exception to a generic classified failure (no raw text kept)."""
    names = {c.__name__ for c in type(exc).__mro__}
    code = getattr(exc, "code", None)
    if isinstance(exc, TimeoutError) or names & {
        "TimeoutException",
        "ReadTimeout",
        "ConnectTimeout",
        "DeadlineExceeded",
    }:
        return LlmFailure(LlmErrorKind.TIMEOUT, "The model call timed out.")
    if isinstance(code, int):
        if code == 429:
            return LlmFailure(LlmErrorKind.RATE_LIMIT, "The model provider rate-limited the call.")
        if code in (408, 504):
            return LlmFailure(LlmErrorKind.TIMEOUT, "The model call timed out.")
        return LlmFailure(LlmErrorKind.PROVIDER, f"The model provider returned an error ({code}).")
    if "ResourceExhausted" in names or "TooManyRequests" in names:
        return LlmFailure(LlmErrorKind.RATE_LIMIT, "The model provider rate-limited the call.")
    if "DefaultCredentialsError" in names:
        return LlmFailure(
            LlmErrorKind.PROVIDER, "Application Default Credentials are not available."
        )
    return LlmFailure(LlmErrorKind.PROVIDER, f"The model call failed ({type(exc).__name__}).")


class VertexLlm(StructuredAdapter):
    def __init__(
        self,
        *,
        project: str,
        location: str,
        models: ModelNames,
        client_factory: Callable[[str, str], Any] = get_client,
    ) -> None:
        self.project = project
        self.location = location
        self.models = models
        self._client_factory = client_factory

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
        from google.genai import types

        try:
            client = self._client_factory(self.project, self.location)
            response = await client.aio.models.generate_content(
                model=model,
                contents=[
                    types.Content(role=t.role, parts=[types.Part(text=t.text)]) for t in turns
                ],
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    temperature=TEMPERATURE,
                    response_mime_type="application/json",
                    response_schema=schema,
                    http_options=types.HttpOptions(timeout=timeout_ms),
                ),
            )
        except LlmFailure:
            raise
        except Exception as exc:  # classified, never re-raised with provider text
            failure = classify_exception(exc)
            log.warning("vertex call failed: kind=%s type=%s", failure.kind, type(exc).__name__)
            raise failure from None
        text = getattr(response, "text", None)
        if not text or not text.strip():
            raise LlmFailure(LlmErrorKind.INVALID_OUTPUT, "The model returned an empty response.")
        return text
