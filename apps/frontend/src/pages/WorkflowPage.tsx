import { Alert, Badge, Button, Skeleton, toast } from "@ritme/design";
import type { WorkflowDetail } from "@ritme/api-client";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ConfirmDialog, ErrorPanel, useDocumentTitle } from "@/components/ui/feedback";
import { IconArrowRight } from "@/components/ui/icons";
import { PageHeader, Section } from "@/components/ui/page";
import { WorkflowStatusBadge } from "@/components/ui/status";
import { ActivityPanel } from "@/features/canvas/ActivityPanel";
import { PlanPanel } from "@/features/canvas/PlanPanel";
import { ResumeCard } from "@/features/canvas/ResumeCard";
import { SomethingChanged } from "@/features/canvas/SomethingChanged";
import { SourcesPanel } from "@/features/canvas/SourcesPanel";
import { TasksList } from "@/features/canvas/TasksList";
import { TruthBoard } from "@/features/canvas/TruthBoard";
import { describeError, useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { usePreferences, useRefreshWorkflowData, useWorkflow } from "@/lib/queries";
import { s } from "@/i18n";

const C = s.canvas;

function CanvasSkeleton() {
  return (
    <div className="rt-stack" role="status" aria-label={s.common.loading} data-testid="state-loading">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  );
}

function Controls({ detail, onChange }: { detail: WorkflowDetail; onChange: () => void }) {
  const api = useApi();
  const navigate = useNavigate();
  const refresh = useRefreshWorkflowData();
  const wf = detail.workflow;
  const [confirm, setConfirm] = useState<null | "cancel" | "delete">(null);
  const finished = wf.status === "cancelled" || wf.status === "completed";

  const toggle = useMutation({
    mutationFn: () => (wf.paused ? api.workflows.resume(wf.id) : api.workflows.pause(wf.id)),
    onSuccess: async () => {
      await refresh(wf.id);
      toast.success(wf.paused ? C.resumeDone : C.pauseDone);
    },
    onError: (e) => toast.error(describeError(e)),
  });
  const cancel = useMutation({
    mutationFn: () => api.workflows.cancel(wf.id),
    onSuccess: async () => {
      await refresh(wf.id);
      setConfirm(null);
      toast.success(C.cancelDone);
    },
  });
  const del = useMutation({
    mutationFn: () => api.workflows.remove(wf.id),
    onSuccess: async () => {
      setConfirm(null);
      toast.success(C.deleteDone);
      navigate("/", { replace: true });
      await refresh();
    },
  });

  return (
    <>
      {!finished && (
        <Button variant="soft" onClick={onChange}>
          {C.controls.somethingChanged}
        </Button>
      )}
      {!finished && (
        <Button variant="outline" onClick={() => toggle.mutate()} loading={toggle.isPending}>
          {wf.paused ? C.controls.resume : C.controls.pause}
        </Button>
      )}
      {!finished && (
        <Button variant="outline" onClick={() => setConfirm("cancel")}>
          {C.controls.cancel}
        </Button>
      )}
      <Button variant="ghost" onClick={() => setConfirm("delete")}>
        {C.controls.delete}
      </Button>
      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={C.cancelTitle}
        description={C.cancelBody}
        confirmLabel={C.cancelConfirm}
        danger
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={C.deleteTitle}
        description={C.deleteBody}
        confirmLabel={C.deleteConfirm}
        danger
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </>
  );
}

function ReadingState({ detail }: { detail: WorkflowDetail }) {
  const api = useApi();
  const refresh = useRefreshWorkflowData();
  const wf = detail.workflow;
  const analyze = useMutation({
    mutationFn: () => api.captures.analyze(wf.captureId ?? ""),
    onSuccess: () => refresh(wf.id),
  });
  if (wf.status === "analyzing") {
    return (
      <Section title={C.analyzing} description={C.analyzingBody} id="reading">
        <div role="status" aria-live="polite" className="space-y-3" data-testid="state-analyzing">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </Section>
    );
  }
  const failed = wf.status === "failed";
  return (
    <Section title={failed ? C.failed : s.status.workflow.captured} description={failed ? C.failedBody : undefined} id="reading">
      {analyze.isError && <Alert tone="error" title={C.failed}>{describeError(analyze.error)}</Alert>}
      <Button onClick={() => analyze.mutate()} loading={analyze.isPending} disabled={!wf.captureId}>
        {failed ? C.retryAnalyze : C.retryAnalyze}
      </Button>
    </Section>
  );
}

export function WorkflowPage() {
  const { id = "" } = useParams();
  const loc = useLocation();
  const [search, setSearch] = useSearchParams();
  const detailQ = useWorkflow(id);
  const prefs = usePreferences();
  const [changing, setChanging] = useState(false);
  const detail = detailQ.data;
  useDocumentTitle(detail?.workflow.title ?? "Workflow");

  // Deep links: ?changed=1 opens Something changed; #question-… / #approval scroll to that part.
  useEffect(() => {
    if (search.get("changed") === "1" && detail) {
      setChanging(true);
      const next = new URLSearchParams(search);
      next.delete("changed");
      setSearch(next, { replace: true });
    }
  }, [search, detail, setSearch]);
  useEffect(() => {
    if (!detail || !loc.hash) return;
    const el = document.getElementById(loc.hash.slice(1));
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.querySelector<HTMLElement>("input, textarea, button")?.focus({ preventScroll: true });
    }
  }, [detail?.workflow.id, loc.hash]);

  if (detailQ.isPending) return <CanvasSkeleton />;
  if (detailQ.isError) {
    const notFound = (detailQ.error as { status?: number }).status === 404;
    return notFound ? (
      <div className="rt-stack">
        <PageHeader title={C.notFound} description={C.notFoundBody} />
        <Button asChild>
          <Link to="/">{C.backToDashboard}</Link>
        </Button>
      </div>
    ) : (
      <ErrorPanel error={detailQ.error} onRetry={() => void detailQ.refetch()} />
    );
  }

  const wf = detail!.workflow;
  const d = detail!;
  const inactive = wf.paused || wf.status === "cancelled";
  const reading = wf.status === "captured" || wf.status === "analyzing" || wf.status === "failed";

  return (
    <div className="rt-stack" data-testid="workflow-page" data-status={wf.status}>
      <PageHeader
        title={wf.title}
        meta={
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {wf.isDemo && <Badge tone="info">{C.demoBadge}</Badge>}
            <WorkflowStatusBadge status={wf.status} paused={wf.paused} />
            <span className="text-sm text-text-secondary">{wf.confirmedDueAt ? C.deadlineLabel(formatDateTime(wf.confirmedDueAt)) : C.noDeadline}</span>
          </div>
        }
        description={wf.objective ?? undefined}
        actions={<Controls detail={d} onChange={() => setChanging(true)} />}
      />

      {wf.paused && <Alert tone="assumption" title={C.paused} />}
      {wf.status === "cancelled" && <Alert tone="info" title={C.cancelledNote} />}

      <nav aria-label={s.common.onThisPage}>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {[
            ["#resume", C.resume.title],
            ["#truth-board", C.headings.truthBoard],
            ["#plan", C.headings.plan],
            ["#tasks", C.headings.tasks],
            ["#sources", C.headings.sources],
            ["#activity", C.headings.activity],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href} className="inline-flex items-center gap-1 font-medium text-primary-strong hover:underline">
                <IconArrowRight /> {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <ResumeCard detail={d} disabled={inactive} />

      {reading ? (
        <ReadingState detail={d} />
      ) : (
        <Section title={C.headings.truthBoard} id="truth-board">
          <TruthBoard detail={d} prefs={prefs.data} disabled={inactive} />
        </Section>
      )}

      <PlanPanel detail={d} prefs={prefs.data} disabled={inactive} />
      <TasksList workflowId={wf.id} tasks={d.tasks} disabled={inactive} />

      <div className="grid gap-6 lg:grid-cols-2">
        <SourcesPanel sources={d.sources} />
        <ActivityPanel workflowId={wf.id} />
      </div>

      <SomethingChanged key={`${wf.id}-${wf.version}-${d.tasks.length}`} open={changing} onOpenChange={setChanging} detail={d} />
    </div>
  );
}
