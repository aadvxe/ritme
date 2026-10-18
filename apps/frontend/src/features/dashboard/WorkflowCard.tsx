import { Badge } from "@ritme/design";
import type { WorkflowSummary } from "@ritme/api-client";
import { Link } from "react-router-dom";
import { WorkflowStatusBadge } from "@/components/ui/status";
import { IconArrowRight, IconCalendar } from "@/components/ui/icons";
import { formatDateTime, formatUpdated } from "@/lib/dates";
import { s } from "@/i18n";

/** Title, outcome, status, next action, confirmed deadline only when known, last updated. */
export function WorkflowCard({ wf }: { wf: WorkflowSummary }) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-5 shadow-card transition-shadow hover:shadow-popover" data-testid="workflow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-base font-semibold text-navy">
          <Link to={`/workflows/${wf.id}`} className="hover:underline">
            {wf.title}
          </Link>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {wf.isDemo && <Badge tone="info">{s.common.demo}</Badge>}
          <WorkflowStatusBadge status={wf.status} paused={wf.paused} />
        </div>
      </div>
      {wf.objective && <p className="mt-2 text-sm text-text-secondary">{wf.objective}</p>}
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-text-secondary">{s.workflowCard.nextAction}</dt>
          <dd className="flex items-start gap-1.5 text-text">
            <span className="mt-0.5 text-primary-strong"><IconArrowRight /></span>
            {wf.nextAction ?? s.dashboard.noNextAction}
          </dd>
        </div>
        {wf.confirmedDueAt && (
          <div>
            <dt className="text-xs font-medium text-text-secondary">Deadline</dt>
            <dd className="flex items-start gap-1.5 text-text">
              <span className="mt-0.5 text-primary-strong"><IconCalendar /></span>
              {formatDateTime(wf.confirmedDueAt)}
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-xs text-text-secondary">{s.common.updated(formatUpdated(wf.updatedAt))}</p>
    </article>
  );
}
