import { describe, expect, it } from "vitest";
import { defaultPlanView, estimateText, hasDependencyCycle, layersOf, nextStepOf, orderItems, planItemsFor, planWhyLines, type PlanItem } from "./plan";
import { bucketOf, buildTruthBoard } from "./truth";
import type { ClarificationQuestion, RequirementItem, WorkflowDetail } from "@ritme/api-client";

const item = (key: string, dependsOn: string[] = [], status: PlanItem["status"] = "todo"): PlanItem => ({
  key,
  taskId: key,
  title: `Step ${key}`,
  description: "",
  definitionOfDone: "done",
  estimatedMinutes: 10,
  dueAt: null,
  dependsOn,
  rationale: null,
  status,
});

describe("plan ordering and next step", () => {
  it("orders dependencies first, keeping the original order otherwise", () => {
    const out = orderItems([item("c", ["b"]), item("b", ["a"]), item("a")]);
    expect(out.map((i) => i.key)).toEqual(["a", "b", "c"]);
  });

  it("does not loop forever on a cycle", () => {
    const out = orderItems([item("a", ["b"]), item("b", ["a"])]);
    expect(out).toHaveLength(2);
  });

  it("picks the first open step whose dependencies are done", () => {
    const items = [item("a", [], "done"), item("b", ["a"]), item("c", ["b"])];
    expect(nextStepOf(items)?.key).toBe("b");
    expect(nextStepOf([item("a", [], "done"), item("b", ["a"], "skipped")])).toBeNull();
  });

  it("builds timeline stages from the longest dependency chain", () => {
    const layers = layersOf([item("a"), item("b", ["a"]), item("c", ["a"]), item("d", ["b", "c"])]);
    expect(layers.map((l) => l.map((i) => i.key))).toEqual([["a"], ["b", "c"], ["d"]]);
  });

  it("detects dependency cycles", () => {
    expect(hasDependencyCycle([{ key: "a", dependsOn: ["b"] }, { key: "b", dependsOn: ["a"] }])).toBe(true);
    expect(hasDependencyCycle([{ key: "a", dependsOn: [] }, { key: "b", dependsOn: ["a"] }])).toBe(false);
  });
});

describe("plan source", () => {
  const draft = { status: "draft", plan: { tasks: [{ draftId: "d1", title: "T", description: "", definitionOfDone: "x", estimatedMinutes: 5, dueAt: null, dependsOnDraftIds: [], rationale: null, requirementIds: [] }] } };
  it("shows the draft before tasks exist, and real tasks once they do", () => {
    const d1 = planItemsFor({ tasks: [], latestPlan: draft } as unknown as WorkflowDetail);
    expect(d1.source).toBe("draft");
    const d2 = planItemsFor({
      tasks: [{ id: "task_1", title: "Real", description: "", definitionOfDone: "x", estimatedMinutes: null, dueAt: null, dependsOn: [], status: "todo" }],
      latestPlan: draft,
    } as unknown as WorkflowDetail);
    expect(d2.source).toBe("tasks");
    expect(d2.items[0]?.taskId).toBe("task_1");
    expect(planItemsFor({ tasks: [], latestPlan: null } as unknown as WorkflowDetail).source).toBe("none");
  });
});

describe("plan view defaults and explanations", () => {
  const prefs = (over: object) => ({ isSet: true, planLayout: "one_step", taskGranularity: "small_steps", timeEstimates: "show", ...over }) as Parameters<typeof planWhyLines>[0];

  it("defaults from plan_layout when preferences are set, else the checklist", () => {
    expect(defaultPlanView({ isSet: true, planLayout: "one_step" })).toBe("one_step");
    expect(defaultPlanView({ isSet: true, planLayout: "timeline" })).toBe("timeline");
    expect(defaultPlanView({ isSet: false, planLayout: "one_step" })).toBe("full_list");
    expect(defaultPlanView(undefined)).toBe("full_list");
  });

  it("explains why the plan looks the way it does", () => {
    const lines = planWhyLines(prefs({}), "one_step", false);
    expect(lines.join(" ")).toMatch(/one step at a time because your default plan view/i);
    expect(lines.join(" ")).toMatch(/small steps/i);
  });

  it("says so when the view was switched for this visit", () => {
    expect(planWhyLines(prefs({}), "timeline", true).join(" ")).toMatch(/switched views for this visit/i);
  });

  it("explains hidden time estimates and never shows them when hidden", () => {
    expect(planWhyLines(prefs({ timeEstimates: "hide" }), "one_step", false).join(" ")).toMatch(/hidden because you chose to hide/i);
    expect(estimateText(15, false)).toBeNull();
    expect(estimateText(15, true)).toBe("about 15 min (estimate)");
    expect(estimateText(null, true)).toBeNull();
  });
});

describe("truth board buckets", () => {
  const req = (over: Partial<RequirementItem>): RequirementItem => ({
    id: "r",
    kind: "fact",
    text: "t",
    certainty: "explicit",
    importance: "useful",
    evidence: [],
    userConfirmedAt: null,
    ...over,
  });
  const q = (over: Partial<ClarificationQuestion>): ClarificationQuestion => ({
    id: "q",
    question: "?",
    whyItMatters: "",
    blocking: true,
    relatedRequirementIds: [],
    suggestedAnswers: null,
    answer: null,
    status: "open",
    ...over,
  });

  it("sorts explicit items into known, inferred into assumptions, unknown/conflicting into missing", () => {
    expect(bucketOf(req({ certainty: "explicit" }))).toBe("known");
    expect(bucketOf(req({ certainty: "inferred" }))).toBe("assumption");
    expect(bucketOf(req({ kind: "assumption", certainty: "explicit" }))).toBe("assumption");
    expect(bucketOf(req({ certainty: "unknown" }))).toBe("missing");
    expect(bucketOf(req({ certainty: "conflicting" }))).toBe("missing");
    expect(bucketOf(req({ kind: "contradiction" }))).toBe("missing");
  });

  it("an assumption only becomes a known fact when the user confirms it", () => {
    expect(bucketOf(req({ certainty: "inferred" }))).toBe("assumption");
    expect(bucketOf(req({ certainty: "inferred", userConfirmedAt: "2026-10-19T00:00:00Z" }))).toBe("known");
  });

  it("attaches questions to their blocker card and gives unattached questions their own card", () => {
    const board = buildTruthBoard([req({ id: "r1", certainty: "unknown" })], [q({ id: "q1", relatedRequirementIds: ["r1"] }), q({ id: "q2", relatedRequirementIds: ["gone"] })]);
    expect(board.missing).toHaveLength(2);
    expect(board.missing[0]?.questions.map((x) => x.id)).toEqual(["q1"]);
    expect(board.missing[1]?.requirement).toBeNull();
    expect(board.openBlocking).toBe(2);
  });
});
