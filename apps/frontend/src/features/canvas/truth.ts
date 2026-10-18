import type { ClarificationQuestion, RequirementItem } from "@ritme/api-client";

export type Bucket = "known" | "assumption" | "missing";

/**
 * Which Truth Board column an item belongs in.
 * - Anything the user confirmed is a known fact ("Confirmed by you").
 * - Not stated / conflicting, or an unknown / contradiction, is missing or unclear.
 * - Ritme's own reading (inferred) or an assumption must be confirmed before it can become a fact.
 * - Everything else was stated in the source, so it is known.
 */
export function bucketOf(r: RequirementItem): Bucket {
  if (r.userConfirmedAt) return "known";
  if (r.certainty === "unknown" || r.certainty === "conflicting" || r.kind === "unknown" || r.kind === "contradiction") return "missing";
  if (r.certainty === "inferred" || r.kind === "assumption") return "assumption";
  return "known";
}

export interface MissingCard {
  key: string;
  requirement: RequirementItem | null;
  questions: ClarificationQuestion[];
}

export interface TruthBoardModel {
  known: RequirementItem[];
  assumptions: RequirementItem[];
  missing: MissingCard[];
  openBlocking: number;
}

export function buildTruthBoard(requirements: RequirementItem[], questions: ClarificationQuestion[]): TruthBoardModel {
  const known: RequirementItem[] = [];
  const assumptions: RequirementItem[] = [];
  const missing: MissingCard[] = [];
  const reqIds = new Set(requirements.map((r) => r.id));

  for (const r of requirements) {
    const b = bucketOf(r);
    if (b === "known") known.push(r);
    else if (b === "assumption") assumptions.push(r);
    else missing.push({ key: r.id, requirement: r, questions: questions.filter((q) => q.relatedRequirementIds.includes(r.id)) });
  }

  // Questions that point at no item on the board still get a blocker card of their own.
  for (const q of questions) {
    if (!q.relatedRequirementIds.some((id) => reqIds.has(id))) {
      missing.push({ key: q.id, requirement: null, questions: [q] });
    }
  }

  return {
    known,
    assumptions,
    missing,
    openBlocking: questions.filter((q) => q.blocking && q.status === "open").length,
  };
}
