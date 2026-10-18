"""Structured logging with a field allowlist (spec §5/§11).

Never log request bodies, captured text, preferences, tokens or prompts. Only the keys in
ALLOWED_FIELDS survive; everything else is dropped by the processor, even if a caller passes it.
"""

from __future__ import annotations

import logging
import sys
from contextvars import ContextVar
from typing import Any

import structlog

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

ALLOWED_FIELDS = frozenset(
    {
        "event", "level", "timestamp", "request_id", "route", "method", "status", "duration_ms",
        "error_code", "error_type", "workflow_id", "action_id", "run_id", "capture_id",
        "step", "prompt_version", "model", "role", "environment",
    }
)


def _allowlist(_: Any, __: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in event_dict.items() if k in ALLOWED_FIELDS}


def _add_request_id(_: Any, __: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    event_dict.setdefault("request_id", request_id_var.get())
    return event_dict


def configure_logging(level: str = "info") -> None:
    logging.basicConfig(stream=sys.stdout, level=level.upper(), format="%(message)s")
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", key="timestamp"),
            _add_request_id,
            _allowlist,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level.upper())),
        cache_logger_on_first_use=False,
    )


def get_logger() -> Any:
    return structlog.get_logger()
