import type { ProposedActionOut } from "@ritme/api-client";
import { VerificationBadge } from "@/components/ui/status";
import { s } from "@/i18n";

const V = s.canvas.verify;

/** Verified only when the server read the records back. Otherwise it says Unverified, in words. */
export function VerifiedSummary({ action }: { action: ProposedActionOut }) {
  const ids = action.resultIds;
  return (
    <div
      className="rounded-xl border border-border bg-background p-3"
      data-testid="verified-summary"
      data-verification={action.verification}
    >
      <div className="flex flex-wrap items-center gap-2">
        <VerificationBadge state={action.verification} />
        <span className="text-sm text-text">
          {action.verification === "verified" ? V.verifiedBody(ids.length) : action.verification === "unverified" ? V.unverifiedBody : action.resultSummary}
        </span>
      </div>
      {action.resultSummary && action.verification === "verified" && (
        <p className="mt-1 text-xs text-text-secondary">
          {V.resultSummary}: {action.resultSummary}
        </p>
      )}
      {ids.length > 0 && (
        <p className="mt-2 text-xs text-text-secondary">
          <span className="font-medium">{action.verification === "verified" ? V.idsHeading : V.ids}: </span>
          <span className="break-all font-mono" data-testid="verified-ids">
            {ids.join(", ")}
          </span>
        </p>
      )}
    </div>
  );
}
