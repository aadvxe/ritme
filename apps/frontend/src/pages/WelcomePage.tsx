import { Alert, Button, Card, Wordmark, toast } from "@ritme/design";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PreferencesPatch } from "@ritme/api-client";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChoiceGroup } from "@/components/ui/choice";
import { useDocumentTitle } from "@/components/ui/feedback";
import { PREF_FIELDS, prefValueLabel } from "@/features/prefs/fields";
import { s } from "@/i18n";
import { describeError, useApi } from "@/lib/api";
import { qk } from "@/lib/queries";

/** F5: one question per screen, every one skippable. It only writes the seven preferences; it never labels anyone. */
export function WelcomePage() {
  useDocumentTitle("Set up");
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const total = PREF_FIELDS.length;
  const [step, setStep] = useState(0); // 0..total-1 are questions, total is the review screen
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reviewing = step >= total;
  const field = PREF_FIELDS[step];

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const finish = useMutation({
    mutationFn: async (withAnswers: boolean) => {
      const patch = withAnswers && Object.keys(answers).length > 0 ? (answers as PreferencesPatch) : null;
      if (patch) await api.preferences.patch(patch);
      return api.completeOnboarding();
    },
    onSuccess: async (me) => {
      // Write the fresh profile into the cache so the route guard sees onboarding as done immediately.
      qc.setQueryData(qk.me, me);
      await qc.invalidateQueries({ queryKey: qk.prefs });
      toast.success(s.common.saved);
      navigate("/", { replace: true });
    },
  });

  const answeredCount = Object.keys(answers).length;
  const setAnswer = (key: string, value: string) => setAnswers((a) => ({ ...a, [key]: value }));
  const clearAnswer = (key: string) =>
    setAnswers((a) => {
      const { [key]: _drop, ...rest } = a;
      void _drop;
      return rest;
    });

  return (
    <div className="flex min-h-dvh items-start justify-center bg-background px-4 py-10 sm:items-center">
      <main id="main" className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <Wordmark className="text-2xl" />
          <Button variant="ghost" size="sm" onClick={() => finish.mutate(false)} disabled={finish.isPending}>
            {s.welcome.skipAll}
          </Button>
        </div>

        <Card className="space-y-6 p-6 sm:p-8">
          {step === 0 && (
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-navy">{s.welcome.title}</h1>
              <p className="text-sm text-text-secondary">{s.welcome.intro}</p>
            </div>
          )}

          {!reviewing && field && (
            <>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary" aria-live="polite">
                  {s.welcome.stepOf(step + 1, total)}
                </p>
                <div className="h-1.5 w-full rounded-full bg-border" role="presentation">
                  <div className="h-1.5 rounded-full bg-primary-strong transition-all duration-300 ease-out-expo" style={{ width: `${((step + 1) / total) * 100}%` }} />
                </div>
                {step === 0 ? (
                  <h2 ref={headingRef} tabIndex={-1} className="pt-2 text-xl font-semibold text-navy outline-none">
                    {field.question}
                  </h2>
                ) : (
                  <h1 ref={headingRef} tabIndex={-1} className="pt-2 text-xl font-semibold text-navy outline-none">
                    {field.question}
                  </h1>
                )}
              </div>
              <ChoiceGroup
                label={field.question}
                hideLabel
                value={answers[field.key]}
                onChange={(v) => setAnswer(field.key, v)}
                options={field.options}
              />
              <p className="text-xs text-text-secondary">
                <span className="font-medium text-navy">{s.prefs.whatChanges}: </span>
                {field.changes}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <Button variant="ghost" onClick={() => setStep((n) => Math.max(0, n - 1))} disabled={step === 0}>
                  {s.common.back}
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      clearAnswer(field.key);
                      setStep((n) => n + 1);
                    }}
                  >
                    {s.welcome.skipQuestion}
                  </Button>
                  <Button onClick={() => setStep((n) => n + 1)} disabled={!answers[field.key]}>
                    {s.common.next}
                  </Button>
                </div>
              </div>
            </>
          )}

          {reviewing && (
            <>
              <div className="space-y-1">
                <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-navy outline-none">
                  {s.welcome.reviewTitle}
                </h1>
                <p className="text-sm text-text-secondary">{s.welcome.reviewBody}</p>
              </div>
              <dl className="divide-y divide-border rounded-xl border border-border">
                {PREF_FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <dt className="text-sm text-text-secondary">{f.label}</dt>
                    <dd className="text-sm font-medium text-navy">
                      {answers[f.key] ? prefValueLabel(f.key, answers[f.key]!) : <span className="font-normal text-text-secondary">{s.welcome.notAnswered}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm text-text-secondary" aria-live="polite">{s.welcome.answeredCount(answeredCount)}</p>
              {finish.isError && <Alert tone="error" title={s.welcome.errorSaving}>{describeError(finish.error)}</Alert>}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <Button variant="ghost" onClick={() => setStep(total - 1)}>
                  {s.common.back}
                </Button>
                <Button onClick={() => finish.mutate(true)} loading={finish.isPending}>
                  {finish.isPending ? s.welcome.saving : s.welcome.startUsing}
                </Button>
              </div>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
