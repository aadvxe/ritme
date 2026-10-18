/**
 * Sensitive-domain detection (spec §11/§14.1). This only decides whether to ask for a conscious
 * confirmation before saving; it is a conservative heuristic, not a block and not a guarantee.
 */
export type SensitiveCategory = "health" | "finance" | "hr";

export const CATEGORY_LABEL: Record<SensitiveCategory, string> = {
  health: "health or medical",
  finance: "banking or finance",
  hr: "HR or employee records",
};

interface Rule {
  category: SensitiveCategory;
  /** Matched against the whole hostname, e.g. "my.chasebank.com". */
  pattern: RegExp;
}

const RULES: Rule[] = [
  {
    category: "health",
    pattern:
      /(health|hospital|clinic|medical|medicine|patient|mychart|pharmacy|telehealth|doctor|dental|therapy|halodoc|alodokter)/i,
  },
  {
    category: "finance",
    pattern:
      /(bank|banking|paypal|wise\.com|venmo|brokerage|invest|trading|crypto|binance|coinbase|fidelity|schwab|vanguard|finance|credit|loan|mortgage|insurance|klikbca|bca\.co\.id|bri\.co\.id|bni\.co\.id|ovo\.id|gopay)/i,
  },
  {
    category: "hr",
    pattern:
      /(workday|bamboohr|adp\.com|paychex|paycom|paylocity|gusto|successfactors|ultipro|ukg\.com|kronos|peoplesoft|payroll|hris|talenta|(^|\.)hr\.|(^|\.)hrportal|employee|benefits\.)/i,
  },
];

export function detectSensitive(domain: string | null | undefined): SensitiveCategory | null {
  if (!domain) return null;
  const host = domain.toLowerCase();
  for (const rule of RULES) if (rule.pattern.test(host)) return rule.category;
  return null;
}
