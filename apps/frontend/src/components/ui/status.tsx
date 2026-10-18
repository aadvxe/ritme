import { Badge } from "@ritme/design";
import type { ReactElement } from "react";
import type { ActionStatus, TaskStatus, VerificationState, WorkflowStatus } from "@ritme/api-client";
import { s } from "@/i18n";
import {
  IconAlert,
  IconCheckCircle,
  IconCircle,
  IconClock,
  IconHalfCircle,
  IconInfo,
  IconPause,
  IconQuestion,
  IconShield,
  IconSkip,
  IconXCircle,
} from "./icons";

type Tone = "neutral" | "fact" | "assumption" | "blocker" | "info" | "error";

const WORKFLOW: Record<WorkflowStatus, { tone: Tone; icon: ReactElement }> = {
  captured: { tone: "neutral", icon: <IconCircle /> },
  analyzing: { tone: "info", icon: <IconClock /> },
  needs_input: { tone: "blocker", icon: <IconQuestion /> },
  planning: { tone: "info", icon: <IconInfo /> },
  ready_for_approval: { tone: "assumption", icon: <IconShield /> },
  in_progress: { tone: "info", icon: <IconHalfCircle /> },
  completed: { tone: "fact", icon: <IconCheckCircle /> },
  blocked: { tone: "blocker", icon: <IconAlert /> },
  failed: { tone: "error", icon: <IconXCircle /> },
  cancelled: { tone: "neutral", icon: <IconXCircle /> },
};

/** Status is always icon + word, never colour alone. */
export function WorkflowStatusBadge({ status, paused }: { status: WorkflowStatus; paused?: boolean }) {
  if (paused) {
    return (
      <Badge tone="neutral" icon={<IconPause />}>
        {s.status.paused}
      </Badge>
    );
  }
  const m = WORKFLOW[status];
  return (
    <Badge tone={m.tone} icon={m.icon}>
      {s.status.workflow[status]}
    </Badge>
  );
}

const TASK: Record<TaskStatus, { tone: Tone; icon: ReactElement }> = {
  todo: { tone: "neutral", icon: <IconCircle /> },
  in_progress: { tone: "info", icon: <IconHalfCircle /> },
  blocked: { tone: "blocker", icon: <IconAlert /> },
  done: { tone: "fact", icon: <IconCheckCircle /> },
  skipped: { tone: "neutral", icon: <IconSkip /> },
};

export function TaskStatusBadge({ status }: { status: TaskStatus | string }) {
  const known = status in TASK;
  const key = (known ? status : "todo") as TaskStatus;
  const m = TASK[key];
  return (
    <Badge tone={m.tone} icon={m.icon}>
      {known ? s.status.task[key] : String(status).replace(/_/g, " ")}
    </Badge>
  );
}

/** Calendar items carry either a task status or a workflow status as a plain string. */
export function ItemStatusBadge({ status }: { status: string }) {
  if (status in TASK) return <TaskStatusBadge status={status} />;
  if (status in WORKFLOW) return <WorkflowStatusBadge status={status as WorkflowStatus} />;
  return <Badge tone="neutral">{status.replace(/_/g, " ")}</Badge>;
}

export function ActionStatusBadge({ status }: { status: ActionStatus }) {
  const tone: Tone = status === "succeeded" ? "fact" : status === "failed" ? "error" : status === "rejected" || status === "cancelled" ? "neutral" : "assumption";
  const icon = status === "succeeded" ? <IconCheckCircle /> : status === "failed" ? <IconAlert /> : status === "rejected" || status === "cancelled" ? <IconXCircle /> : <IconShield />;
  return (
    <Badge tone={tone} icon={icon}>
      {s.status.action[status]}
    </Badge>
  );
}

/** Verified only when the server read the tasks back. Anything else says so in words. */
export function VerificationBadge({ state }: { state: VerificationState }) {
  if (state === "verified") {
    return (
      <Badge tone="fact" icon={<IconCheckCircle />}>
        {s.canvas.verify.verified}
      </Badge>
    );
  }
  if (state === "unverified") {
    return (
      <Badge tone="assumption" icon={<IconAlert />}>
        {s.canvas.verify.unverified}
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" icon={<IconCircle />}>
      {s.canvas.verify.notRun}
    </Badge>
  );
}
