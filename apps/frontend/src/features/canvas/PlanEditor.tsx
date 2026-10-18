import { Alert, Button, Field, Input, Modal, Textarea } from "@ritme/design";
import type { PlanTaskDraft, PlanVersionOut } from "@ritme/api-client";
import { format } from "date-fns";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { describeError, useApi } from "@/lib/api";
import { s } from "@/i18n";
import { hasDependencyCycle } from "./plan";

const E = s.canvas.editor;

interface EditTask {
  draftId: string;
  title: string;
  description: string;
  definitionOfDone: string;
  minutes: string;
  due: string; // datetime-local value
  dependsOn: string[];
  rationale: string | null;
  requirementIds: string[];
}

const toLocalInput = (iso: string | null) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "");
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function fromPlan(plan: PlanVersionOut): EditTask[] {
  return plan.plan.tasks.map((t) => ({
    draftId: t.draftId,
    title: t.title,
    description: t.description,
    definitionOfDone: t.definitionOfDone,
    minutes: t.estimatedMinutes === null ? "" : String(t.estimatedMinutes),
    due: toLocalInput(t.dueAt),
    dependsOn: t.dependsOnDraftIds,
    rationale: t.rationale,
    requirementIds: t.requirementIds,
  }));
}

/** F28: edit a draft plan. Saves with the plan's row version, so a stale edit is refused instead of overwriting. */
export function PlanEditor({
  plan,
  open,
  onOpenChange,
  onSaved,
  onReload,
}: {
  plan: PlanVersionOut;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (p: PlanVersionOut) => void;
  onReload: () => void;
}) {
  const api = useApi();
  const [goal, setGoal] = useState(plan.goal);
  const [tasks, setTasks] = useState<EditTask[]>(() => fromPlan(plan));
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const out: PlanTaskDraft[] = tasks.map((t) => ({
        draftId: t.draftId,
        title: t.title.trim(),
        description: t.description,
        definitionOfDone: t.definitionOfDone.trim(),
        estimatedMinutes: t.minutes.trim() === "" ? null : Math.max(0, Math.round(Number(t.minutes))),
        dueAt: fromLocalInput(t.due),
        dependsOnDraftIds: t.dependsOn,
        requirementIds: t.requirementIds,
        rationale: t.rationale,
      }));
      return api.planVersions.patch(plan.id, { rowVersion: plan.rowVersion, goal: goal.trim() || plan.goal, tasks: out });
    },
    onSuccess: (p) => onSaved(p),
  });

  const update = (i: number, patch: Partial<EditTask>) => setTasks((ts) => ts.map((t, n) => (n === i ? { ...t, ...patch } : t)));
  const move = (i: number, d: -1 | 1) =>
    setTasks((ts) => {
      const j = i + d;
      if (j < 0 || j >= ts.length) return ts;
      const next = [...ts];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const remove = (i: number) =>
    setTasks((ts) => {
      const gone = ts[i]?.draftId;
      return ts.filter((_, n) => n !== i).map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => d !== gone) }));
    });
  const add = () =>
    setTasks((ts) => {
      let n = ts.length + 1;
      while (ts.some((t) => t.draftId === `d${n}`)) n += 1;
      return [
        ...ts,
        { draftId: `d${n}`, title: E.newTaskTitle, description: "", definitionOfDone: E.newTaskDone, minutes: "", due: "", dependsOn: [], rationale: null, requirementIds: [] },
      ];
    });

  const submit = () => {
    if (tasks.some((t) => !t.title.trim() || !t.definitionOfDone.trim())) return setProblem(E.invalid);
    if (hasDependencyCycle(tasks.map((t) => ({ key: t.draftId, dependsOn: t.dependsOn })))) return setProblem(E.cycle);
    setProblem(null);
    save.mutate();
  };

  const conflict = (save.error as { status?: number } | null)?.status === 409;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={E.title}
      description={E.intro}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {s.common.cancel}
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={conflict}>
            {save.isPending ? E.saving : E.save}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label={E.goalLabel} htmlFor="plan-goal">
          <Input id="plan-goal" autoFocus value={goal} onChange={(e) => setGoal(e.target.value)} />
        </Field>

        <ol className="space-y-4">
          {tasks.map((t, i) => (
            <li key={t.draftId} className="space-y-3 rounded-xl border border-border p-4" data-testid="editor-task">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-navy">{s.canvas.plan.step(i + 1, tasks.length)}</h4>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${E.moveUp}: ${t.title}`}>
                    {E.moveUp}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === tasks.length - 1} aria-label={`${E.moveDown}: ${t.title}`}>
                    {E.moveDown}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(i)} aria-label={`${E.removeTask}: ${t.title}`}>
                    {E.removeTask}
                  </Button>
                </div>
              </div>
              <Field label={E.taskTitle} htmlFor={`t-title-${t.draftId}`}>
                <Input id={`t-title-${t.draftId}`} value={t.title} onChange={(e) => update(i, { title: e.target.value })} />
              </Field>
              <Field label={E.taskDone} htmlFor={`t-done-${t.draftId}`}>
                <Input id={`t-done-${t.draftId}`} value={t.definitionOfDone} onChange={(e) => update(i, { definitionOfDone: e.target.value })} />
              </Field>
              <Field label={E.taskDesc} htmlFor={`t-desc-${t.draftId}`}>
                <Textarea id={`t-desc-${t.draftId}`} rows={2} value={t.description} onChange={(e) => update(i, { description: e.target.value })} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={E.taskMinutes} htmlFor={`t-min-${t.draftId}`}>
                  <Input id={`t-min-${t.draftId}`} inputMode="numeric" type="number" min={0} value={t.minutes} onChange={(e) => update(i, { minutes: e.target.value })} />
                </Field>
                <Field label={E.taskDue} htmlFor={`t-due-${t.draftId}`} hint={E.taskDueHint}>
                  <Input id={`t-due-${t.draftId}`} type="datetime-local" value={t.due} onChange={(e) => update(i, { due: e.target.value })} />
                </Field>
              </div>
              {tasks.length > 1 && (
                <fieldset>
                  <legend className="mb-1 text-sm font-medium text-navy">{E.dependsOn}</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {tasks
                      .filter((o) => o.draftId !== t.draftId)
                      .map((o) => (
                        <label key={o.draftId} className="flex items-center gap-2 text-sm text-text">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[rgb(74,85,194)]"
                            checked={t.dependsOn.includes(o.draftId)}
                            onChange={(e) =>
                              update(i, { dependsOn: e.target.checked ? [...t.dependsOn, o.draftId] : t.dependsOn.filter((d) => d !== o.draftId) })
                            }
                          />
                          {o.title}
                        </label>
                      ))}
                  </div>
                </fieldset>
              )}
            </li>
          ))}
        </ol>
        <Button variant="outline" onClick={add}>
          {E.addTask}
        </Button>

        {problem && <Alert tone="error" title={problem} />}
        {save.isError && (
          <Alert tone="error" title={conflict ? E.conflict : s.common.unknownError}>
            {conflict ? (
              <Button size="sm" variant="outline" className="mt-2" onClick={onReload}>
                {E.reload}
              </Button>
            ) : (
              describeError(save.error)
            )}
          </Alert>
        )}
      </div>
    </Modal>
  );
}
