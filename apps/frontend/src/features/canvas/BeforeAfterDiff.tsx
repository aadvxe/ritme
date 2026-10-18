import { Badge } from "@ritme/design";
import type { ProposedChange } from "@ritme/api-client";
import { IconArrowRight } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/dates";
import { s } from "@/i18n";

const C = s.canvas.change;

const str = (o: Record<string, unknown> | null, k: string): string | null => {
  const v = o?.[k];
  return typeof v === "string" ? v : null;
};

function describe(o: Record<string, unknown> | null): string {
  if (!o) return "—";
  const due = str(o, "dueAt");
  const parts: string[] = [];
  if (o.dueAt !== undefined) parts.push(due ? formatDateTime(due) : s.canvas.plan.noDue);
  if (typeof o.note === "string") parts.push(o.note);
  if (typeof o.status === "string") parts.push(o.status.replace(/_/g, " "));
  return parts.length ? parts.join(" · ") : "—";
}

/** A readable Before / After diff with a reason for each change. Completed work is listed as kept. */
export function BeforeAfterDiff({ diff }: { diff: ProposedChange[] }) {
  const changes = diff.filter((d) => d.changeType !== "keep");
  const kept = diff.filter((d) => d.changeType === "keep");
  return (
    <div className="space-y-4" data-testid="diff" role="region" tabIndex={0} aria-label={C.diffTitle}>
      <ul className="space-y-3" data-testid="diff-changes">
        {changes.map((d, i) => (
          <li key={`${d.existingTaskId ?? "new"}-${i}`} className="rounded-xl border border-border bg-surface p-3" data-testid="diff-row">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{C.kinds[d.changeType]}</Badge>
              <p className="text-sm font-medium text-navy">{str(d.after, "title") ?? str(d.before, "title") ?? "Task"}</p>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div className="rounded-lg bg-background p-2 text-sm">
                <p className="text-xs font-semibold text-text-secondary">{s.canvas.approval.before}</p>
                <p className="text-text">{describe(d.before)}</p>
              </div>
              <span className="hidden text-text-secondary sm:block"><IconArrowRight /></span>
              <div className="rounded-lg bg-info/10 p-2 text-sm">
                <p className="text-xs font-semibold text-info-fg">{s.canvas.approval.after}</p>
                <p className="text-text">{describe(d.after)}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              <span className="font-medium">{C.reason}: </span>
              {d.reason}
            </p>
          </li>
        ))}
      </ul>
      {kept.length > 0 && (
        <details className="rounded-xl bg-background p-3" data-testid="diff-kept">
          <summary className="cursor-pointer text-sm font-medium text-navy">
            {C.keepTitle} ({kept.length})
          </summary>
          <ul className="mt-2 space-y-1.5 text-sm text-text-secondary">
            {kept.map((d, i) => (
              <li key={`${d.existingTaskId ?? "n"}-${i}`}>
                <span className="font-medium text-text">{str(d.after, "title") ?? str(d.before, "title") ?? "Task"}</span>: {d.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
