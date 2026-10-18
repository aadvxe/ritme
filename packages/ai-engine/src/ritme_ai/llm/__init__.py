"""LLM adapters. Only this package may import `google.genai` (enforced by import-linter).

Keep this `__init__` free of provider imports: steps/guards import `ritme_ai.llm.base` and must not
pull in the Vertex adapter. Use `ritme_ai.llm.factory.create_llm` to build an adapter.
"""

from .base import LlmAdapter, ModelNames, StructuredAdapter
from .result import Err, GenerationMeta, LlmError, LlmErrorKind, LlmFailure, Ok, Result

__all__ = [
    "Err",
    "GenerationMeta",
    "LlmAdapter",
    "LlmError",
    "LlmErrorKind",
    "LlmFailure",
    "ModelNames",
    "Ok",
    "Result",
    "StructuredAdapter",
]
