import type { Citation } from "@ritme/api-client";
import { Link } from "react-router-dom";
import { Section } from "@/components/ui/page";
import { formatDateOnly } from "@/lib/dates";
import { s } from "@/i18n";

const S = s.canvas.sources;

function CitationItem({ c }: { c: Citation }) {
  return (
    <li className="rounded-xl border border-border p-3" data-testid="source-item">
      <p className="text-sm font-medium text-navy">{c.title}</p>
      <p className="text-xs text-text-secondary">
        {c.sourceDate && S.date(formatDateOnly(c.sourceDate))}
        {c.sourceDate && c.location && " · "}
        {c.location && S.location(c.location)}
      </p>
      <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 text-sm italic text-text">“{c.excerpt}”</blockquote>
    </li>
  );
}

/** F24: capture source and knowledge citations; says so when nothing in the user's documents supports a claim. */
export function SourcesPanel({ sources }: { sources: Citation[] }) {
  const captures = sources.filter((x) => x.sourceKind === "capture");
  const knowledge = sources.filter((x) => x.sourceKind === "knowledge");
  return (
    <Section title={s.canvas.headings.sources} description={S.intro} id="sources">
      {sources.length === 0 ? (
        <p className="text-sm text-text-secondary">{S.empty}</p>
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-navy">{S.capture}</h3>
            {captures.length === 0 ? <p className="text-sm text-text-secondary">{S.empty}</p> : <ul className="space-y-2">{captures.map((c) => <CitationItem key={`${c.sourceId}-${c.chunkId}`} c={c} />)}</ul>}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-navy">{S.knowledge}</h3>
            {knowledge.length === 0 ? (
              <p className="rounded-xl bg-background p-3 text-sm text-text-secondary" data-testid="source-ungrounded">
                {S.ungrounded}
              </p>
            ) : (
              <ul className="space-y-2">
                {knowledge.map((c) => (
                  <CitationItem key={`${c.sourceId}-${c.chunkId}`} c={c} />
                ))}
              </ul>
            )}
          </div>
          <Link to="/guidelines" className="text-sm font-medium text-primary-strong hover:underline">
            {S.openLibrary}
          </Link>
        </div>
      )}
    </Section>
  );
}
