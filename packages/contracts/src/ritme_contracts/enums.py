"""Enums and state names shared by every surface (spec §8.1, §9, §14.3)."""

from enum import StrEnum


class WorkflowStatus(StrEnum):
    CAPTURED = "captured"
    ANALYZING = "analyzing"
    NEEDS_INPUT = "needs_input"
    PLANNING = "planning"
    READY_FOR_APPROVAL = "ready_for_approval"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    BLOCKED = "blocked"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ActionStatus(StrEnum):
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    EXECUTING = "executing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class ActionType(StrEnum):
    CREATE_TASKS = "create_tasks"
    UPDATE_TASKS = "update_tasks"


class VerificationState(StrEnum):
    VERIFIED = "verified"
    UNVERIFIED = "unverified"
    NOT_RUN = "not_run"


class TaskStatus(StrEnum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"
    SKIPPED = "skipped"


class CaptureSourceType(StrEnum):
    BROWSER_SELECTION = "browser_selection"
    MANUAL_TEXT = "manual_text"
    UPLOAD = "upload"
    SEED_DEMO = "seed_demo"


class CaptureStatus(StrEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    ANALYZED = "analyzed"
    FAILED = "failed"
    DELETED = "deleted"


class PlanStatus(StrEnum):
    DRAFT = "draft"
    APPROVED = "approved"
    SUPERSEDED = "superseded"


class PlanAuthor(StrEnum):
    AGENT = "agent"
    USER = "user"


class AgentRunStatus(StrEnum):
    RUNNING = "running"
    WAITING = "waiting"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgentRunTrigger(StrEnum):
    CAPTURE = "capture"
    ANSWER = "answer"
    PLAN = "plan"
    REPLAN = "replan"
    RESUME = "resume"


class Certainty(StrEnum):
    EXPLICIT = "explicit"
    INFERRED = "inferred"
    UNKNOWN = "unknown"
    CONFLICTING = "conflicting"


class RequirementKind(StrEnum):
    OBJECTIVE = "objective"
    DELIVERABLE = "deliverable"
    ACCEPTANCE_CRITERION = "acceptance_criterion"
    DEADLINE = "deadline"
    OWNER = "owner"
    DEPENDENCY = "dependency"
    INSTRUCTION = "instruction"
    FACT = "fact"
    ASSUMPTION = "assumption"
    UNKNOWN = "unknown"
    CONTRADICTION = "contradiction"


class Importance(StrEnum):
    BLOCKING = "blocking"
    USEFUL = "useful"


class QuestionStatus(StrEnum):
    OPEN = "open"
    ANSWERED = "answered"
    DEFERRED = "deferred"


class AnswerDisposition(StrEnum):
    ANSWER = "answer"
    DEFER_NONBLOCKING = "defer_nonblocking"


class ChangeType(StrEnum):
    CREATE = "create"
    UPDATE = "update"
    KEEP = "keep"
    MARK_BLOCKED = "mark_blocked"


class ReplanTrigger(StrEnum):
    REQUEST_CHANGED = "request_changed"
    COULD_NOT_WORK = "could_not_work"


class KnowledgeSourceType(StrEnum):
    USER_TEXT = "user_text"
    USER_MARKDOWN = "user_markdown"
    SEED_DEMO = "seed_demo"


class IngestionStatus(StrEnum):
    PENDING = "pending"
    READY = "ready"
    FAILED = "failed"


class EngineStep(StrEnum):
    EXTRACT = "extract"
    PLAN = "plan"
    REPLAN = "replan"
    DRAFT_CLARIFICATION = "draft_clarification"
    COLLAB_GUIDE = "collab_guide"


# --- Preferences (spec §14.3). Explicit user settings only; never inferred. ---


class TaskGranularity(StrEnum):
    SMALL_STEPS = "small_steps"
    BALANCED = "balanced"
    LARGER_BLOCKS = "larger_blocks"


class InformationDensity(StrEnum):
    CONCISE = "concise"
    BALANCED = "balanced"
    DETAILED = "detailed"


class PlanLayout(StrEnum):
    ONE_STEP = "one_step"
    FULL_LIST = "full_list"
    TIMELINE = "timeline"


class ClarificationHelp(StrEnum):
    SHOW_QUESTIONS = "show_questions"
    DRAFT_MESSAGE = "draft_message"
    INDEPENDENT = "independent"


class CommunicationStyle(StrEnum):
    PRESERVE_MY_VOICE = "preserve_my_voice"
    MAKE_EXPECTATIONS_EXPLICIT = "make_expectations_explicit"
    OFFER_TONE_OPTIONS = "offer_tone_options"


class TimeEstimates(StrEnum):
    SHOW = "show"
    HIDE = "hide"


class PacingSupport(StrEnum):
    OFF = "off"
    OPTIONAL_BREAK_CUES = "optional_break_cues"


class ErrorCode(StrEnum):
    INVALID_INPUT = "invalid_input"
    UNAUTHENTICATED = "unauthenticated"
    FORBIDDEN = "forbidden"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    INVALID_ACTION = "invalid_action"
    RATE_LIMITED = "rate_limited"
    PAYLOAD_TOO_LARGE = "payload_too_large"
    PROVIDER_ERROR = "provider_error"
    INTERNAL = "internal"
