"""Versioned prompt templates (Markdown files next to this module).

The system prompt is policy only: the shared policy, one step prompt, and a `<parameters>` JSON
block with trusted values. It never contains captured text, notes or retrieved chunks.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache
from importlib import resources
from typing import Any

from ..blocks import render_parameters

POLICY_VERSION = "v1"


@dataclass(frozen=True, slots=True)
class Prompt:
    name: str
    version: str
    text: str

    @property
    def id(self) -> str:
        """The value stored on every agent run, e.g. "extract.v1"."""
        return f"{self.name}.{self.version}"


@cache
def _read(filename: str) -> str:
    return resources.files(__package__).joinpath(filename).read_text(encoding="utf-8")


def load_prompt(name: str, version: str = "v1") -> Prompt:
    body = _read(f"{name}.{version}.md")
    return Prompt(name, version, body)


def build_system(name: str, parameters: dict[str, Any], version: str = "v1") -> tuple[str, str]:
    """Return (system prompt, prompt version id). `parameters` must hold trusted values only."""
    policy = _read(f"policy.{POLICY_VERSION}.md")
    step = load_prompt(name, version)
    system = f"{policy}\n\n{step.text}\n\n## Parameters\n\n{render_parameters(parameters)}\n"
    return system, step.id
