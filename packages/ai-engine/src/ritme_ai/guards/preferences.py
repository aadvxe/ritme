# ruff: noqa: E501
"""Preference -> plan mapping (spec §8.4, §14.3).

Preferences are explicit user settings only. They change presentation and size of the plan; nothing
here infers anything about the person. Every adaptation has a plain-language explanation the UI can
show ("Because you selected small steps...").
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ritme_contracts import (
    InformationDensity,
    PlanLayout,
    Preferences,
    TaskGranularity,
    TimeEstimates,
)

from .text import limit_text

_GRANULARITY = {  # max tasks, per-task size hint in minutes (prompt guidance only)
    TaskGranularity.SMALL_STEPS: (10, 25),
    TaskGranularity.BALANCED: (8, 60),
    TaskGranularity.LARGER_BLOCKS: (5, 180),
}
_DENSITY = {  # description chars, rationale chars, summary chars
    InformationDensity.CONCISE: (160, 100, 240),
    InformationDensity.BALANCED: (400, 240, 600),
    InformationDensity.DETAILED: (1000, 600, 1500),
}
_ESTIMATE = re.compile(
    r"\s*[(\[]?\s*(?:~|about|around|approx\.?|approximately|roughly)?\s*\d+(?:\s*[-–]\s*\d+)?\s*"
    r"(?:min(?:ute)?s?|hrs?|hours?)\b\s*[)\]]?",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class PlanShape:
    max_tasks: int
    size_hint_minutes: int
    description_limit: int
    rationale_limit: int
    summary_limit: int
    show_estimates: bool
    layout: PlanLayout
    granularity: TaskGranularity
    density: InformationDensity

    def as_parameters(self) -> dict[str, object]:
        return {
            "max_tasks": self.max_tasks,
            "target_task_size_minutes": self.size_hint_minutes,
            "description_max_chars": self.description_limit,
            "rationale_max_chars": self.rationale_limit,
            "include_time_estimates": self.show_estimates,
            "task_granularity": self.granularity.value,
            "information_density": self.density.value,
            "plan_layout": self.layout.value,
        }


def plan_shape(prefs: Preferences) -> PlanShape:
    max_tasks, minutes = _GRANULARITY[prefs.task_granularity]
    desc, why, summary = _DENSITY[prefs.information_density]
    return PlanShape(
        max_tasks=max_tasks,
        size_hint_minutes=minutes,
        description_limit=desc,
        rationale_limit=why,
        summary_limit=summary,
        show_estimates=prefs.time_estimates is TimeEstimates.SHOW,
        layout=prefs.plan_layout,
        granularity=prefs.task_granularity,
        density=prefs.information_density,
    )


def summary_limit(prefs: Preferences) -> int:
    return _DENSITY[prefs.information_density][2]


def strip_time_estimates(text: str) -> str:
    """Remove "(about 20 minutes)" style phrases when the user chose to hide estimates."""
    cleaned = _ESTIMATE.sub("", text)
    return re.sub(r"\s{2,}", " ", cleaned).strip(" ,;:-")


def apply_density(text: str, limit: int) -> str:
    return limit_text(text, limit)


def explain_adaptations(prefs: Preferences) -> list[str]:
    """Plain-language reasons the plan looks the way it does (shown next to the plan)."""
    out = {
        TaskGranularity.SMALL_STEPS: "Because you selected small steps, tasks are presented as shorter actions.",
        TaskGranularity.BALANCED: "Because you selected balanced steps, tasks are medium-sized.",
        TaskGranularity.LARGER_BLOCKS: "Because you selected larger blocks, related work is grouped into fewer tasks.",
    }[prefs.task_granularity]
    lines = [out]
    lines.append(
        {
            InformationDensity.CONCISE: "Because you selected concise text, descriptions are kept short.",
            InformationDensity.BALANCED: "Because you selected balanced detail, descriptions are brief with some context.",
            InformationDensity.DETAILED: "Because you selected detailed text, tasks include more context.",
        }[prefs.information_density]
    )
    lines.append(
        {
            PlanLayout.ONE_STEP: "Because you selected one step at a time, the plan opens on a single next step.",
            PlanLayout.FULL_LIST: "Because you selected the full list, the plan opens as a checklist.",
            PlanLayout.TIMELINE: "Because you selected the timeline, the plan opens in timeline view; only confirmed dates are placed on it.",
        }[prefs.plan_layout]
    )
    lines.append(
        "Because you chose to show time estimates, estimates are labelled as estimates."
        if prefs.time_estimates is TimeEstimates.SHOW
        else "Because you chose to hide time estimates, no durations are shown."
    )
    return lines
