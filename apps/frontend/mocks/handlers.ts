/**
 * Route handlers for the mock API. Pure functions over MockStore so they can be used from the browser
 * (mock-fetch.ts) and from tests. Response shapes match @ritme/api-client exactly.
 */
import type {
  ActivityEventOut,
  CalendarItem,
  CalendarOverview,
  Citation,
  ClarificationQuestion,
  ConnectedDevice,
  DashboardOut,
  PlanPatch,
  PlanTaskDraft1,
  PlanVersionOut,
  PreferencesOut,
  PreferencesPatch,
  ProposedActionOut,
  TaskOut,
  WorkflowDetail,
  WorkflowSummary,
} from "@ritme/api-client";
import { buildPlanTasks, computeReplan, parseDeadline, runExtraction } from "./engine";
import {
  DEFAULT_PREFS,
  addKnowledge,
  chunkText,
  logActivity,
  nextId,
  seedDemo,
  type MockStore,
  type WorkflowRec,
} from "./store";

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  authorized: boolean;
}
export interface MockResponse {
  status: number;
  body?: unknown;
}

export interface HandlerOptions {
  now: () => Date;
  /** How long "analyzing" lasts before it finishes on the next read. 0 finishes immediately. */
  analysisMs: number;
  maxCaptureChars: number;
}

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
const notFound = (what = "That item") => new HttpError(404, "not_found", `${what} was not found.`);
const bad = (m: string) => new HttpError(400, "invalid_input", m);
const conflict = (m: string) => new HttpError(409, "conflict", m);
const invalidAction = (m: string) => new HttpError(422, "invalid_action", m);

type Params = string[];
type Handler = (ctx: Ctx, p: Params) => MockResponse | unknown;
interface Ctx {
  store: MockStore;
  req: MockRequest;
  opts: HandlerOptions;
  now: Date;
  body: Record<string, unknown>;
}

/* ------------------------------------------------------------------------------------------ helpers */

function findWf(store: MockStore, id: string | undefined): WorkflowRec {
  const rec = store.db.workflows.find((w) => w.summary.id === id);
  if (!rec) throw notFound("That workflow");
  return rec;
}

function touch(rec: WorkflowRec, now: Date) {
  rec.summary.updatedAt = now.toISOString();
}

function openBlocking(rec: WorkflowRec): ClarificationQuestion[] {
  return rec.questions.filter((q) => q.blocking && q.status === "open");
}

function refreshStatus(rec: WorkflowRec) {
  if (rec.summary.status === "needs_input" || rec.summary.status === "planning") {
    const n = openBlocking(rec).length;
    rec.summary.status = n > 0 ? "needs_input" : "planning";
    rec.summary.nextAction = n > 0 ? "Answer the open questions" : "Create a plan";
  }
}

function finishAnalysisIfDue(ctx: Ctx, rec: WorkflowRec) {
  if (rec.summary.status !== "analyzing" || !rec.analyzingSince) return;
  const age = ctx.now.getTime() - new Date(rec.analyzingSince).getTime();
  if (age < ctx.opts.analysisMs) return;
  const capture = ctx.store.db.captures.find((c) => c.id === rec.summary.captureId);
  if (!capture) return;
  runExtraction(ctx.store.db, rec, capture, ctx.now);
  logActivity(ctx.store.db, ctx.now, rec.summary.id, "analysis_done", `Read the text: ${rec.requirements.length} items found, ${openBlocking(rec).length} question(s) need your input`);
  ctx.store.commit();
}

function resumeOf(ctx: Ctx, rec: WorkflowRec) {
  const capture = ctx.store.db.captures.find((c) => c.id === rec.summary.captureId) ?? null;
  return {
    lastCompletedStep: rec.lastCompletedStep,
    nextAction: rec.summary.nextAction,
    openQuestionCount: rec.questions.filter((q) => q.status === "open").length,
    sourceTitle: capture?.sourcePageTitle ?? capture?.title ?? null,
    sourceUrl: capture?.sourceUrl ?? null,
    status: rec.summary.status,
    userNote: capture?.userNote ?? null,
  };
}

function detail(ctx: Ctx, rec: WorkflowRec): WorkflowDetail {
  finishAnalysisIfDue(ctx, rec);
  const capture = ctx.store.db.captures.find((c) => c.id === rec.summary.captureId) ?? null;
  const latestPlan = rec.plans.length ? rec.plans[rec.plans.length - 1]! : null;
  return {
    workflow: { ...rec.summary },
    capture,
    requirements: rec.requirements,
    questions: rec.questions,
    latestPlan,
    actions: rec.actions,
    tasks: rec.tasks,
    sources: rec.sources,
    resume: resumeOf(ctx, rec),
  };
}

function taskFromDraft(ctx: Ctx, rec: WorkflowRec, d: PlanTaskDraft1, idMap: Map<string, string>, actionId: string, planId: string): TaskOut {
  const iso = ctx.now.toISOString();
  return {
    id: idMap.get(d.draftId)!,
    workflowId: rec.summary.id,
    title: d.title,
    description: d.description,
    definitionOfDone: d.definitionOfDone,
    estimatedMinutes: d.estimatedMinutes,
    dueAt: d.dueAt,
    dependsOn: d.dependsOnDraftIds.map((x) => idMap.get(x)).filter((x): x is string => Boolean(x)),
    requirementIds: d.requirementIds,
    status: "todo",
    planVersionId: planId,
    createdByActionId: actionId,
    createdAt: iso,
    updatedAt: iso,
  };
}

function hasCycle(tasks: PlanTaskDraft1[]): boolean {
  const deps = new Map(tasks.map((t) => [t.draftId, t.dependsOnDraftIds]));
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 2) return false;
    if (state.get(id) === 1) return true;
    state.set(id, 1);
    for (const d of deps.get(id) ?? []) if (deps.has(d) && visit(d)) return true;
    state.set(id, 2);
    return false;
  };
  return tasks.some((t) => visit(t.draftId));
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/* ------------------------------------------------------------------------------------------ routes */

const routes: [string, RegExp, Handler][] = [];
const route = (method: string, pattern: string, h: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:[a-z]+/g, "([^/]+)")}$`), h]);

route("GET", "/api/healthz", () => ({ status: "ok" }));

/* identity */
route("GET", "/api/me", (c) => c.store.db.me);
route("POST", "/api/me/onboarding", (c) => {
  c.store.db.me.onboardingCompleted = true;
  c.store.commit();
  return c.store.db.me;
});

/* dashboard */
route("GET", "/api/dashboard", (c): DashboardOut => {
  const db = c.store.db;
  db.workflows.forEach((w) => finishAnalysisIfDue(c, w));
  const live = db.workflows.filter((w) => !["cancelled", "completed"].includes(w.summary.status));
  const needsInput = live.flatMap((w) =>
    w.questions
      .filter((q) => q.status === "open")
      .map((q) => ({ question: q.question, questionId: q.id, workflowId: w.summary.id, workflowTitle: w.summary.title })),
  );
  const needsApproval = live.flatMap((w) =>
    w.actions
      .filter((a) => a.status === "pending_approval")
      .map((a) => ({ actionId: a.id, summary: a.reasonSummary, workflowId: w.summary.id, workflowTitle: w.summary.title })),
  );
  let next: DashboardOut["nextBestStep"] = null;
  const first = live.find((w) => !w.summary.paused);
  if (first) {
    const q = first.questions.find((x) => x.status === "open" && x.blocking);
    const pending = first.actions.find((a) => a.status === "pending_approval");
    const task = first.tasks.find((t) => t.status === "todo" || t.status === "in_progress");
    const text = q
      ? `Answer: ${q.question}`
      : pending
        ? "Review the proposed change and decide"
        : task
          ? task.title
          : first.summary.status === "planning"
            ? "Create a plan from your answers"
            : null;
    if (text) next = { text, workflowId: first.summary.id, workflowTitle: first.summary.title };
  }
  return {
    activeWorkflows: live.map((w) => ({ ...w.summary })),
    needsApproval,
    needsInput,
    nextBestStep: next,
    recentActivity: db.activity.slice(0, 8),
    recentCaptures: db.captures.filter((x) => x.status !== "deleted").slice(0, 5),
  };
});

route("GET", "/api/calendar-overview", (c): CalendarOverview => {
  const from = str(c.req.query.get("from"));
  const to = str(c.req.query.get("to"));
  if (!from || !to) throw bad("from and to are required.");
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) throw bad("from and to must be valid dates.");
  if ((end - start) / 86_400_000 > 62) throw bad("The range can be at most 62 days.");
  const items: CalendarItem[] = [];
  const undated: CalendarItem[] = [];
  for (const w of c.store.db.workflows) {
    if (["cancelled"].includes(w.summary.status)) continue;
    if (w.summary.confirmedDueAt) {
      const t = new Date(w.summary.confirmedDueAt).getTime();
      if (t >= start && t <= end) {
        items.push({
          id: `deadline_${w.summary.id}`,
          type: "workflow_deadline",
          title: w.summary.title,
          workflowId: w.summary.id,
          workflowTitle: w.summary.title,
          dueAt: w.summary.confirmedDueAt,
          status: w.summary.status,
          dependsOn: [],
        });
      }
    }
    for (const t of w.tasks) {
      const base: CalendarItem = {
        id: t.id,
        type: "task",
        title: t.title,
        workflowId: w.summary.id,
        workflowTitle: w.summary.title,
        dueAt: t.dueAt,
        status: t.status,
        dependsOn: t.dependsOn,
      };
      if (!t.dueAt) undated.push({ ...base, dueAt: null });
      else {
        const at = new Date(t.dueAt).getTime();
        if (at >= start && at <= end) items.push(base);
      }
    }
  }
  items.sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
  return { items, undated };
});

/* captures */
route("POST", "/api/captures", (c) => {
  const b = c.body;
  const text = str(b.contentText) ?? "";
  const key = str(b.idempotencyKey);
  if (!text.trim()) throw bad("There is no text to save.");
  if (!key) throw bad("An idempotency key is required.");
  if (text.length > c.opts.maxCaptureChars) throw new HttpError(413, "payload_too_large", "That text is too long to save.");
  const db = c.store.db;
  const existingId = db.idempotency[key];
  if (existingId) {
    const cap = db.captures.find((x) => x.id === existingId)!;
    const rec = findWf(c.store, cap.workflowId ?? undefined);
    return { capture: cap, created: false, nextUrl: `/workflows/${rec.summary.id}`, workflow: rec.summary };
  }
  const iso = c.now.toISOString();
  const capId = nextId(db, "cap");
  const wfId = nextId(db, "wf");
  const url = (b.sourceUrl as string | null | undefined) ?? null;
  const cap = {
    id: capId,
    contentText: text,
    createdAt: iso,
    sourceDomain: (b.sourceDomain as string | null | undefined) ?? null,
    sourcePageTitle: (b.sourcePageTitle as string | null | undefined) ?? null,
    sourceType: (b.sourceType as "manual_text") ?? "manual_text",
    sourceUrl: url,
    status: "submitted" as const,
    title: (b.title as string | null | undefined) ?? null,
    updatedAt: iso,
    userNote: (b.userNote as string | null | undefined) ?? null,
    workflowId: wfId,
  };
  db.captures.unshift(cap);
  const summary: WorkflowSummary = {
    captureId: capId,
    confirmedDueAt: null,
    createdAt: iso,
    currentPlanVersion: null,
    currentStep: "Saved. Not read yet.",
    id: wfId,
    isDemo: false,
    nextAction: "Read the text",
    objective: null,
    paused: false,
    status: "captured",
    title: cap.title ?? cap.sourcePageTitle ?? text.slice(0, 48).trim(),
    updatedAt: iso,
    version: 1,
  };
  db.workflows.unshift({
    summary,
    requirements: [],
    questions: [],
    plans: [],
    actions: [],
    tasks: [],
    sources: [],
    resumeNote: null,
    lastCompletedStep: "Saved your text",
    analyzingSince: null,
  });
  db.idempotency[key] = capId;
  logActivity(db, c.now, wfId, "capture_saved", "Saved your text");
  c.store.commit();
  return { capture: cap, created: true, nextUrl: `/workflows/${wfId}`, workflow: summary };
});
route("GET", "/api/captures", (c) => {
  const limit = Number(c.req.query.get("limit") ?? 20);
  return c.store.db.captures.filter((x) => x.status !== "deleted").slice(0, limit);
});
route("GET", "/api/captures/:id", (c, [id]) => {
  const cap = c.store.db.captures.find((x) => x.id === id && x.status !== "deleted");
  if (!cap) throw notFound("That capture");
  return cap;
});
route("DELETE", "/api/captures/:id", (c, [id]) => {
  const db = c.store.db;
  const i = db.captures.findIndex((x) => x.id === id);
  if (i < 0) throw notFound("That capture");
  db.captures.splice(i, 1);
  for (const w of db.workflows) if (w.summary.captureId === id) w.summary.captureId = null;
  c.store.commit();
  return { deleted: true, removed: { captures: 1 } };
});
route("POST", "/api/captures/:id/analyze", (c, [id]) => {
  const cap = c.store.db.captures.find((x) => x.id === id);
  if (!cap) throw notFound("That capture");
  const rec = findWf(c.store, cap.workflowId ?? undefined);
  if (rec.summary.status === "captured" || rec.summary.status === "failed") {
    rec.summary.status = "analyzing";
    rec.summary.currentStep = "Reading your text";
    rec.analyzingSince = c.now.toISOString();
    touch(rec, c.now);
    logActivity(c.store.db, c.now, rec.summary.id, "analysis_started", "Started reading your text");
    finishAnalysisIfDue(c, rec);
    c.store.commit();
  }
  return { ...rec.summary };
});

/* workflows */
route("GET", "/api/workflows", (c) => {
  const status = c.req.query.get("status");
  c.store.db.workflows.forEach((w) => finishAnalysisIfDue(c, w));
  return c.store.db.workflows.filter((w) => !status || w.summary.status === status).map((w) => ({ ...w.summary }));
});
route("GET", "/api/workflows/:id", (c, [id]) => detail(c, findWf(c.store, id)));
route("PATCH", "/api/workflows/:id", (c, [id]) => {
  const rec = findWf(c.store, id);
  if (c.body.version !== rec.summary.version) throw conflict("This workflow changed. Reload to see the latest.");
  const b = c.body;
  if (typeof b.title === "string") rec.summary.title = b.title;
  if (typeof b.objective === "string") rec.summary.objective = b.objective;
  if (typeof b.nextAction === "string") rec.summary.nextAction = b.nextAction;
  if ("confirmedDueAt" in b) rec.summary.confirmedDueAt = (b.confirmedDueAt as string | null) ?? null;
  rec.summary.version += 1;
  touch(rec, c.now);
  logActivity(c.store.db, c.now, rec.summary.id, "workflow_edited", "You edited the workflow");
  c.store.commit();
  return { ...rec.summary };
});
route("DELETE", "/api/workflows/:id", (c, [id]) => {
  const db = c.store.db;
  const rec = findWf(c.store, id);
  db.workflows = db.workflows.filter((w) => w !== rec);
  db.activity = db.activity.filter((a) => a.workflowId !== id);
  for (const cap of db.captures) if (cap.workflowId === id) cap.workflowId = null;
  c.store.commit();
  return { deleted: true, removed: { workflows: 1, tasks: rec.tasks.length, planVersions: rec.plans.length } };
});
route("POST", "/api/workflows/:id/pause", (c, [id]) => {
  const rec = findWf(c.store, id);
  rec.summary.paused = true;
  touch(rec, c.now);
  logActivity(c.store.db, c.now, rec.summary.id, "paused", "You paused this workflow");
  c.store.commit();
  return { ...rec.summary };
});
route("POST", "/api/workflows/:id/resume", (c, [id]) => {
  const rec = findWf(c.store, id);
  rec.summary.paused = false;
  touch(rec, c.now);
  logActivity(c.store.db, c.now, rec.summary.id, "resumed", "You resumed this workflow");
  c.store.commit();
  return { ...rec.summary };
});
route("POST", "/api/workflows/:id/cancel", (c, [id]) => {
  const rec = findWf(c.store, id);
  rec.summary.status = "cancelled";
  rec.summary.nextAction = null;
  for (const a of rec.actions) if (a.status === "pending_approval") a.status = "cancelled";
  touch(rec, c.now);
  logActivity(c.store.db, c.now, rec.summary.id, "cancelled", "You cancelled this workflow");
  c.store.commit();
  return { ...rec.summary };
});

function activityPage(c: Ctx, wfId: string | null) {
  const all = c.store.db.activity.filter((a) => wfId === null || a.workflowId === wfId);
  const offset = Number(c.req.query.get("cursor") ?? 0) || 0;
  const limit = Number(c.req.query.get("limit") ?? 30) || 30;
  const items: ActivityEventOut[] = all.slice(offset, offset + limit);
  return { items, nextCursor: offset + limit < all.length ? String(offset + limit) : null };
}
route("GET", "/api/workflows/:id/activity", (c, [id]) => {
  findWf(c.store, id);
  return activityPage(c, id!);
});
route("GET", "/api/activity", (c) => activityPage(c, null));

/* truth board */
route("PATCH", "/api/workflows/:id/requirements/:rid", (c, [id, rid]) => {
  const rec = findWf(c.store, id);
  const i = rec.requirements.findIndex((r) => r.id === rid);
  if (i < 0) throw notFound("That item");
  const req = rec.requirements[i]!;
  const b = c.body;
  if (b.reject === true) {
    rec.requirements.splice(i, 1);
    logActivity(c.store.db, c.now, rec.summary.id, "requirement_rejected", "You rejected an item on the Truth Board");
  } else {
    if (typeof b.text === "string" && b.text.trim()) {
      req.text = b.text.trim();
      if (req.certainty !== "explicit") req.certainty = "explicit";
    }
    if (b.confirm === true || typeof b.text === "string") {
      req.userConfirmedAt = c.now.toISOString();
      if (req.certainty === "unknown" || req.certainty === "conflicting") req.certainty = "explicit";
      logActivity(c.store.db, c.now, rec.summary.id, "requirement_confirmed", `You confirmed: ${req.text}`);
    }
  }
  touch(rec, c.now);
  c.store.commit();
  return req;
});

route("POST", "/api/workflows/:id/questions/:qid/answer", (c, [id, qid]) => {
  const rec = findWf(c.store, id);
  const q = rec.questions.find((x) => x.id === qid);
  if (!q) throw notFound("That question");
  const disposition = str(c.body.disposition) ?? "answer";
  if (disposition === "defer_nonblocking") {
    const label = str(c.body.assumptionLabel)?.trim();
    if (!label) throw bad("Write the assumption you will continue with.");
    q.status = "deferred";
    q.answer = label;
    logActivity(c.store.db, c.now, rec.summary.id, "question_deferred", `You continued with an assumption: ${label}`);
  } else {
    const answer = str(c.body.answer)?.trim();
    if (!answer) throw bad("Write an answer first.");
    q.status = "answered";
    q.answer = answer;
    for (const rid of q.relatedRequirementIds) {
      const req = rec.requirements.find((r) => r.id === rid);
      if (!req) continue;
      if (req.kind === "deadline") {
        const parsed = parseDeadline(answer, c.now);
        if (parsed) {
          rec.summary.confirmedDueAt = parsed;
          req.text = `Deadline: ${answer}`;
          req.certainty = "explicit";
          req.userConfirmedAt = c.now.toISOString();
        }
      } else {
        req.text = `${answer}`;
        req.certainty = "explicit";
        req.userConfirmedAt = c.now.toISOString();
      }
    }
    logActivity(c.store.db, c.now, rec.summary.id, "question_answered", "You answered a question");
  }
  refreshStatus(rec);
  rec.lastCompletedStep = "Answered an open question";
  touch(rec, c.now);
  c.store.commit();
  return detail(c, rec);
});
route("POST", "/api/workflows/:id/questions/:qid/draft", (c, [id, qid]) => {
  const rec = findWf(c.store, id);
  const q = rec.questions.find((x) => x.id === qid);
  if (!q) throw notFound("That question");
  const style = c.store.db.prefs.communicationStyle;
  const opening = style === "make_expectations_explicit" ? "Hi, I want to plan this properly, so I need one detail from you." : "Hi, quick question so I can get this right.";
  const message = `${opening}\n\n${q.question}\n\n${style === "make_expectations_explicit" ? "A short reply is fine. Once I have it I can set the dates and next steps." : "A short reply is plenty. Thanks!"}`;
  return { questionId: q.id, message, notes: "This is a draft for you to edit and send yourself. Ritme does not send it." };
});

/* plans */
route("POST", "/api/workflows/:id/plan", (c, [id]) => {
  const rec = findWf(c.store, id);
  if (rec.summary.paused) throw conflict("This workflow is paused.");
  if (openBlocking(rec).length > 0) throw conflict("Answer or continue past the open questions first.");
  if (rec.tasks.length > 0) throw conflict("This workflow already has tasks. Use Something changed to replan.");
  for (const p of rec.plans) if (p.status === "draft") p.status = "superseded";
  const version = rec.plans.length + 1;
  const tasks = buildPlanTasks(rec, c.store.db.prefs, c.now);
  const iso = c.now.toISOString();
  const plan: PlanVersionOut = {
    id: nextId(c.store.db, "plan"),
    workflowId: rec.summary.id,
    version,
    status: "draft",
    createdBy: "agent",
    goal: rec.summary.objective ?? rec.summary.title,
    plan: {
      version,
      goal: rec.summary.objective ?? rec.summary.title,
      proposedChanges: null,
      tasks,
      unresolvedItems: rec.questions.filter((q) => q.status === "deferred").map((q) => `Assuming: ${q.answer ?? ""}`),
    },
    rowVersion: 1,
    createdAt: iso,
    updatedAt: iso,
  };
  rec.plans.push(plan);
  rec.summary.currentPlanVersion = version;
  rec.summary.currentStep = `Drafted plan version ${version}`;
  rec.lastCompletedStep = rec.summary.currentStep;
  rec.summary.nextAction = "Review the plan and approve it";
  touch(rec, c.now);
  logActivity(c.store.db, c.now, rec.summary.id, "plan_drafted", `Drafted plan version ${version} with ${tasks.length} steps`);
  c.store.commit();
  return plan;
});

function findPlan(store: MockStore, id: string | undefined): { rec: WorkflowRec; plan: PlanVersionOut } {
  for (const rec of store.db.workflows) {
    const plan = rec.plans.find((p) => p.id === id);
    if (plan) return { rec, plan };
  }
  throw notFound("That plan");
}

route("PATCH", "/api/plan-versions/:id", (c, [id]) => {
  const { rec, plan } = findPlan(c.store, id);
  const b = c.body as unknown as PlanPatch;
  if (b.rowVersion !== plan.rowVersion) throw conflict("This plan changed somewhere else.");
  if (plan.status !== "draft") throw invalidAction("Only a draft plan can be edited.");
  if (typeof b.goal === "string") {
    plan.goal = b.goal;
    plan.plan.goal = b.goal;
  }
  if (Array.isArray(b.tasks)) {
    const tasks: PlanTaskDraft1[] = b.tasks.map((t) => ({
      draftId: t.draftId,
      title: t.title,
      description: t.description ?? "",
      definitionOfDone: t.definitionOfDone,
      estimatedMinutes: t.estimatedMinutes ?? null,
      dueAt: t.dueAt ?? null,
      dependsOnDraftIds: t.dependsOnDraftIds ?? [],
      requirementIds: t.requirementIds ?? [],
      rationale: t.rationale ?? null,
    }));
    if (tasks.some((t) => !t.title.trim() || !t.definitionOfDone.trim())) throw bad("Each step needs a title and a definition of done.");
    if (hasCycle(tasks)) throw bad("Steps can't depend on each other in a loop.");
    plan.plan.tasks = tasks;
  }
  plan.rowVersion += 1;
  plan.createdBy = "user";
  plan.updatedAt = c.now.toISOString();
  // Approved payloads are immutable: an edit invalidates any pending approval for this plan.
  for (const a of rec.actions) if (a.status === "pending_approval" && a.planVersionId === plan.id) a.status = "cancelled";
  touch(rec, c.now);
  logActivity(c.store.db, c.now, rec.summary.id, "plan_edited", "You edited the plan");
  c.store.commit();
  return plan;
});

/* actions */
route("POST", "/api/workflows/:id/actions", (c, [id]) => {
  const rec = findWf(c.store, id);
  const planId = str(c.body.planVersionId);
  const plan = rec.plans.find((p) => p.id === planId);
  if (!plan) throw notFound("That plan");
  if (plan.status !== "draft") throw invalidAction("Only a draft plan can be proposed.");
  for (const a of rec.actions) if (a.status === "pending_approval") a.status = "cancelled";
  const iso = c.now.toISOString();
  const action: ProposedActionOut = {
    id: nextId(c.store.db, "act"),
    workflowId: rec.summary.id,
    actionType: "create_tasks",
    status: "pending_approval",
    provider: "ritme",
    planVersionId: plan.id,
    reasonSummary: `Create ${plan.plan.tasks.length} tasks in Ritme from plan version ${plan.version}`,
    payload: { tasks: plan.plan.tasks, planVersion: plan.version, goal: plan.goal },
    resultIds: [],
    resultSummary: null,
    verification: "not_run",
    errorCode: null,
    createdAt: iso,
    approvedAt: null,
    executedAt: null,
  };
  rec.actions.push(action);
  rec.summary.status = "ready_for_approval";
  rec.summary.nextAction = "Approve or change the proposed tasks";
  touch(rec, c.now);
  logActivity(c.store.db, c.now, rec.summary.id, "action_proposed", action.reasonSummary);
  c.store.commit();
  return action;
});

function findAction(store: MockStore, id: string | undefined): { rec: WorkflowRec; action: ProposedActionOut } {
  for (const rec of store.db.workflows) {
    const action = rec.actions.find((a) => a.id === id);
    if (action) return { rec, action };
  }
  throw notFound("That approval");
}

route("POST", "/api/actions/:id/approve", (c, [id]) => {
  const { rec, action } = findAction(c.store, id);
  if (action.status !== "pending_approval") throw invalidAction("This is not waiting for approval.");
  action.status = "approved";
  action.approvedAt = c.now.toISOString();
  touch(rec, c.now);
  logActivity(c.store.db, c.now, rec.summary.id, "action_approved", "You approved the proposal");
  c.store.commit();
  return action;
});
route("POST", "/api/actions/:id/reject", (c, [id]) => {
  const { rec, action } = findAction(c.store, id);
  if (action.status !== "pending_approval" && action.status !== "approved") throw invalidAction("This can no longer be rejected.");
  action.status = "rejected";
  rec.summary.status = rec.tasks.length ? "in_progress" : "planning";
  rec.summary.nextAction = rec.tasks.length ? "Work through your tasks" : "Create a plan";
  touch(rec, c.now);
  logActivity(c.store.db, c.now, rec.summary.id, "action_rejected", "You rejected the proposal. Nothing was created.");
  c.store.commit();
  return action;
});
route("POST", "/api/actions/:id/execute", (c, [id]) => {
  const { rec, action } = findAction(c.store, id);
  if (action.status === "succeeded") return action; // idempotent: never create twice
  if (action.status !== "approved" && action.status !== "failed") throw invalidAction("Only an approved action can run.");
  const db = c.store.db;
  const iso = c.now.toISOString();
  if (action.actionType === "create_tasks") {
    const plan = rec.plans.find((p) => p.id === action.planVersionId)!;
    const drafts = (action.payload.tasks as PlanTaskDraft1[]) ?? [];
    const idMap = new Map<string, string>(drafts.map((d) => [d.draftId, nextId(db, "task")]));
    const created = drafts.map((d) => taskFromDraft(c, rec, d, idMap, action.id, plan.id));
    rec.tasks.push(...created);
    plan.status = "approved";
    action.resultIds = created.map((t) => t.id);
    action.resultSummary = `Created ${created.length} tasks`;
  } else {
    const updates = (action.payload.updates as { taskId: string; after: { dueAt: string | null; title: string } }[]) ?? [];
    for (const u of updates) {
      const t = rec.tasks.find((x) => x.id === u.taskId);
      if (t) {
        t.dueAt = u.after.dueAt;
        t.updatedAt = iso;
      }
    }
    if ("newConfirmedDueAt" in action.payload && action.payload.newConfirmedDueAt !== undefined) {
      rec.summary.confirmedDueAt = action.payload.newConfirmedDueAt as string | null;
    }
    const plan = rec.plans.find((p) => p.id === action.planVersionId);
    if (plan) {
      for (const p of rec.plans) if (p.status === "approved") p.status = "superseded";
      plan.status = "approved";
    }
    action.resultIds = updates.map((u) => u.taskId);
    action.resultSummary = `Updated ${updates.length} tasks`;
  }
  // Read-after-write verification: re-read what was just written.
  const present = action.resultIds.filter((rid) => rec.tasks.some((t) => t.id === rid));
  action.verification = present.length === action.resultIds.length ? "verified" : "unverified";
  action.status = "succeeded";
  action.executedAt = iso;
  rec.summary.status = rec.tasks.every((t) => t.status === "done" || t.status === "skipped") ? "completed" : "in_progress";
  const next = rec.tasks.find((t) => t.status !== "done" && t.status !== "skipped");
  rec.summary.nextAction = next ? next.title : null;
  rec.summary.currentStep = action.resultSummary;
  rec.lastCompletedStep = action.resultSummary;
  touch(rec, c.now);
  logActivity(db, c.now, rec.summary.id, "action_executed", `${action.resultSummary} (${action.verification === "verified" ? "Verified" : "Unverified"})`, {
    resultIds: action.resultIds,
    verification: action.verification,
  });
  c.store.commit();
  return action;
});

route("POST", "/api/workflows/:id/replan", (c, [id]) => {
  const rec = findWf(c.store, id);
  if (rec.tasks.length === 0) throw conflict("There are no tasks to replan yet.");
  const trigger = str(c.body.trigger) as "request_changed" | "could_not_work" | undefined;
  if (trigger !== "request_changed" && trigger !== "could_not_work") throw bad("Choose what changed.");
  const newDueAt = (c.body.newDueAt as string | null | undefined) ?? null;
  const newText = (c.body.newText as string | null | undefined) ?? null;
  if (trigger === "request_changed" && !newDueAt && !newText) throw bad("Tell Ritme what changed.");
  for (const a of rec.actions) if (a.status === "pending_approval") a.status = "cancelled";
  const result = computeReplan(rec, { trigger, newDueAt, newText }, c.now);
  const iso = c.now.toISOString();
  const version = rec.plans.length + 1;
  const afterTasks: PlanTaskDraft1[] = rec.tasks.map((t) => {
    const u = result.updates.find((x) => x.taskId === t.id);
    return {
      draftId: t.id,
      title: t.title,
      description: t.description,
      definitionOfDone: t.definitionOfDone,
      estimatedMinutes: t.estimatedMinutes,
      dueAt: u ? u.after.dueAt : t.dueAt,
      dependsOnDraftIds: t.dependsOn,
      requirementIds: t.requirementIds,
      rationale: null,
    };
  });
  const plan: PlanVersionOut = {
    id: nextId(c.store.db, "plan"),
    workflowId: rec.summary.id,
    version,
    status: "draft",
    createdBy: "agent",
    goal: rec.summary.objective ?? rec.summary.title,
    plan: { version, goal: rec.summary.objective ?? rec.summary.title, proposedChanges: result.diff, tasks: afterTasks, unresolvedItems: [] },
    rowVersion: 1,
    createdAt: iso,
    updatedAt: iso,
  };
  rec.plans.push(plan);
  const action: ProposedActionOut = {
    id: nextId(c.store.db, "act"),
    workflowId: rec.summary.id,
    actionType: "update_tasks",
    status: "pending_approval",
    provider: "ritme",
    planVersionId: plan.id,
    reasonSummary: `Change ${result.updates.length} task${result.updates.length === 1 ? "" : "s"} after “${trigger === "request_changed" ? "the request changed" : "I couldn't work on this"}”`,
    payload: { updates: result.updates, diff: result.diff, newConfirmedDueAt: result.newConfirmedDueAt },
    resultIds: [],
    resultSummary: null,
    verification: "not_run",
    errorCode: null,
    createdAt: iso,
    approvedAt: null,
    executedAt: null,
  };
  rec.actions.push(action);
  rec.summary.currentPlanVersion = version;
  rec.summary.status = "ready_for_approval";
  rec.summary.nextAction = "Review the before and after, then approve";
  touch(rec, c.now);
  logActivity(c.store.db, c.now, rec.summary.id, "replan_proposed", `Worked out a change: ${result.blastRadiusTaskIds.length} task(s) affected`);
  c.store.commit();
  return { action, blastRadiusTaskIds: result.blastRadiusTaskIds, diff: result.diff, plan };
});

/* tasks */
route("GET", "/api/workflows/:id/tasks", (c, [id]) => findWf(c.store, id).tasks);
route("PATCH", "/api/tasks/:id", (c, [id]) => {
  for (const rec of c.store.db.workflows) {
    const t = rec.tasks.find((x) => x.id === id);
    if (!t) continue;
    const b = c.body;
    if (typeof b.status === "string") t.status = b.status as TaskOut["status"];
    if (typeof b.title === "string") t.title = b.title;
    if (typeof b.description === "string") t.description = b.description;
    if (typeof b.definitionOfDone === "string") t.definitionOfDone = b.definitionOfDone;
    t.updatedAt = c.now.toISOString();
    const allClosed = rec.tasks.every((x) => x.status === "done" || x.status === "skipped");
    if (allClosed) rec.summary.status = "completed";
    else if (rec.summary.status === "completed") rec.summary.status = "in_progress";
    const next = rec.tasks.find((x) => x.status !== "done" && x.status !== "skipped");
    rec.summary.nextAction = next ? next.title : null;
    if (t.status === "done") rec.lastCompletedStep = `Finished: ${t.title}`;
    touch(rec, c.now);
    logActivity(c.store.db, c.now, rec.summary.id, "task_updated", `Marked “${t.title}” as ${t.status.replace("_", " ")}`);
    c.store.commit();
    return t;
  }
  throw notFound("That task");
});

/* preferences */
const PREF_KEYS = ["taskGranularity", "informationDensity", "planLayout", "clarificationHelp", "communicationStyle", "timeEstimates", "pacingSupport"] as const;
const PREF_VALUES: Record<(typeof PREF_KEYS)[number], string[]> = {
  taskGranularity: ["small_steps", "balanced", "larger_blocks"],
  informationDensity: ["concise", "balanced", "detailed"],
  planLayout: ["one_step", "full_list", "timeline"],
  clarificationHelp: ["show_questions", "draft_message", "independent"],
  communicationStyle: ["preserve_my_voice", "make_expectations_explicit", "offer_tone_options"],
  timeEstimates: ["show", "hide"],
  pacingSupport: ["off", "optional_break_cues"],
};

function applyPrefs(c: Ctx, patch: PreferencesPatch): PreferencesOut {
  const prefs = c.store.db.prefs as unknown as Record<string, unknown>;
  const defaults = DEFAULT_PREFS as unknown as Record<string, unknown>;
  for (const k of PREF_KEYS) {
    if (!(k in patch)) continue;
    const v = (patch as Record<string, unknown>)[k];
    if (v === null) prefs[k] = defaults[k];
    else if (typeof v === "string" && PREF_VALUES[k].includes(v)) prefs[k] = v;
    else throw bad(`“${String(v)}” is not a valid choice for ${k}.`);
  }
  const p = c.store.db.prefs;
  p.isSet = true;
  if (!p.consentRecordedAt) {
    p.consentRecordedAt = c.now.toISOString();
    p.consentVersion = "2026-10";
  }
  c.store.commit();
  return p;
}
route("GET", "/api/preferences", (c) => c.store.db.prefs);
route("PATCH", "/api/preferences", (c) => applyPrefs(c, c.body as PreferencesPatch));
route("DELETE", "/api/preferences", (c) => {
  c.store.db.prefs = { ...DEFAULT_PREFS };
  c.store.commit();
  return c.store.db.prefs;
});
route("GET", "/api/preferences/export", (c) => c.store.db.prefs);
route("POST", "/api/preferences/import", (c) => applyPrefs(c, c.body as PreferencesPatch));
route("POST", "/api/preferences/collab-guide", (c) => {
  const p = c.store.db.prefs;
  if (!p.isSet) return { text: "Set a few working-style preferences first, then Ritme can write this for you." };
  const lines = ["How I do my best work:"];
  if (p.taskGranularity === "small_steps") lines.push("- Short, concrete tasks help me start faster.");
  if (p.taskGranularity === "larger_blocks") lines.push("- I like bigger blocks of work with room to plan them myself.");
  if (p.informationDensity === "concise") lines.push("- A brief summary up front, with details available if I ask.");
  if (p.informationDensity === "detailed") lines.push("- Full context up front helps me prepare thorough answers.");
  if (p.clarificationHelp === "draft_message") lines.push("- If something is unclear, a short written question I can answer helps.");
  if (p.communicationStyle === "make_expectations_explicit") lines.push("- Clear expectations and dates in writing work well for me.");
  lines.push("This note is only what I chose to share. It is not shared automatically.");
  return { text: lines.join("\n") };
});

/* knowledge */
// The mock includes each document's text so the Guidelines page can show it. The contract type has no such field yet.
route("GET", "/api/knowledge/documents", (c) => c.store.db.knowledge);
route("POST", "/api/knowledge/documents", (c) => {
  const title = str(c.body.title)?.trim();
  const content = str(c.body.content)?.trim();
  if (!title || !content) throw bad("A title and some text are required.");
  const rec = addKnowledge(c.store.db, c.now, {
    title,
    content,
    sourceDate: (c.body.sourceDate as string | null | undefined) ?? null,
    isSeed: false,
    sourceType: (c.body.sourceType as "user_text") ?? "user_text",
  });
  logActivity(c.store.db, c.now, null, "document_added", `Added “${title}” to your Context Library`);
  c.store.commit();
  return rec;
});
route("DELETE", "/api/knowledge/documents/:id", (c, [id]) => {
  const db = c.store.db;
  const i = db.knowledge.findIndex((k) => k.id === id);
  if (i < 0) throw notFound("That document");
  const [gone] = db.knowledge.splice(i, 1);
  for (const k of db.knowledge) k.conflictsWith = k.conflictsWith.filter((x) => x !== id);
  c.store.commit();
  return { deleted: true, removed: { documents: 1, chunks: gone?.chunkCount ?? 0 } };
});
route("POST", "/api/knowledge/search", (c) => {
  const q = (str(c.body.query) ?? "").toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const ids = c.body.documentIds as string[] | null | undefined;
  const results: Citation[] = [];
  for (const k of c.store.db.knowledge) {
    if (ids && !ids.includes(k.id)) continue;
    chunkText(k.content).forEach((chunk, i) => {
      if (q.length && q.some((w) => chunk.toLowerCase().includes(w))) {
        results.push({ sourceKind: "knowledge", sourceId: k.id, chunkId: `${k.id}_chunk_${i + 1}`, title: k.title, excerpt: chunk, location: null, sourceDate: k.sourceDate });
      }
    });
  }
  return { results };
});

/* extension */
route("POST", "/api/extension/connect", (c) => {
  const extensionId = str(c.body.extensionId);
  if (!extensionId) throw bad("The extension id is required.");
  const device: ConnectedDevice = {
    id: nextId(c.store.db, "dev"),
    label: (c.body.label as string | null | undefined) ?? null,
    createdAt: c.now.toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  c.store.db.devices.unshift(device);
  c.store.commit();
  return {
    accessToken: `ext_access_${device.id}`,
    refreshToken: `ext_refresh_${device.id}`,
    deviceId: device.id,
    expiresAt: new Date(c.now.getTime() + 15 * 60_000).toISOString(),
    scopes: ["captures:write"],
  };
});
route("POST", "/api/extension/refresh", (c) => {
  const token = str(c.body.refreshToken) ?? "";
  const dev = c.store.db.devices.find((d) => `ext_refresh_${d.id}` === token && !d.revokedAt);
  if (!dev) throw new HttpError(401, "unauthenticated", "That connection is no longer valid.");
  return {
    accessToken: `ext_access_${dev.id}`,
    refreshToken: token,
    deviceId: dev.id,
    expiresAt: new Date(c.now.getTime() + 15 * 60_000).toISOString(),
    scopes: ["captures:write"],
  };
});
route("GET", "/api/extension/devices", (c) => c.store.db.devices);
route("DELETE", "/api/extension/devices/:id", (c, [id]) => {
  const dev = c.store.db.devices.find((d) => d.id === id);
  if (!dev) throw notFound("That device");
  dev.revokedAt = dev.revokedAt ?? c.now.toISOString();
  c.store.commit();
  return dev;
});

/* privacy */
route("GET", "/api/privacy", (c) => {
  const db = c.store.db;
  return {
    capturesCount: db.captures.length,
    workflowsCount: db.workflows.length,
    tasksCount: db.workflows.reduce((n, w) => n + w.tasks.length, 0),
    knowledgeDocumentsCount: db.knowledge.length,
    employerAccess: "none",
    modelProvider: db.modelProvider ?? "Local test model (fake LLM)",
    modelProcessingNote:
      "Text is sent to the model only for the step being run (reading a capture, drafting a plan, drafting a message). Processing happens in the region configured for this deployment. Ritme does not use your text to train models.",
    logRetentionNote: "Logs keep technical details such as request IDs and timings. They never contain your captured text, prompts or tokens.",
  };
});
route("GET", "/api/privacy/export", (c) => {
  const db = c.store.db;
  return {
    exportedAt: c.now.toISOString(),
    me: db.me,
    preferences: db.prefs,
    captures: db.captures,
    workflows: db.workflows.map((w) => ({ ...w.summary, requirements: w.requirements, questions: w.questions, plans: w.plans, actions: w.actions, tasks: w.tasks })),
    knowledgeDocuments: db.knowledge,
    devices: db.devices,
    activity: db.activity,
  };
});
route("DELETE", "/api/privacy/account", (c) => {
  const db = c.store.db;
  const removed = {
    captures: db.captures.length,
    workflows: db.workflows.length,
    tasks: db.workflows.reduce((n, w) => n + w.tasks.length, 0),
    knowledgeDocuments: db.knowledge.length,
    devices: db.devices.length,
  };
  c.store.wipe();
  return { deleted: true, removed };
});

/* demo */
route("POST", "/api/demo/reset", (c) => {
  const rec = seedDemo(c.store.db, c.now);
  c.store.commit();
  return { ...rec.summary };
});

/* ------------------------------------------------------------------------------------------ entry */

export function handleRequest(store: MockStore, req: MockRequest, opts: HandlerOptions): MockResponse {
  const requestId = `req_${Math.random().toString(36).slice(2, 10)}`;
  const fail = (e: HttpError): MockResponse => ({
    status: e.status,
    body: { error: { code: e.code, message: e.message, retryable: e.retryable, requestId } },
  });
  try {
    if (req.path !== "/api/healthz" && !req.authorized) throw new HttpError(401, "unauthenticated", "Please sign in again.");
    for (const [method, pattern, handler] of routes) {
      if (method !== req.method) continue;
      const m = pattern.exec(req.path);
      if (!m) continue;
      const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
      const ctx: Ctx = { store, req, opts, now: opts.now(), body };
      const out = handler(ctx, m.slice(1).map(decodeURIComponent));
      return { status: 200, body: out };
    }
    throw notFound("That endpoint");
  } catch (e) {
    if (e instanceof HttpError) return fail(e);
    return fail(new HttpError(500, "internal", "Something went wrong in the mock API.", true));
  }
}
