import type { Citation, RequirementItem } from "@ritme/api-client";
import { s } from "@/i18n";

const T = s.canvas.truth;

/** Where an item's evidence came from, in words. */
export function sourceTitleFor(sources: Citation[], sourceId: string, fallback?: string | null): string {
  return sources.find((x) => x.sourceId === sourceId)?.title ?? fallback ?? T.evidence;
}

/** Source excerpts stay readable inline: never hidden in a tooltip. */
export function EvidenceBlock({ r, sources, captureTitle }: { r: RequirementItem; sources: Citation[]; captureTitle: string | null }) {
  if (r.evidence.length === 0) return <p className="text-xs text-text-secondary">{T.noEvidence}</p>;
  return (
    <div className="space-y-2">
      {r.evidence.map((e, i) => (
        <figure key={`${e.sourceId}-${i}`} className="rounded-lg bg-background p-2.5">
          <figcaption className="text-xs font-medium text-text-secondary">{T.evidenceFrom(sourceTitleFor(sources, e.sourceId, captureTitle))}</figcaption>
          <blockquote className="mt-1 border-l-2 border-primary/40 pl-2 text-sm italic text-text">“{e.excerpt}”</blockquote>
        </figure>
      ))}
    </div>
  );
}
