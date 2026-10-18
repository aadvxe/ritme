"""Engine configuration from environment variable NAMES documented in the root .env.example."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass

DEFAULT_MODEL = "gemini-3.1-flash-lite"
DEFAULT_LOCATION = "us-central1"
DEFAULT_TIMEOUT_MS = 30_000


class ConfigError(ValueError):
    """Raised when the environment cannot configure the requested provider."""


@dataclass(frozen=True, slots=True)
class EngineConfig:
    provider: str = "fake"  # fake | vertex
    project: str | None = None  # GCP_PROJECT_ID
    location: str = DEFAULT_LOCATION  # VERTEX_LOCATION (where inference runs)
    model_fast: str = DEFAULT_MODEL  # LLM_MODEL_FAST: extract, draft_clarification, collab_guide
    model_plan: str = DEFAULT_MODEL  # LLM_MODEL_PLAN: plan, replan
    timeout_ms: int = DEFAULT_TIMEOUT_MS  # LLM_TIMEOUT_MS, per model call

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> EngineConfig:
        e = os.environ if env is None else env

        def get(name: str, default: str) -> str:
            value = (e.get(name) or "").strip()
            return value or default

        provider = get("LLM_PROVIDER", "fake").lower()
        if provider not in ("fake", "vertex"):
            raise ConfigError("LLM_PROVIDER must be 'fake' or 'vertex'")
        try:
            timeout_ms = int(get("LLM_TIMEOUT_MS", str(DEFAULT_TIMEOUT_MS)))
        except ValueError as exc:
            raise ConfigError("LLM_TIMEOUT_MS must be an integer") from exc
        if timeout_ms <= 0:
            raise ConfigError("LLM_TIMEOUT_MS must be positive")
        project = (e.get("GCP_PROJECT_ID") or "").strip() or None
        if provider == "vertex" and not project:
            raise ConfigError("GCP_PROJECT_ID is required when LLM_PROVIDER=vertex")
        return cls(
            provider=provider,
            project=project,
            location=get("VERTEX_LOCATION", DEFAULT_LOCATION),
            model_fast=get("LLM_MODEL_FAST", DEFAULT_MODEL),
            model_plan=get("LLM_MODEL_PLAN", DEFAULT_MODEL),
            timeout_ms=timeout_ms,
        )
