import { Alert, Button, Field, Modal, Textarea, toast } from "@ritme/design";
import type { ClarificationQuestion, PreferencesOut, ProposedActionOut } from "@ritme/api-client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ActionStatusBadge } from "@/components/ui/status";
import { ConfirmDialog } from "@/components/ui/feedback";
import { IconArrowRight, IconCopy, IconShield } from "@/components/ui/icons";
import { describeError, useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { useRefreshWorkflowData } from "@/lib/queries";
import { s } from "@/i18n";
import { previewOf } from "./approval";
import { estimateText } from "./plan";
import { VerifiedSummary } from "./VerifiedSummary";

const A = s.canvas.approval;

function AskDialog({
  open,
  onOpenChange,
  workflowId,
  questions,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workflowId: string;
  questions: ClarificationQuestion[];
}) {
  const api = useApi();
  const [text, setText] = useState<string>(A.askTemplate);
  const [qid, setQid] = useState("");
  const draft = useMutation({
    mutationFn: (id: string) => api.workflows.draftClarification(workflowId, id),
    onSuccess: (r) => setText(r.message),
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={A.askTitle}
      description={A.askIntro}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {A.askDone}
          </Button>
          <Button onClick={() => navigator.clipboard.writeText(text).then(() => toast.success(s.common.copied), () => toast.error(s.common.copyFailed))}>
            <IconCopy /> {s.common.copy}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={A.askLabel} htmlFor="ask-text">
          <Textarea id="ask-text" autoFocus rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        {questions.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1">
              <label htmlFor="ask-q" className="mb-1.5 block text-sm font-medium text-navy">
                {A.askDraftFor}
              </label>
              <select
                id="ask-q"
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text shadow-card"
                value={qid}
                onChange={(e) => setQid(e.target.value)}
              >
                <option value="">{A.askPick}</option>
                {questions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.question}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="outline" disabled={!qid} loading={draft.isPending} onClick={() => qid && draft.mutate(qid)}>
              {A.askDraft}
            </Button>
          </div>
        )}
        {draft.isError && <Alert tone="error" title={s.common.unknownError}>{describeError(draft.error)}</Alert>}
      </div>
    </Modal>
  );
}

/**
 * F29: previews exactly what will be written; Approve / Edit / Ask a question / Skip / Reject.
 * Nothing is created until Approve. Edit is only offered for plan drafts (an approved payload is immutable).
 */
export function ApprovalCard({
  action,
  prefs,
  questions,
  disabled,
  onEdit,
}: {
  action: ProposedActionOut;
  prefs: PreferencesOut | undefined;
  questions: ClarificationQuestion[];
  disabled: boolean;
  onEdit?: () => void;
}) {
  const api = useApi();
  const refresh = useRefreshWorkflowData();
  const [skipped, setSkipped] = useState(false);
  const [asking, setAsking] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const preview = previewOf(action);
  const showEstimates = prefs?.isSet ? prefs.timeEstimates === "show" : true;
  const isCreate = action.actionType === "create_tasks";

  const run = useMutation({
    mutationFn: async () => {
      if (action.status === "pending_approval") await api.actions.approve(action.id);
      return api.actions.execute(action.id);
    },
    onSuccess: async (res) => {
      await refresh(action.workflowId);
      if (res.verification === "verified") toast.success(A.approvedDone);
      else toast.warning(A.failedDone);
    },
    onError: async () => {
      await refresh(action.workflowId);
    },
  });
  const reject = useMutation({
    mutationFn: () => api.actions.reject(action.id),
    onSuccess: async () => {
      await refresh(action.workflowId);
      setRejecting(false);
      toast.success(A.rejectDone);
    },
  });

  if (skipped) {
    return (
      <div id="approval" className="rounded-2xl border border-border bg-surface p-4 shadow-card" data-testid="approval-skipped">
        <p className="text-sm text-text-secondary">{A.skippedNote}</p>
        <Button variant="soft" size="sm" className="mt-2" onClick={() => setSkipped(false)}>
          {A.reviewAgain}
        </Button>
      </div>
    );
  }

  const working = run.isPending || action.status === "executing";
  const stuck = action.status === "approved" || action.status === "failed";

  return (
    <section
      id="approval"
      aria-labelledby="approval-title"
      className="rounded-2xl border-2 border-primary-strong/40 bg-surface p-5 shadow-card"
      data-testid="approval-card"
      data-action-id={action.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="approval-title" className="flex items-center gap-2 text-base font-semibold text-navy">
          <span className="text-primary-strong"><IconShield /></span>
          {A.title}: {isCreate ? A.createTitle : A.updateTitle}
        </h3>
        <ActionStatusBadge status={action.status} />
      </div>
      <p className="mt-2 text-sm text-text-secondary">
        <span className="font-medium text-navy">{A.reasonLabel}: </span>
        {action.reasonSummary}
      </p>

      <div className="mt-4 rounded-xl bg-background p-4">
        <p className="text-sm font-semibold text-navy">{A.willWrite}</p>
        {preview.kind === "create" && (
          <>
            <p className="mt-1 text-xs font-medium text-text-secondary" data-testid="approval-count">
              {A.willCreate(preview.tasks.length)}
            </p>
            <ol className="mt-2 space-y-2" data-testid="approval-list">
              {preview.tasks.map((t, i) => {
                const est = estimateText(t.estimatedMinutes, showEstimates);
                return (
                  <li key={i} className="rounded-lg border border-border bg-surface p-3 text-sm">
                    <p className="font-medium text-navy">{t.title}</p>
                    <p className="text-text-secondary">
                      {A.done}: {t.definitionOfDone}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {t.dueAt ? A.due(formatDateTime(t.dueAt)) : A.noDue}
                      {est && ` · ${est}`}
                      {t.dependsOnTitles.length > 0 && ` · ${s.canvas.plan.waitsFor(t.dependsOnTitles.join(", "))}`}
                    </p>
                  </li>
                );
              })}
            </ol>
          </>
        )}
        {preview.kind === "update" && (
          <>
            <p className="mt-1 text-xs font-medium text-text-secondary" data-testid="approval-count">
              {A.willUpdate(preview.rows.length)}
            </p>
            {preview.newDeadline !== undefined && (
              <p className="mt-1 text-sm text-text">
                {s.canvas.deadlineLabel(preview.newDeadline ? formatDateTime(preview.newDeadline) : "—")}
              </p>
            )}
            <ul className="mt-2 space-y-2" data-testid="approval-list">
              {preview.rows.map((r, i) => (
                <li key={i} className="rounded-lg border border-border bg-surface p-3 text-sm">
                  <p className="font-medium text-navy">{r.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-text-secondary">
                    <span>
                      {A.before}: {r.beforeDue ? formatDateTime(r.beforeDue) : A.noDue}
                    </span>
                    <IconArrowRight />
                    <span>
                      {A.after}: {r.afterDue ? formatDateTime(r.afterDue) : A.noDue}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
        {preview.kind === "raw" && <pre className="mt-2 overflow-x-auto rounded-lg bg-surface p-3 text-xs">{preview.json}</pre>}
        <p className="mt-3 text-xs text-text-secondary">{A.nothingElse}</p>
      </div>

      {(run.isError || action.status === "failed") && (
        <div className="mt-3">
          <Alert tone="error" title={A.failedDone}>
            {run.isError ? describeError(run.error) : A.executeRetry}
          </Alert>
        </div>
      )}
      {reject.isError && (
        <div className="mt-3">
          <Alert tone="error" title={s.common.unknownError}>{describeError(reject.error)}</Alert>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => run.mutate()} loading={working} disabled={disabled}>
          {working ? A.working : stuck ? A.executeRetry : isCreate ? A.approve : A.approveUpdate}
        </Button>
        {isCreate && onEdit && action.status === "pending_approval" && (
          <Button variant="outline" onClick={onEdit} disabled={disabled || working}>
            {A.edit}
          </Button>
        )}
        <Button variant="outline" onClick={() => setAsking(true)} disabled={working}>
          {A.ask}
        </Button>
        {action.status === "pending_approval" && (
          <Button variant="ghost" onClick={() => setSkipped(true)} disabled={working}>
            {A.skip}
          </Button>
        )}
        <Button variant="ghost" onClick={() => setRejecting(true)} disabled={working}>
          {A.reject}
        </Button>
      </div>

      <AskDialog open={asking} onOpenChange={setAsking} workflowId={action.workflowId} questions={questions.filter((q) => q.status !== "answered")} />
      <ConfirmDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={A.rejectTitle}
        description={A.rejectBody}
        confirmLabel={A.reject}
        danger
        loading={reject.isPending}
        onConfirm={() => reject.mutate()}
      />
    </section>
  );
}

export { VerifiedSummary };
