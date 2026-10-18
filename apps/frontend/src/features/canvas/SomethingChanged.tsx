import { Alert, Button, Field, Input, Modal, toast } from "@ritme/design";
import type { ReplanResponse, WorkflowDetail } from "@ritme/api-client";
import { format } from "date-fns";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ChoiceGroup } from "@/components/ui/choice";
import { describeError, useApi } from "@/lib/api";
import { useRefreshWorkflowData } from "@/lib/queries";
import { s } from "@/i18n";
import { BeforeAfterDiff } from "./BeforeAfterDiff";

const C = s.canvas.change;
type Path = "request_changed" | "could_not_work";

/**
 * F32 Domino Recovery. Two paths ("The request changed" / "I couldn't work on this"), no justification field,
 * then blast radius, Before/After diff and one approval. Completed tasks are preserved.
 */
export function SomethingChanged({ open, onOpenChange, detail }: { open: boolean; onOpenChange: (o: boolean) => void; detail: WorkflowDetail }) {
  const api = useApi();
  const refresh = useRefreshWorkflowData();
  const wfId = detail.workflow.id;
  const hasTasks = detail.tasks.length > 0;
  const deadlineReqs = detail.requirements.filter((r) => r.kind === "deadline");
  const [path, setPath] = useState<Path>("request_changed");
  const [due, setDue] = useState(detail.workflow.confirmedDueAt ? format(new Date(detail.workflow.confirmedDueAt), "yyyy-MM-dd'T'HH:mm") : "");
  const [text, setText] = useState("");
  const [result, setResult] = useState<ReplanResponse | null>(null);

  const replan = useMutation({
    mutationFn: () =>
      api.workflows.replan(wfId, {
        trigger: path,
        ...(path === "request_changed"
          ? { newDueAt: due ? new Date(due).toISOString() : null, newText: text.trim() || null, requirementId: deadlineReqs[0]?.id ?? null }
          : {}),
      }),
    onSuccess: async (r) => {
      setResult(r);
      await refresh(wfId);
    },
  });

  const apply = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("nothing to apply");
      await api.actions.approve(result.action.id);
      return api.actions.execute(result.action.id);
    },
    onSuccess: async () => {
      await refresh(wfId);
      toast.success(C.applied);
      close();
    },
    onError: async () => {
      await refresh(wfId);
    },
  });

  const close = () => {
    onOpenChange(false);
    setResult(null);
    replan.reset();
    apply.reset();
  };

  const canSubmit = hasTasks && (path === "could_not_work" || due || text.trim());

  return (
    <Modal
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title={C.title}
      description={result ? C.approveTitle : C.intro}
      size="xl"
      footer={
        result ? (
          <>
            <Button variant="outline" onClick={close}>
              {s.canvas.approval.skip}
            </Button>
            <Button onClick={() => apply.mutate()} loading={apply.isPending}>
              {s.canvas.approval.approveUpdate}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={close}>
              {s.common.cancel}
            </Button>
            <Button onClick={() => replan.mutate()} loading={replan.isPending} disabled={!canSubmit}>
              {replan.isPending ? C.showing : C.show}
            </Button>
          </>
        )
      }
    >
      {!result ? (
        <div className="space-y-4">
          {!hasTasks && <Alert tone="info" title={s.canvas.tasks.empty}>{C.noTasksNote}</Alert>}
          <ChoiceGroup
            label={C.title}
            hideLabel
            value={path}
            onChange={(v) => setPath(v as Path)}
            options={[
              { value: "request_changed", label: C.requestChanged, hint: C.requestChangedBody },
              { value: "could_not_work", label: C.couldNot, hint: C.couldNotBody },
            ]}
          />
          {path === "request_changed" && (
            <div className="space-y-3">
              <Field label={C.pickDeadline} htmlFor="sc-due" hint={C.pickDeadlineHint}>
                <Input id="sc-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
              </Field>
              <Field label={C.orText} htmlFor="sc-text">
                <Input id="sc-text" value={text} onChange={(e) => setText(e.target.value)} />
              </Field>
            </div>
          )}
          {replan.isError && <Alert tone="error" title={C.failed}>{describeError(replan.error)}</Alert>}
        </div>
      ) : (
        <div className="space-y-4">
          <section aria-labelledby="blast-h">
            <h3 id="blast-h" className="text-sm font-semibold text-navy">
              {C.blast}
            </h3>
            <p className="text-sm text-text-secondary" data-testid="blast-count">
              {result.blastRadiusTaskIds.length === 0 ? C.blastNone : C.blastCount(result.blastRadiusTaskIds.length)}
            </p>
          </section>
          <section aria-labelledby="diff-h">
            <h3 id="diff-h" className="mb-2 text-sm font-semibold text-navy">
              {C.diffTitle}
            </h3>
            <BeforeAfterDiff diff={result.diff} />
          </section>
          {apply.isError && <Alert tone="error" title={s.canvas.approval.failedDone}>{describeError(apply.error)}</Alert>}
        </div>
      )}
    </Modal>
  );
}
