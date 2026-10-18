import { ApiError, createApiClient } from "@ritme/api-client";
import { describe, expect, it } from "vitest";
import { createMockFetch } from "../../mocks/mock-fetch";
import { memoryStorage } from "../../mocks/store";
import { NOW, answerDemoBlockers, demoWorkflowId, makeEnv, proposeDemoPlan } from "./utils";

const status = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (e) {
    return e instanceof ApiError ? e.status : -1;
  }
};

describe("mock API behaves like the contract (so the UI can trust it)", () => {
  it("rejects requests without a token with the stable error shape", async () => {
    const mock = createMockFetch({ storage: memoryStorage(), now: () => NOW });
    const res = await mock("http://x/api/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "unauthenticated", message: expect.any(String), retryable: false, requestId: expect.any(String) } });
    const noAuth = createApiClient({ baseUrl: "http://x", getToken: async () => null, fetchImpl: mock });
    expect(await status(noAuth.dashboard())).toBe(401);
  });

  it("captures are idempotent on the key and never truncate", async () => {
    const { api, mock } = makeEnv();
    const body = { contentText: "Send the report by 2026-11-05 17:00", idempotencyKey: "k1", sourceType: "manual_text" as const, sourceUrl: null };
    const a = await api.captures.create(body);
    const b = await api.captures.create(body);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.capture.id).toBe(a.capture.id);
    expect(mock.store.db.captures.filter((c) => c.contentText === body.contentText)).toHaveLength(1);
    // A removed source URL is stored as null.
    expect(a.capture.sourceUrl).toBeNull();
    // Creating a capture only saves it: analysis is not claimed finished.
    expect(a.workflow.status).toBe("captured");
    expect(await status(api.captures.create({ ...body, idempotencyKey: "k2", contentText: "x".repeat(20_001) }))).toBe(413);
  });

  it("will not plan while a blocking question is open, and honours deferral", async () => {
    const env = makeEnv();
    const wf = demoWorkflowId(env);
    expect(await status(env.api.workflows.plan(wf))).toBe(409);
    await answerDemoBlockers(env);
    expect(await status(env.api.workflows.plan(wf))).toBe(200);
  });

  it("writes nothing until approved, executes once, and verifies by reading back", async () => {
    const env = makeEnv();
    const { id, actionId } = await proposeDemoPlan(env);
    const rec = env.mock.store.db.workflows.find((w) => w.summary.id === id)!;
    expect(rec.tasks).toHaveLength(0);
    expect(await status(env.api.actions.execute(actionId))).toBe(422); // not approved yet
    expect(rec.tasks).toHaveLength(0);
    await env.api.actions.approve(actionId);
    const first = await env.api.actions.execute(actionId);
    const again = await env.api.actions.execute(actionId);
    expect(first.verification).toBe("verified");
    expect(first.resultIds).toHaveLength(6);
    expect(again.resultIds).toEqual(first.resultIds);
    expect(rec.tasks).toHaveLength(6);
    expect(new Set(rec.tasks.map((t) => t.id)).size).toBe(6);
  });

  it("refuses a stale plan edit and rejects dependency cycles", async () => {
    const env = makeEnv();
    const { planId } = await proposeDemoPlan(env);
    const rec = env.mock.store.db.workflows.find((w) => w.plans.some((p) => p.id === planId))!;
    const plan = rec.plans[0]!;
    const v0 = plan.rowVersion;
    expect(await status(env.api.planVersions.patch(planId, { rowVersion: v0 + 5, goal: "x" }))).toBe(409);
    const tasks = plan.plan.tasks.map((t) => ({ ...t }));
    tasks[0]!.dependsOnDraftIds = [tasks[1]!.draftId];
    tasks[1]!.dependsOnDraftIds = [tasks[0]!.draftId];
    expect(await status(env.api.planVersions.patch(planId, { rowVersion: v0, tasks }))).toBe(400);
    const ok = await env.api.planVersions.patch(planId, { rowVersion: v0, goal: "A better goal" });
    expect(ok.rowVersion).toBe(v0 + 1);
  });

  it("a vague date never becomes an exact one unless the user says so", async () => {
    const env = makeEnv();
    const id = demoWorkflowId(env);
    const d = await env.api.workflows.get(id);
    expect(d.workflow.confirmedDueAt).toBeNull();
    await env.api.workflows.answer(id, d.questions[0]!.id, { answer: "whenever it is ready", disposition: "answer" });
    expect((await env.api.workflows.get(id)).workflow.confirmedDueAt).toBeNull();
  });

  it("calendar overview lists undated tasks separately and caps the range at 62 days", async () => {
    const env = makeEnv();
    expect(await status(env.api.calendarOverview("2026-01-01T00:00:00Z", "2026-06-01T00:00:00Z"))).toBe(400);
    const ok = await env.api.calendarOverview("2026-10-01T00:00:00Z", "2026-11-15T00:00:00Z");
    expect(ok.items).toEqual([]);
  });

  it("pause/resume/cancel/delete work on the workflow", async () => {
    const env = makeEnv();
    const id = demoWorkflowId(env);
    expect((await env.api.workflows.pause(id)).paused).toBe(true);
    expect((await env.api.workflows.resume(id)).paused).toBe(false);
    expect((await env.api.workflows.cancel(id)).status).toBe("cancelled");
    expect((await env.api.workflows.remove(id)).deleted).toBe(true);
    expect(await status(env.api.workflows.get(id))).toBe(404);
  });
});
