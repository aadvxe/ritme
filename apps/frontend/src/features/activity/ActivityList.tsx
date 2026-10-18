import type { ActivityEventOut, VerificationState } from "@ritme/api-client";
import { Link } from "react-router-dom";
import { VerificationBadge } from "@/components/ui/status";
import { s } from "@/i18n";
import { formatDateTime, formatUpdated } from "@/lib/dates";

/** Concise summaries and tool outcomes only. Verified/Unverified shows with the real task IDs. */
export function ActivityList({ items, showWorkflowLink }: { items: ActivityEventOut[]; showWorkflowLink?: boolean }) {
  return (
    <ol className="space-y-3">
      {items.map((e) => {
        const verification = (e.details?.verification as VerificationState | undefined) ?? undefined;
        const ids = Array.isArray(e.details?.resultIds) ? (e.details?.resultIds as string[]) : [];
        return (
          <li key={e.id} className="relative border-l-2 border-border pl-4">
            <p className="text-sm text-text">{e.summary}</p>
            <p className="mt-0.5 text-xs text-text-secondary">
              <time dateTime={e.createdAt} title={formatDateTime(e.createdAt)}>
                {formatUpdated(e.createdAt)}
              </time>
              {showWorkflowLink && e.workflowId && (
                <>
                  {" · "}
                  <Link className="font-medium text-primary-strong underline-offset-2 hover:underline" to={`/workflows/${e.workflowId}`}>
                    {s.common.openWorkflowLink}
                  </Link>
                </>
              )}
            </p>
            {verification && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <VerificationBadge state={verification} />
                {ids.length > 0 && (
                  <span className="text-xs text-text-secondary">
                    {s.common.taskIds}: <span className="font-mono">{ids.join(", ")}</span>
                  </span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
