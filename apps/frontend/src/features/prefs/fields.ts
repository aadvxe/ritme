import type { PreferencesOut, PreferencesPatch } from "@ritme/api-client";
import { s } from "@/i18n";
import type { ChoiceOption } from "@/components/ui/choice";

export const PREF_KEYS = [
  "taskGranularity",
  "planLayout",
  "informationDensity",
  "clarificationHelp",
  "communicationStyle",
  "timeEstimates",
  "pacingSupport",
] as const;
export type PrefKey = (typeof PREF_KEYS)[number];

export interface PrefField {
  key: PrefKey;
  label: string;
  question: string;
  changes: string;
  options: ChoiceOption[];
}

export function prefField(key: PrefKey): PrefField {
  const f = s.prefs.fields[key];
  const options = Object.entries(f.options).map(([value, o]) => ({ value, label: o.label, hint: o.hint }));
  return { key, label: f.label, question: f.question, changes: f.changes, options };
}

export const PREF_FIELDS: PrefField[] = PREF_KEYS.map(prefField);

export function prefValueLabel(key: PrefKey, value: string): string {
  const opts = s.prefs.fields[key].options as Record<string, { label: string }>;
  return opts[value]?.label ?? value;
}

/** Only the seven setting keys, with values checked against what each setting allows. */
export function sanitizePrefs(input: unknown): PreferencesPatch | null {
  if (!input || typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const f of PREF_FIELDS) {
    const v = src[f.key];
    if (typeof v === "string" && f.options.some((o) => o.value === v)) out[f.key] = v;
  }
  return Object.keys(out).length > 0 ? (out as PreferencesPatch) : null;
}

export function exportablePrefs(p: PreferencesOut): Record<string, string | number> {
  const out: Record<string, string | number> = { ritmePreferences: 1 };
  for (const k of PREF_KEYS) out[k] = p[k];
  return out;
}
