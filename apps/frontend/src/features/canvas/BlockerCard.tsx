import { Alert, Badge, Button, Field, Input, Modal, Textarea, toast } from "@ritme/design";
import type { ClarificationQuestion, PreferencesOut, WorkflowDetail } from "@ritme/api-client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { IconAlert, IconCheckCircle, IconCopy, IconQuestion } from "@/components/ui/icons";
import { describeError, useApi } from "@/lib/api";
import { useRefreshWorkflowData } from "@/lib/queries";
import { s } from "@/i18n";
import { EvidenceBlock } from "./Evidence";
import type { MissingCard } from "./truth";

const B = s.canvas.blocker;

function QuestionBlock({
  q,
  detail,
  prefs,
  disabled,
}: {
  q: ClarificationQuestion;
  detail: WorkflowDetail;
  prefs: PreferencesOut | undefined;
  disabled: boolean;
}) {
  const api = useApi();
  const refresh = useRefreshWorkflowData();
  const wfId = detail.workflow.id;
  const [editing, setEditing] = useState(q.status === "open");
  const [answer, setAnswer] = useState(q.status === "answered" ? (q.answer ?? "") : "");
  const [deferOpen, setDeferOpen] = useState(false);
  const [assumption, setAssumption] = useState(q.status === "deferred" ? (q.answer ?? "") : "");
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (b: { answer?: string; assumptionLabel?: string; disposition: "answer" | "defer_nonblocking" }) =>
      api.workflows.answer(wfId, q.id, b),
    onSuccess: async (_d, vars) => {
      await refresh(wfId);
      setEditing(false);
      setDeferOpen(false);
      toast.success(vars.disposition === "answer" ? B.answerSaved : B.deferSaved);
    },
  });

  const draft = useMutation({
    mutationFn: () => api.workflows.draftClarification(wfId, q.id),
    onSuccess: (r) => {
      setDraftText(r.message);
      setDraftOpen(true);
    },
  });

  const submitAnswer = (value: string) => {
    if (!value.trim()) return setProblem(B.answerNeeded);
    setProblem(null);
    save.mutate({ answer: value.trim(), disposition: "answer" });
  };

  const draftVariant = prefs?.isSet && prefs.clarificationHelp === "draft_message" ? "primary" : prefs?.isSet && prefs.clarificationHelp === "independent" ? "ghost" : "outline";
  const statusLabel = B.statusLabel[q.status];

  return (
    <div id={`question-${q.id}`} className="rounded-xl border border-border bg-background p-3" data-testid="question-block" data-question-id={q.id} data-question-status={q.status}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={q.status === "open" ? "blocker" : q.status === "answered" ? "fact" : "assumption"} icon={q.status === "open" ? <IconAlert /> : q.status === "answered" ? <IconCheckCircle /> : <IconQuestion />}>
          {statusLabel}
        </Badge>
      </div>
      <h4 className="mt-2 text-sm font-semibold text-navy">{q.question}</h4>
      <p className="mt-1 text-xs text-text-secondary">
        <span className="font-medium text-navy">{B.why}: </span>
        {q.whyItMatters}
      </p>

      {q.status === "answered" && !editing && (
        <div className="mt-3 space-y-2">
          <p className="text-sm">
            <span className="font-medium text-navy">{B.yourAnswer}: </span>
            {q.answer}
          </p>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={disabled}>
            {B.editAnswer}
          </Button>
        </div>
      )}

      {q.status === "deferred" && !editing && (
        <div className="mt-3 space-y-2">
          <p className="rounded-lg bg-assumption/30 p-2 text-sm text-assumption-fg" data-testid="assumption-label">
            <span className="font-semibold">{B.deferredPrefix} </span>
            {q.answer}
          </p>
          <Button size="sm" variant="soft" onClick={() => setEditing(true)} disabled={disabled}>
            {B.editAnswer}
          </Button>
        </div>
      )}

      {editing && (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitAnswer(answer);
          }}
        >
          <Field label={B.answerLabel} htmlFor={`answer-${q.id}`} hint={B.answerHint}>
            <Input id={`answer-${q.id}`} value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={disabled} aria-describedby={`answer-${q.id}-hint`} />
          </Field>
          {q.suggestedAnswers && q.suggestedAnswers.length > 0 && (
            <div role="group" aria-label={B.suggested} className="flex flex-wrap gap-2">
              {q.suggestedAnswers.map((sa) => (
                <Button key={sa} type="button" size="sm" variant="soft" onClick={() => setAnswer(sa)} disabled={disabled}>
                  {sa}
                </Button>
              ))}
            </div>
          )}
          {problem && <Alert tone="error" title={problem} />}
          {save.isError && <Alert tone="error" title={B.saveFailed}>{describeError(save.error)}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={save.isPending && save.variables?.disposition === "answer"} disabled={disabled}>
              {save.isPending ? B.submitting : B.submit}
            </Button>
            <Button type="button" size="sm" variant={draftVariant} onClick={() => draft.mutate()} loading={draft.isPending} disabled={disabled}>
              {draft.isPending ? B.drafting : B.draft}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setDeferOpen(true)} disabled={disabled}>
              {B.defer}
            </Button>
            {q.status !== "open" && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {s.common.cancel}
              </Button>
            )}
          </div>
          {draft.isError && <Alert tone="error" title={B.saveFailed}>{describeError(draft.error)}</Alert>}
        </form>
      )}

      <Modal
        open={draftOpen}
        onOpenChange={setDraftOpen}
        title={B.draftTitle}
        description={B.draftIntro}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setDraftOpen(false)}>
              {s.common.close}
            </Button>
            <Button
              onClick={() => navigator.clipboard.writeText(draftText).then(() => toast.success(s.common.copied), () => toast.error(s.common.copyFailed))}
            >
              <IconCopy /> {B.copyDraft}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={B.draftLabel} htmlFor={`draft-${q.id}`}>
            <Textarea id={`draft-${q.id}`} rows={8} value={draftText} onChange={(e) => setDraftText(e.target.value)} />
          </Field>
          {draft.data?.notes && (
            <p className="text-xs text-text-secondary">
              <span className="font-medium text-navy">{B.draftNotes}: </span>
              {draft.data.notes}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={deferOpen}
        onOpenChange={setDeferOpen}
        title={B.deferTitle}
        description={B.deferBody}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeferOpen(false)}>
              {s.common.cancel}
            </Button>
            <Button
              onClick={() => {
                if (!assumption.trim()) return setProblem(B.assumptionNeeded);
                setProblem(null);
                save.mutate({ disposition: "defer_nonblocking", assumptionLabel: assumption.trim() });
              }}
              loading={save.isPending && save.variables?.disposition === "defer_nonblocking"}
            >
              {B.deferSave}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Field label={B.assumptionLabel} htmlFor={`assume-${q.id}`} hint={B.assumptionHint}>
            <Input id={`assume-${q.id}`} autoFocus value={assumption} onChange={(e) => setAssumption(e.target.value)} />
          </Field>
          {problem && deferOpen && <Alert tone="error" title={problem} />}
        </div>
      </Modal>
    </div>
  );
}

/** F23: a blocker card with an answer field, an editable copy-only draft message, and defer-with-assumption. */
export function BlockerCard({
  card,
  detail,
  prefs,
  disabled,
}: {
  card: MissingCard;
  detail: WorkflowDetail;
  prefs: PreferencesOut | undefined;
  disabled: boolean;
}) {
  const r = card.requirement;
  const anyOpen = card.questions.some((q) => q.status === "open");
  return (
    <li className="rounded-2xl border border-blocker-fg/30 bg-surface p-4 shadow-card" data-testid="req-missing" data-req-id={r?.id ?? card.key}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blocker" icon={<IconAlert />}>
          {s.canvas.truth.bucketLabel.missing}
        </Badge>
        {r && <span className="text-xs font-medium text-text-secondary">{s.canvas.truth.kind[r.kind]}</span>}
        {anyOpen && <span className="text-xs font-medium text-blocker-fg">{s.canvas.truth.blockingLabel}</span>}
      </div>
      {r && (
        <>
          <p className="mt-2 text-sm font-medium text-navy">{r.text}</p>
          <p className="mt-0.5 text-xs text-text-secondary">{s.canvas.truth.certainty[r.certainty]}</p>
          <div className="mt-3">
            <EvidenceBlock r={r} sources={detail.sources} captureTitle={detail.capture?.title ?? detail.capture?.sourcePageTitle ?? null} />
          </div>
        </>
      )}
      <div className="mt-3 space-y-3">
        {card.questions.map((q) => (
          <QuestionBlock key={q.id} q={q} detail={detail} prefs={prefs} disabled={disabled} />
        ))}
        {card.questions.length === 0 && <p className="text-xs text-text-secondary">{s.canvas.truth.missingEmpty}</p>}
      </div>
    </li>
  );
}
