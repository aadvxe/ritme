import type { PlanLayout, PreferencesOut, TaskGranularity, TaskStatus, WorkflowDetail } from "@ritme/api-client";
import { s } from "@/i18n";

export type PlanView = PlanLayout; // "one_step" | "full_list" | "timeline"

/** One step as every plan view sees it: a draft task or a real, persisted task. */
export interface PlanItem {
  key: string;
  taskId: string | null;
  title: string;
  description: string;
  definitionOfDone: string;
  estimatedMinutes: number | null;
  dueAt: string | null;
  /** keys of the items this one waits for */
  dependsOn: string[];
  rationale: string | null;
  status: TaskStatus | null;
}

export const isClosed = (i: Pick<PlanItem, "status">) => i.status === "done" || i.status === "skipped";

/**
 * What the plan panel shows. Real tasks win once they exist (a pending replan is shown as an approval card,
 * not by swapping the plan under the user); otherwise the latest draft; otherwise nothing yet.
 */
export function planItemsFor(d: Pick<WorkflowDetail, "tasks" | "latestPlan">): { items: PlanItem[]; source: "tasks" | "draft" | "none" } {
  if (d.tasks.length > 0) {
    return {
      source: "tasks",
      items: orderItems(
        d.tasks.map((t) => ({
          key: t.id,
          taskId: t.id,
          title: t.title,
          description: t.description,
          definitionOfDone: t.definitionOfDone,
          estimatedMinutes: t.estimatedMinutes,
          dueAt: t.dueAt,
          dependsOn: t.dependsOn,
          rationale: null,
          status: t.status,
        })),
      ),
    };
  }
  if (d.latestPlan && d.latestPlan.status === "draft") {
    return {
      source: "draft",
      items: orderItems(
        d.latestPlan.plan.tasks.map((t) => ({
          key: t.draftId,
          taskId: null,
          title: t.title,
          description: t.description,
          definitionOfDone: t.definitionOfDone,
          estimatedMinutes: t.estimatedMinutes,
          dueAt: t.dueAt,
          dependsOn: t.dependsOnDraftIds,
          rationale: t.rationale,
          status: null,
        })),
      ),
    };
  }
  return { source: "none", items: [] };
}

/** Dependencies first; otherwise the original order. Cycles can't loop forever: leftovers are appended. */
export function orderItems(items: PlanItem[]): PlanItem[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const out: PlanItem[] = [];
  const state = new Map<string, 1 | 2>();
  const visit = (i: PlanItem) => {
    if (state.has(i.key)) return;
    state.set(i.key, 1);
    for (const d of i.dependsOn) {
      const dep = byKey.get(d);
      if (dep && state.get(dep.key) !== 1) visit(dep);
    }
    state.set(i.key, 2);
    out.push(i);
  };
  items.forEach(visit);
  return out;
}

/** The immediate next step: first open item whose dependencies are all closed; else the first open item. */
export function nextStepOf(items: PlanItem[]): PlanItem | null {
  const closed = new Set(items.filter(isClosed).map((i) => i.key));
  const open = items.filter((i) => !isClosed(i));
  return open.find((i) => i.dependsOn.every((d) => closed.has(d) || !items.some((x) => x.key === d))) ?? open[0] ?? null;
}

/** Column index for the timeline plan view: the longest chain of dependencies behind each step. */
export function layersOf(items: PlanItem[]): PlanItem[][] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const depth = new Map<string, number>();
  const calc = (i: PlanItem, seen: Set<string>): number => {
    const known = depth.get(i.key);
    if (known !== undefined) return known;
    if (seen.has(i.key)) return 0;
    seen.add(i.key);
    const d = i.dependsOn.map((k) => byKey.get(k)).filter((x): x is PlanItem => Boolean(x)).reduce((m, x) => Math.max(m, calc(x, seen) + 1), 0);
    depth.set(i.key, d);
    return d;
  };
  items.forEach((i) => calc(i, new Set()));
  const layers: PlanItem[][] = [];
  for (const i of items) (layers[depth.get(i.key) ?? 0] ??= []).push(i);
  return layers.filter(Boolean);
}

/** Default view from the `plan_layout` preference; a per-session choice overrides it. */
export function defaultPlanView(prefs: Pick<PreferencesOut, "planLayout" | "isSet"> | undefined): PlanView {
  return prefs?.isSet ? prefs.planLayout : "full_list";
}

/** The "why it looks like this" line: every adaptation explained in the UI (spec §14.3). */
export function planWhyLines(
  prefs: Pick<PreferencesOut, "planLayout" | "isSet" | "taskGranularity" | "timeEstimates"> | undefined,
  view: PlanView,
  overridden: boolean,
): string[] {
  const p = s.canvas.plan;
  const lines: string[] = [];
  if (!prefs?.isSet) lines.push(p.whyNoPref);
  else if (view === "one_step") lines.push(p.whyOneStep);
  else if (view === "timeline") lines.push(p.whyTimeline);
  else lines.push(p.whyFullList);
  if (overridden && prefs?.isSet && view !== prefs.planLayout) {
    lines.length = 0;
    lines.push(p.whyOverride);
  }
  if (prefs?.isSet) {
    const g: TaskGranularity = prefs.taskGranularity;
    if (g === "small_steps") lines.push(p.whySmall);
    if (g === "larger_blocks") lines.push(p.whyLarge);
    if (prefs.timeEstimates === "hide") lines.push(p.whyHideEstimates);
  }
  return lines;
}

export function estimateText(minutes: number | null, show: boolean): string | null {
  if (!show || minutes === null) return null;
  return `${s.common.minutes(minutes)} (${s.common.estimate})`;
}

/** True when the "waits for" links loop back on themselves. */
export function hasDependencyCycle(items: { key: string; dependsOn: string[] }[]): boolean {
  const deps = new Map(items.map((i) => [i.key, i.dependsOn]));
  const state = new Map<string, 1 | 2>();
  const visit = (k: string): boolean => {
    if (state.get(k) === 2) return false;
    if (state.get(k) === 1) return true;
    state.set(k, 1);
    for (const d of deps.get(k) ?? []) if (deps.has(d) && visit(d)) return true;
    state.set(k, 2);
    return false;
  };
  return items.some((i) => visit(i.key));
}
