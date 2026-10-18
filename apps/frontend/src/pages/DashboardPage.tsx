import { Button, EmptyState, Skeleton, toast } from "@ritme/design";
import type { DashboardOut } from "@ritme/api-client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog, QueryBoundary } from "@/components/ui/feedback";
import { IconArrowRight, IconDoc, IconSparkle } from "@/components/ui/icons";
import { PageHeader, Section } from "@/components/ui/page";
import { ActivityList } from "@/features/activity/ActivityList";
import { PasteCapture } from "@/features/capture/PasteCapture";
import { CalendarOverview } from "@/features/calendar/CalendarOverview";
import { WorkflowCard } from "@/features/dashboard/WorkflowCard";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatUpdated } from "@/lib/dates";
import { useDashboard, useRefreshWorkflowData } from "@/lib/queries";
import { s } from "@/i18n";

function DashboardSkeleton() {
  return (
    <div className="rt-stack">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

function NextBestStep({ d }: { d: DashboardOut }) {
  const n = d.nextBestStep;
  return (
    <section aria-labelledby="nbs" className="rt-pad rounded-2xl border border-primary/30 bg-primary/5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 id="nbs" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary-strong">
            <IconSparkle /> {s.dashboard.nextBest}
          </h2>
          {n ? (
            <>
              <p className="text-xl font-semibold text-navy">{n.text}</p>
              <p className="text-sm text-text-secondary">{s.dashboard.nextBestFrom(n.workflowTitle)}</p>
            </>
          ) : (
            <p className="text-base text-text-secondary">{s.dashboard.nextBestEmpty}</p>
          )}
        </div>
        {n && (
          <Button asChild>
            <Link to={`/workflows/${n.workflowId}`}>
              {s.dashboard.goToStep} <IconArrowRight />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}

export function DashboardPage() {
  const api = useApi();
  const { user } = useAuth();
  const dash = useDashboard();
  const refresh = useRefreshWorkflowData();
  const [confirmReset, setConfirmReset] = useState(false);

  const reset = useMutation({
    mutationFn: () => api.demo.reset(),
    onSuccess: async () => {
      await refresh();
      setConfirmReset(false);
      toast.success(s.dashboard.demoResetDone);
    },
  });

  const firstName = user?.displayName?.split(" ")[0] ?? null;

  return (
    <div className="rt-stack">
      <PageHeader
        title={s.dashboard.title}
        description={`${s.dashboard.greeting(firstName)}. ${s.dashboard.subtitle}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
            {s.dashboard.demoReset}
          </Button>
        }
      />

      <QueryBoundary query={dash} skeleton={<DashboardSkeleton />}>
        {(d) => (
          <>
            <NextBestStep d={d} />

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rt-stack lg:col-span-2">
                <Section title={s.dashboard.pickUp} id="pickup">
                  {d.activeWorkflows.length === 0 ? (
                    <EmptyState title={s.dashboard.pickUpEmpty} description={s.dashboard.pickUpEmptyBody} icon={<IconDoc className="h-6 w-6" />} />
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {d.activeWorkflows.map((w) => (
                        <WorkflowCard key={w.id} wf={w} />
                      ))}
                    </div>
                  )}
                </Section>

                <div className="grid gap-6 md:grid-cols-2">
                  <Section title={s.dashboard.needsInput} id="needs-input">
                    {d.needsInput.length === 0 ? (
                      <p className="text-sm text-text-secondary">{s.dashboard.needsInputEmpty}</p>
                    ) : (
                      <ul className="space-y-3">
                        {d.needsInput.map((q) => (
                          <li key={q.questionId} className="rounded-xl border border-border p-3">
                            <p className="text-sm font-medium text-navy">{q.question}</p>
                            <p className="mt-0.5 text-xs text-text-secondary">{q.workflowTitle}</p>
                            <Button asChild variant="soft" size="sm" className="mt-2">
                              <Link to={`/workflows/${q.workflowId}#question-${q.questionId}`}>{s.dashboard.answer}</Link>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>

                  <Section title={s.dashboard.needsApproval} id="needs-approval">
                    {d.needsApproval.length === 0 ? (
                      <p className="text-sm text-text-secondary">{s.dashboard.needsApprovalEmpty}</p>
                    ) : (
                      <ul className="space-y-3">
                        {d.needsApproval.map((a) => (
                          <li key={a.actionId} className="rounded-xl border border-border p-3">
                            <p className="text-sm font-medium text-navy">{a.summary}</p>
                            <p className="mt-0.5 text-xs text-text-secondary">{a.workflowTitle}</p>
                            <Button asChild variant="soft" size="sm" className="mt-2">
                              <Link to={`/workflows/${a.workflowId}#approval`}>{s.dashboard.review}</Link>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                </div>

                <Section title={s.dashboard.capture.title} id="add-text">
                  <PasteCapture />
                </Section>
              </div>

              <div className="rt-stack">
                <Section title={s.dashboard.recentCaptures} id="recent-captures">
                  {d.recentCaptures.length === 0 ? (
                    <p className="text-sm text-text-secondary">{s.dashboard.recentCapturesEmpty}</p>
                  ) : (
                    <ul className="space-y-3">
                      {d.recentCaptures.map((c) => (
                        <li key={c.id} className="text-sm">
                          <p className="font-medium text-navy">{c.title ?? c.sourcePageTitle ?? s.library.noTitle}</p>
                          <p className="line-clamp-2 text-text-secondary">{c.contentText}</p>
                          <p className="mt-0.5 text-xs text-text-secondary">
                            {formatUpdated(c.createdAt)}
                            {c.workflowId && (
                              <>
                                {" · "}
                                <Link className="font-medium text-primary-strong hover:underline" to={`/workflows/${c.workflowId}`}>
                                  {s.common.openWorkflow}
                                </Link>
                              </>
                            )}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title={s.dashboard.recentActivity} id="recent-activity">
                  {d.recentActivity.length === 0 ? (
                    <p className="text-sm text-text-secondary">{s.dashboard.recentActivityEmpty}</p>
                  ) : (
                    <ActivityList items={d.recentActivity} showWorkflowLink />
                  )}
                </Section>
              </div>
            </div>
          </>
        )}
      </QueryBoundary>

      <Section title={s.calendar.scheduleTitle} id="schedule">
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-navy">{s.calendar.overviewTitle}</h3>
            <p className="text-sm text-text-secondary">{s.calendar.overviewSubtitle}</p>
          </div>
          <CalendarOverview />
        </div>
      </Section>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={s.dashboard.demoResetTitle}
        description={s.dashboard.demoResetBody}
        confirmLabel={s.dashboard.demoReset}
        loading={reset.isPending}
        onConfirm={() => reset.mutate()}
      />
    </div>
  );
}
