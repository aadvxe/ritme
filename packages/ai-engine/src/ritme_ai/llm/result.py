"""Result type and classified errors returned by every LLM adapter."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class LlmErrorKind(StrEnum):
    TIMEOUT = "timeout"
    RATE_LIMIT = "rate_limit"
    INVALID_OUTPUT = "invalid_output"
    PROVIDER = "provider"


@dataclass(frozen=True, slots=True)
class LlmError:
    """A classified failure. `message` is generic: never source text or raw provider text."""

    kind: LlmErrorKind
    message: str
    attempts: int = 1

    @property
    def retryable(self) -> bool:
        return self.kind in (LlmErrorKind.TIMEOUT, LlmErrorKind.RATE_LIMIT, LlmErrorKind.PROVIDER)


@dataclass(frozen=True, slots=True)
class GenerationMeta:
    model: str
    attempts: int = 1
    repaired: bool = False


@dataclass(frozen=True, slots=True)
class Ok[T]:
    value: T
    meta: GenerationMeta


@dataclass(frozen=True, slots=True)
class Err:
    error: LlmError


type Result[T] = Ok[T] | Err


class LlmFailure(Exception):
    """Raised by provider-specific `_complete` implementations; carries the classified kind."""

    def __init__(self, kind: LlmErrorKind, message: str) -> None:
        super().__init__(message)
        self.kind = kind
        self.message = message
