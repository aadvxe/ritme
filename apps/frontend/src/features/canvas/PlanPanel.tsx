import {
  Alert,
  Badge,
  Button,
  SegmentedContent,
  SegmentedList,
  SegmentedTabs,
  SegmentedTrigger,
  toast,
} from "@ritme/design";
import type { PreferencesOut, TaskStatus, WorkflowDetail } from "@ritme/api-client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { IconInfo } from "@/components/ui/icons";
import { Section } from "@/components/ui/page";
import { describeError, useApi } from "@/lib/api";
import { useRefreshWorkflowData } from "@/lib/queries";
import { sessionStore } from "@/lib/safe-storage";
import { s } from "@/i18n";
import { ApprovalCard } from "./ApprovalCard";
import { actionNeedingAttention, latestSucceeded } from "./approval";
import { defaultPlanView, planItemsFor, planWhyLines, type PlanItem, type PlanView } from "./plan";
import { PlanEditor } from "./PlanEditor";
import { ChecklistView, OneStepView, PlanTimelineView } from "./PlanViews";
import { VerifiedSummary } from "./VerifiedSummary";

const P = s.canvas.plan;
const isView = (v: string | null): v is PlanView => v === "one_step" || v === "full_list" || v === "timeline";

/** F27–F30: the morphing plan, its editor, the approval card, and the Verified badge. */
export function PlanPanel({ detail, prefs, disabled }: { detail: WorkflowDetail; prefs: PreferencesOut | undefined; disabled: boolean }) {
  const api = useApi();
  const refresh = useRefreshWorkflowData();
  const wfId = detail.workflow.id;
  const overrideKey = `ritme.planview.${wfId}`;
  const [override, setOverride] = useState<PlanView | null>(() => {
    const v = sessionStore.get(overrideKey);
    return isView(v) ? v : null;
  });
  const [editing, setEditing] = useState(false);
  const defaultView = defaultPlanView(prefs);
  const view = override ?? defaultView;

  const { items, source } = planItemsFor(detail);
  const attention = actionNeedingAttention(detail.actions);
  const succeeded = latestSucceeded(detail.actions);
  const openBlocking = detail.questions.filter((q) => q.blocking && q.status === "open").length;
  const plan = detail.latestPlan;
  const draft = plan && plan.status === "draft" ? plan : null;
  const status = detail.workflow.status;
  const reading = status === "captured" || status === "analyzing";

  const createPlan = useMutation({
    mutationFn: () => api.workflows.plan(wfId),
    onSuccess: () => refresh(wfId),
  });
  const propose = useMutation({
    mutationFn: (planVersionId: string) => api.workflows.proposeAction(wfId, { planVersionId }),
    onSuccess: () => refresh(wfId),
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: TaskStatus }) => api.tasks.patch(v.id, { status: v.status }),
    onSuccess: async () => {
      await refresh(wfId);
      toast.success(P.statusChanged);
    },
    onError: (e) => toast.error(`${P.statusFailed} ${describeError(e)}`),
  });
  const onStatus = (item: PlanItem, st: TaskStatus) => item.taskId && setStatus.mutate({ id: item.taskId, status: st });

  const choose = (v: string) => {
    if (!isView(v)) return;
    setOverride(v);
    sessionStore.set(overrideKey, v);
  };

  const onSaved = async () => {
    setEditing(false);
    // An approval for the old payload is stale; a changed plan always gets a fresh proposal.
    const old = attention && attention.status === "pending_approval" ? attention : null;
    if (old) await api.actions.reject(old.id).catch(() => undefined);
    if (draft) {
      try {
        await api.workflows.proposeAction(wfId, { planVersionId: draft.id });
      } catch (e) {
        toast.error(`${P.prepareFailed} ${describeError(e)}`);
      }
    }
    await refresh(wfId);
    toast.success(s.canvas.editor.saved);
  };

  const body = () => {
    if (reading) return <p className="text-sm text-text-secondary">{s.canvas.analyzingBody}</p>;

    if (source === "none") {
      if (openBlocking > 0) {
        return (
          <div className="space-y-2 rounded-xl bg-blocker/15 p-4" data-testid="plan-blocked">
            <p className="flex items-center gap-2 text-sm font-semibold text-blocker-fg">
              <IconInfo /> {P.noPlanBlocked}
            </p>
            <p className="text-sm text-text">{P.noPlanBlockedBody(openBlocking)}</p>
            <Button asChild variant="soft" size="sm">
              <a href="#truth-board">{s.canvas.headings.truthBoard}</a>
            </Button>
          </div>
        );
      }
      return (
        <div className="space-y-3" data-testid="plan-ready">
          <p className="text-sm font-semibold text-navy">{P.noPlanReady}</p>
          <p className="text-sm text-text-secondary">{P.noPlanReadyBody}</p>
          {createPlan.isError && <Alert tone="error" title={P.planFailed}>{describeError(createPlan.error)}</Alert>}
          <Button onClick={() => createPlan.mutate()} loading={createPlan.isPending} disabled={disabled}>
            {createPlan.isPending ? P.creating : P.createPlan}
          </Button>
        </div>
      );
    }

    const viewProps = { items, prefs, onStatus: source === "tasks" ? onStatus : undefined, pendingTaskId: setStatus.isPending ? (setStatus.variables?.id ?? null) : null, disabled };
    const why = planWhyLines(prefs, view, override !== null);

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {plan && (
            <>
              <Badge tone={plan.status === "draft" ? "assumption" : "info"}>{plan.status === "draft" ? P.draftBadge : plan.status === "approved" ? P.approvedBadge : P.supersededBadge}</Badge>
              <span className="text-xs text-text-secondary">{P.version(plan.version)}</span>
            </>
          )}
          {plan?.goal && (
            <span className="text-sm text-text-secondary">
              <span className="font-medium text-navy">{P.goal}: </span>
              {plan.goal}
            </span>
          )}
        </div>

        <SegmentedTabs value={view} onValueChange={choose}>
          <SegmentedList aria-label={P.viewLabel}>
            <SegmentedTrigger value="one_step">{P.views.one_step}</SegmentedTrigger>
            <SegmentedTrigger value="full_list">{P.views.full_list}</SegmentedTrigger>
            <SegmentedTrigger value="timeline">{P.views.timeline}</SegmentedTrigger>
          </SegmentedList>
          <ul className="mt-2 space-y-0.5 text-xs text-text-secondary" data-testid="plan-why" aria-label={P.whyLabel}>
            {why.map((w) => (
              <li key={w} className="flex items-start gap-1.5">
                <span className="mt-0.5 text-info-fg"><IconInfo /></span>
                {w}
              </li>
            ))}
            <li>
              <Link to="/settings/working-style" className="font-medium text-primary-strong hover:underline">
                {P.changeDefault}
              </Link>
            </li>
          </ul>
          <div className="mt-4">
            <SegmentedContent value="one_step" className="outline-none">
              <OneStepView {...viewProps} />
            </SegmentedContent>
            <SegmentedContent value="full_list" className="outline-none">
              <ChecklistView {...viewProps} />
            </SegmentedContent>
            <SegmentedContent value="timeline" className="outline-none">
              <PlanTimelineView {...viewProps} />
            </SegmentedContent>
          </div>
        </SegmentedTabs>

        {plan && plan.plan.unresolvedItems.length > 0 && source === "draft" && (
          <div className="rounded-xl bg-assumption/30 p-3 text-sm text-assumption-fg">
            <p className="font-semibold">{P.unresolved}</p>
            <ul className="mt-1 list-disc pl-5">
              {plan.plan.unresolvedItems.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        )}

        {attention && (
          <ApprovalCard
            key={attention.id}
            action={attention}
            prefs={prefs}
            questions={detail.questions}
            disabled={disabled}
            onEdit={draft ? () => setEditing(true) : undefined}
          />
        )}
        {attention && attention.actionType === "update_tasks" && <p className="text-xs text-text-secondary">{P.pendingChangeNote}</p>}

        {!attention && source === "draft" && draft && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => propose.mutate(draft.id)} loading={propose.isPending} disabled={disabled}>
              {propose.isPending ? P.preparing : P.prepareApproval}
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)} disabled={disabled}>
              {P.editPlan}
            </Button>
          </div>
        )}
        {propose.isError && <Alert tone="error" title={P.prepareFailed}>{describeError(propose.error)}</Alert>}

        {succeeded && <VerifiedSummary action={succeeded} />}
      </div>
    );
  };

  return (
    <Section title={s.canvas.headings.plan} description={P.intro} id="plan">
      {body()}
      {draft && editing && (
        <PlanEditor
          key={`${draft.id}-${draft.rowVersion}`}
          plan={draft}
          open={editing}
          onOpenChange={setEditing}
          onSaved={() => void onSaved()}
          onReload={() => {
            setEditing(false);
            void refresh(wfId);
          }}
        />
      )}
    </Section>
  );
}
