"""Ritme AI engine: structured LLM steps, versioned prompts and guards. Stateless, in-process.

Public API: `Engine`, `EngineConfig`, `EngineError`, and `ritme_ai.llm.factory.create_llm`.
`explain_adaptations` returns the plain-language "why the plan looks like this" lines.
"""

from .config import ConfigError, EngineConfig
from .engine import Engine
from .errors import EngineError
from .guards.preferences import explain_adaptations

__all__ = ["ConfigError", "Engine", "EngineConfig", "EngineError", "explain_adaptations"]
