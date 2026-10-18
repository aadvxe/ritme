import type { ProposedActionOut, ProposedChange } from "@ritme/api-client";

export interface CreatePreviewTask {
  title: string;
  definitionOfDone: string;
  estimatedMinutes: number | null;
  dueAt: string | null;
  dependsOnTitles: string[];
}
export interface UpdatePreviewRow {
  title: string;
  beforeDue: string | null;
  afterDue: string | null;
  reason: string | null;
}
export type ApprovalPreview =
  | { kind: "create"; tasks: CreatePreviewTask[] }
  | { kind: "update"; rows: UpdatePreviewRow[]; newDeadline: string | null | undefined }
  | { kind: "raw"; json: string };

const asString = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Turns an action payload into exactly what will be written, so the approval card never summarises loosely.
 * Anything this does not recognise is shown as raw JSON rather than hidden.
 */
export function previewOf(action: Pick<ProposedActionOut, "actionType" | "payload">): ApprovalPreview {
  const p = action.payload;
  if (action.actionType === "create_tasks" && Array.isArray(p.tasks)) {
    const drafts = p.tasks as Record<string, unknown>[];
    const titles = new Map(drafts.map((d) => [String(d.draftId), String(d.title)]));
    return {
      kind: "create",
      tasks: drafts.map((d) => ({
        title: String(d.title ?? ""),
        definitionOfDone: String(d.definitionOfDone ?? ""),
        estimatedMinutes: typeof d.estimatedMinutes === "number" ? d.estimatedMinutes : null,
        dueAt: asString(d.dueAt),
        dependsOnTitles: (Array.isArray(d.dependsOnDraftIds) ? (d.dependsOnDraftIds as string[]) : []).map((k) => titles.get(k)).filter(Boolean) as string[],
      })),
    };
  }
  if (action.actionType === "update_tasks") {
    const diff = Array.isArray(p.diff) ? (p.diff as ProposedChange[]) : null;
    const updates = Array.isArray(p.updates) ? (p.updates as Record<string, unknown>[]) : null;
    const rows: UpdatePreviewRow[] = [];
    if (diff) {
      for (const c of diff) {
        if (c.changeType !== "update") continue;
        rows.push({
          title: String((c.after?.title as string | undefined) ?? (c.before?.title as string | undefined) ?? "Task"),
          beforeDue: asString(c.before?.dueAt),
          afterDue: asString(c.after?.dueAt),
          reason: c.reason,
        });
      }
    } else if (updates) {
      for (const u of updates) {
        const before = (u.before ?? {}) as Record<string, unknown>;
        const after = (u.after ?? {}) as Record<string, unknown>;
        rows.push({ title: String(after.title ?? before.title ?? "Task"), beforeDue: asString(before.dueAt), afterDue: asString(after.dueAt), reason: null });
      }
    }
    if (diff || updates) return { kind: "update", rows, newDeadline: "newConfirmedDueAt" in p ? (asString(p.newConfirmedDueAt) ?? null) : undefined };
  }
  return { kind: "raw", json: JSON.stringify(p, null, 2) };
}

/** Actions that still need a decision or a retry, newest first. */
export function actionNeedingAttention(actions: ProposedActionOut[]): ProposedActionOut | null {
  const live = actions.filter((a) => a.status === "pending_approval" || a.status === "approved" || a.status === "failed" || a.status === "executing");
  live.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return live[0] ?? null;
}

export function latestSucceeded(actions: ProposedActionOut[]): ProposedActionOut | null {
  const done = actions.filter((a) => a.status === "succeeded");
  done.sort((a, b) => (b.executedAt ?? b.createdAt).localeCompare(a.executedAt ?? a.createdAt));
  return done[0] ?? null;
}
