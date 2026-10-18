import { Alert, Button, Skeleton, Textarea, toast } from "@ritme/design";
import type { PreferencesOut, PreferencesPatch } from "@ritme/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ChoiceGroup } from "@/components/ui/choice";
import { ConfirmDialog, QueryBoundary } from "@/components/ui/feedback";
import { IconDownload, IconUpload } from "@/components/ui/icons";
import { Section } from "@/components/ui/page";
import { PREF_FIELDS, exportablePrefs, sanitizePrefs, type PrefKey } from "@/features/prefs/fields";
import { formatDateTime } from "@/lib/dates";
import { downloadJson, readFileText } from "@/lib/files";
import { describeError, useApi } from "@/lib/api";
import { qk, usePreferences } from "@/lib/queries";
import { s } from "@/i18n";

/** F6: each setting with a "what this changes" line, reset, export/import and delete. */
export function WorkingStyleTab() {
  const api = useApi();
  const qc = useQueryClient();
  const prefs = usePreferences();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [guide, setGuide] = useState<string | null>(null);

  const setPrefs = (p: PreferencesOut) => qc.setQueryData(qk.prefs, p);

  const patch = useMutation({
    mutationFn: (b: PreferencesPatch) => api.preferences.patch(b),
    onSuccess: (p, vars) => {
      setPrefs(p);
      toast.success(Object.values(vars).every((v) => v === null) ? s.prefs.resetDone : s.prefs.saved);
    },
  });
  const del = useMutation({
    mutationFn: () => api.preferences.reset(),
    onSuccess: (p) => {
      setPrefs(p);
      setConfirmDelete(false);
      setGuide(null);
      toast.success(s.prefs.deleteDone);
    },
  });
  const imp = useMutation({
    mutationFn: (b: PreferencesPatch) => api.preferences.import(b),
    onSuccess: (p) => {
      setPrefs(p);
      toast.success(s.prefs.importDone);
    },
  });
  const collab = useMutation({
    mutationFn: () => api.preferences.collabGuide(),
    onSuccess: (r) => setGuide(r.text),
  });

  const onExport = (p: PreferencesOut) => {
    downloadJson("ritme-preferences.json", exportablePrefs(p));
    toast.success(s.prefs.exported);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = sanitizePrefs(JSON.parse(await readFileText(file)));
      if (!parsed) throw new Error("bad");
      imp.mutate(parsed);
    } catch {
      toast.error(s.prefs.importBad);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <QueryBoundary query={prefs} skeleton={<Skeleton className="h-64 w-full" />}>
      {(p) => (
        <div className="rt-stack">
          <p className="max-w-2xl text-sm text-text-secondary">{s.prefs.pageIntro}</p>
          {!p.isSet && <Alert tone="info" title={s.prefs.notSet}>{s.welcome.skippedNote}</Alert>}
          {(patch.isError || imp.isError || del.isError) && (
            <Alert tone="error" title={s.common.unknownError}>{describeError(patch.error ?? imp.error ?? del.error)}</Alert>
          )}

          {PREF_FIELDS.map((f) => (
            <Section key={f.key} title={f.label} headingLevel={3}>
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">
                  <span className="font-medium text-navy">{s.prefs.whatChanges}: </span>
                  {f.changes}
                </p>
                <ChoiceGroup
                  label={f.question}
                  hideLabel
                  value={p[f.key as PrefKey]}
                  onChange={(v) => patch.mutate({ [f.key]: v } as PreferencesPatch)}
                  options={f.options}
                  disabled={patch.isPending}
                />
                <Button variant="ghost" size="sm" onClick={() => patch.mutate({ [f.key]: null } as PreferencesPatch)} disabled={patch.isPending}>
                  {s.prefs.resetOne}
                </Button>
              </div>
            </Section>
          ))}

          <Section title={s.prefs.consentTitle} headingLevel={3}>
            <p className="text-sm text-text-secondary">
              {p.consentVersion && p.consentRecordedAt ? s.prefs.consentLine(p.consentVersion, formatDateTime(p.consentRecordedAt)) : s.prefs.consentNone}
            </p>
          </Section>

          <Section title={s.prefs.portabilityTitle} description={s.prefs.portabilityBody} headingLevel={3}>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => onExport(p)}>
                <IconDownload /> {s.prefs.export}
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()} loading={imp.isPending}>
                <IconUpload /> {s.prefs.import}
              </Button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label={s.prefs.import} onChange={(e) => void onFile(e.target.files?.[0])} />
            </div>
          </Section>

          <Section title={s.prefs.collabTitle} description={s.prefs.collabBody} headingLevel={3}>
            <div className="space-y-3">
              <Button variant="outline" onClick={() => collab.mutate()} loading={collab.isPending}>
                {s.prefs.collabButton}
              </Button>
              {guide !== null && (
                <div className="space-y-2">
                  <label htmlFor="collab-guide" className="block text-sm font-medium text-navy">
                    {s.prefs.collabResultLabel}
                  </label>
                  <Textarea id="collab-guide" value={guide} onChange={(e) => setGuide(e.target.value)} rows={6} />
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(guide).then(() => toast.success(s.common.copied), () => toast.error(s.common.copyFailed))}
                  >
                    {s.common.copy}
                  </Button>
                </div>
              )}
            </div>
          </Section>

          <Section title={s.prefs.deleteTitle} description={s.prefs.deleteBody} headingLevel={3}>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              {s.prefs.deleteButton}
            </Button>
          </Section>

          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={s.prefs.deleteConfirmTitle}
            description={s.prefs.deleteConfirmBody}
            confirmLabel={s.prefs.deleteButton}
            danger
            loading={del.isPending}
            onConfirm={() => del.mutate()}
          />
        </div>
      )}
    </QueryBoundary>
  );
}
