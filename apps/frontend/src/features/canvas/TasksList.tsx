import { toast } from "@ritme/design";
import type { TaskOut, TaskStatus } from "@ritme/api-client";
import { useMutation } from "@tanstack/react-query";
import { TaskStatusBadge } from "@/components/ui/status";
import { Section } from "@/components/ui/page";
import { describeError, useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { useRefreshWorkflowData } from "@/lib/queries";
import { s } from "@/i18n";

const T = s.canvas.tasks;
const STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked", "done", "skipped"];

/** F31: the persisted tasks for this workflow, with their real IDs and status changes. */
export function TasksList({ workflowId, tasks, disabled }: { workflowId: string; tasks: TaskOut[]; disabled: boolean }) {
  const api = useApi();
  const refresh = useRefreshWorkflowData();
  const set = useMutation({
    mutationFn: (v: { id: string; status: TaskStatus }) => api.tasks.patch(v.id, { status: v.status }),
    onSuccess: async () => {
      await refresh(workflowId);
      toast.success(s.canvas.plan.statusChanged);
    },
    onError: (e) => toast.error(`${s.canvas.plan.statusFailed} ${describeError(e)}`),
  });
  return (
    <Section title={s.canvas.headings.tasks} description={T.intro} id="tasks">
      {tasks.length === 0 ? (
        <p className="text-sm text-text-secondary">{T.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border" data-testid="tasks-list">
          {tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 p-4" data-testid="task-row" data-task-id={t.id}>
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium text-navy">{t.title}</p>
                <p className="text-xs text-text-secondary">
                  {T.doneWhen}: {t.definitionOfDone}
                </p>
                <p className="text-xs text-text-secondary">
                  {t.dueAt ? T.due(formatDateTime(t.dueAt)) : T.noDue} · {T.ids}: <span className="font-mono">{t.id}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <TaskStatusBadge status={t.status} />
                <label className="sr-only" htmlFor={`status-${t.id}`}>
                  {T.statusFor(t.title)}
                </label>
                <select
                  id={`status-${t.id}`}
                  className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text"
                  value={t.status}
                  disabled={disabled || set.isPending}
                  onChange={(e) => set.mutate({ id: t.id, status: e.target.value as TaskStatus })}
                >
                  {STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {s.status.task[st]}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
