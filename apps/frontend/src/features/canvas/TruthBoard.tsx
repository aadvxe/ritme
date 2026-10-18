import { Badge, Button, Field, Input, Modal, cn, toast } from "@ritme/design";
import type { PreferencesOut, RequirementItem, WorkflowDetail } from "@ritme/api-client";
import { useMutation } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/feedback";
import { IconAlert, IconCheckCircle, IconQuestion } from "@/components/ui/icons";
import { describeError, useApi } from "@/lib/api";
import { useRefreshWorkflowData } from "@/lib/queries";
import { s } from "@/i18n";
import { BlockerCard } from "./BlockerCard";
import { EvidenceBlock } from "./Evidence";
import { bucketOf, buildTruthBoard, type Bucket } from "./truth";

const T = s.canvas.truth;

const BUCKET_STYLE: Record<Bucket, { tone: "fact" | "assumption" | "blocker"; icon: ReactNode; ring: string }> = {
  known: { tone: "fact", icon: <IconCheckCircle />, ring: "border-fact-fg/30" },
  assumption: { tone: "assumption", icon: <IconQuestion />, ring: "border-assumption-fg/30" },
  missing: { tone: "blocker", icon: <IconAlert />, ring: "border-blocker-fg/30" },
};

function RequirementCard({
  r,
  bucket,
  detail,
  disabled,
}: {
  r: RequirementItem;
  bucket: Bucket;
  detail: WorkflowDetail;
  disabled: boolean;
}) {
  const api = useApi();
  const refresh = useRefreshWorkflowData();
  const wfId = detail.workflow.id;
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [text, setText] = useState(r.text);
  const st = BUCKET_STYLE[bucket];

  const patch = useMutation({
    mutationFn: (b: { confirm?: boolean; reject?: boolean; text?: string }) => api.workflows.patchRequirement(wfId, r.id, b),
    onSuccess: async (_d, vars) => {
      await refresh(wfId);
      setEditing(false);
      setRejecting(false);
      if (vars.reject) toast.success(s.common.removed);
    },
    onError: (e) => toast.error(`${T.actionFailed} ${describeError(e)}`),
  });

  return (
    <li className={cn("rounded-2xl border bg-surface p-4 shadow-card", st.ring)} data-testid={`req-${bucket}`} data-req-id={r.id}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={st.tone} icon={st.icon}>
          {T.bucketLabel[bucket]}
        </Badge>
        <span className="text-xs font-medium text-text-secondary">{T.kind[r.kind]}</span>
        {r.userConfirmedAt && (
          <Badge tone="fact" icon={<IconCheckCircle />}>
            {T.confirmedByYou}
          </Badge>
        )}
        {r.importance === "blocking" && !r.userConfirmedAt && <span className="text-xs font-medium text-blocker-fg">{T.blockingLabel}</span>}
      </div>
      <p className="mt-2 text-sm font-medium text-navy">{r.text}</p>
      <p className="mt-0.5 text-xs text-text-secondary">{T.certainty[r.certainty]}</p>
      <div className="mt-3">
        <EvidenceBlock r={r} sources={detail.sources} captureTitle={detail.capture?.title ?? detail.capture?.sourcePageTitle ?? null} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!r.userConfirmedAt && (
          <Button size="sm" variant="soft" onClick={() => patch.mutate({ confirm: true })} loading={patch.isPending && patch.variables?.confirm === true} disabled={disabled}>
            {T.confirm}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setText(r.text);
            setEditing(true);
          }}
          disabled={disabled}
        >
          {T.editItem}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRejecting(true)} disabled={disabled}>
          {T.reject}
        </Button>
      </div>

      <Modal
        open={editing}
        onOpenChange={setEditing}
        title={T.editTitle}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(false)}>
              {s.common.cancel}
            </Button>
            <Button onClick={() => patch.mutate({ text: text.trim() })} loading={patch.isPending} disabled={!text.trim()}>
              {T.editSave}
            </Button>
          </>
        }
      >
        <Field label={T.editLabel} htmlFor={`edit-${r.id}`}>
          <Input id={`edit-${r.id}`} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </Modal>
      <ConfirmDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={T.rejectTitle}
        description={T.rejectBody}
        confirmLabel={T.reject}
        danger
        loading={patch.isPending}
        onConfirm={() => patch.mutate({ reject: true })}
      />
    </li>
  );
}

function Column({ id, title, tone, count, children }: { id: string; title: string; tone: Bucket; count: number; children: ReactNode }) {
  const st = BUCKET_STYLE[tone];
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-3">
      <h3 id={id} className="flex items-center gap-2 text-base font-semibold text-navy">
        <Badge tone={st.tone} icon={st.icon}>
          {title}
        </Badge>
        <span className="text-sm font-normal text-text-secondary">({count})</span>
      </h3>
      {children}
    </section>
  );
}

/** F22: Known facts & rules / Assumptions to confirm / Missing or unclear. Icon + word, evidence inline. */
export function TruthBoard({ detail, prefs, disabled }: { detail: WorkflowDetail; prefs: PreferencesOut | undefined; disabled: boolean }) {
  const model = buildTruthBoard(detail.requirements, detail.questions);
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">{T.intro}</p>
      <div className="grid gap-6 lg:grid-cols-3">
        <Column id="tb-known" title={T.known} tone="known" count={model.known.length}>
          {model.known.length === 0 ? (
            <p className="text-sm text-text-secondary">{T.knownEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {model.known.map((r) => (
                <RequirementCard key={r.id} r={r} bucket="known" detail={detail} disabled={disabled} />
              ))}
            </ul>
          )}
        </Column>
        <Column id="tb-assumptions" title={T.assumptions} tone="assumption" count={model.assumptions.length}>
          {model.assumptions.length === 0 ? (
            <p className="text-sm text-text-secondary">{T.assumptionsEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {model.assumptions.map((r) => (
                <RequirementCard key={r.id} r={r} bucket={bucketOf(r)} detail={detail} disabled={disabled} />
              ))}
            </ul>
          )}
        </Column>
        <Column id="tb-missing" title={T.missing} tone="missing" count={model.missing.length}>
          {model.missing.length === 0 ? (
            <p className="text-sm text-text-secondary">{T.missingEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {model.missing.map((m) => (
                <BlockerCard key={m.key} card={m} detail={detail} prefs={prefs} disabled={disabled} />
              ))}
            </ul>
          )}
        </Column>
      </div>
    </div>
  );
}
