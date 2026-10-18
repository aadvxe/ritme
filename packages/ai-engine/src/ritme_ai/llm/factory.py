"""Select the adapter from LLM_PROVIDER (fake | vertex)."""

from __future__ import annotations

from importlib import import_module

from ..config import EngineConfig
from .base import LlmAdapter, ModelNames


def create_llm(config: EngineConfig | None = None) -> LlmAdapter:
    cfg = config or EngineConfig.from_env()
    models = ModelNames(fast=cfg.model_fast, plan=cfg.model_plan)
    if cfg.provider == "vertex":
        # Loaded by name on purpose: callers of the engine (the backend) must not reach the LLM SDK
        # through a static import chain, and the SDK is only imported when Vertex is selected.
        vertex = import_module("ritme_ai.llm.vertex")
        return vertex.VertexLlm(project=cfg.project, location=cfg.location, models=models)
    from .fake import FakeLlm

    return FakeLlm(models=models)
