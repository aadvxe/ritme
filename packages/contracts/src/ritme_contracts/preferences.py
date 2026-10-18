"""Working-style preferences (spec §14.3). Explicit settings only — never inferred, never diagnostic."""

from datetime import datetime

from .base import RitmeModel
from .enums import (
    ClarificationHelp,
    CommunicationStyle,
    InformationDensity,
    PacingSupport,
    PlanLayout,
    TaskGranularity,
    TimeEstimates,
)

CONSENT_VERSION = "2026-10-v1"


class Preferences(RitmeModel):
    task_granularity: TaskGranularity = TaskGranularity.BALANCED
    information_density: InformationDensity = InformationDensity.BALANCED
    plan_layout: PlanLayout = PlanLayout.FULL_LIST
    clarification_help: ClarificationHelp = ClarificationHelp.DRAFT_MESSAGE
    communication_style: CommunicationStyle = CommunicationStyle.PRESERVE_MY_VOICE
    time_estimates: TimeEstimates = TimeEstimates.SHOW
    pacing_support: PacingSupport = PacingSupport.OFF


class PreferencesPatch(RitmeModel):
    task_granularity: TaskGranularity | None = None
    information_density: InformationDensity | None = None
    plan_layout: PlanLayout | None = None
    clarification_help: ClarificationHelp | None = None
    communication_style: CommunicationStyle | None = None
    time_estimates: TimeEstimates | None = None
    pacing_support: PacingSupport | None = None


class PreferencesOut(Preferences):
    consent_version: str | None = None
    consent_recorded_at: datetime | None = None
    is_set: bool = False  # false until the user answers anything; defaults are applied meanwhile


class DisplaySettings(RitmeModel):
    """Local presentation settings; not behavioural preferences."""

    text_size: str = "medium"  # small | medium | large
    density: str = "comfortable"  # compact | comfortable
    reduce_motion: str = "system"  # system | on | off
