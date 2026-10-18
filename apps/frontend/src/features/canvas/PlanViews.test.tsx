import type { PreferencesOut } from "@ritme/api-client";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChecklistView, OneStepView, PlanTimelineView } from "./PlanViews";
import type { PlanItem } from "./plan";

const items: PlanItem[] = [
  { key: "a", taskId: "t_a", title: "Outline the proposal", description: "Headings only.", definitionOfDone: "Every section has a heading", estimatedMinutes: 15, dueAt: null, dependsOn: [], rationale: "An outline makes writing smaller.", status: "done" },
  { key: "b", taskId: "t_b", title: "Write the draft", description: "Fill each section.", definitionOfDone: "Every section has text", estimatedMinutes: 45, dueAt: "2026-10-22T10:00:00Z", dependsOn: ["a"], rationale: null, status: "todo" },
  { key: "c", taskId: "t_c", title: "Send for review", description: "Ask a teammate.", definitionOfDone: "A reviewer has it", estimatedMinutes: 10, dueAt: null, dependsOn: ["b"], rationale: null, status: "todo" },
  { key: "d", taskId: "t_d", title: "Apply comments", description: "", definitionOfDone: "Comments applied", estimatedMinutes: null, dueAt: null, dependsOn: ["c"], rationale: null, status: "todo" },
];

const prefs = (over: Partial<PreferencesOut> = {}): PreferencesOut => ({
  isSet: true,
  taskGranularity: "small_steps",
  informationDensity: "balanced",
  planLayout: "one_step",
  clarificationHelp: "show_questions",
  communicationStyle: "preserve_my_voice",
  timeEstimates: "show",
  pacingSupport: "off",
  consentRecordedAt: null,
  consentVersion: null,
  ...over,
});

describe("Micro-Step view (one step)", () => {
  it("shows only the immediate next step and tucks the rest behind a calm count", async () => {
    render(<OneStepView items={items} prefs={prefs()} />);
    expect(screen.getAllByTestId("plan-item")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Write the draft" })).toBeInTheDocument();
    expect(screen.queryByText("Send for review")).toBeNull();
    expect(screen.getByTestId("steps-waiting")).toHaveTextContent("2 more steps waiting");
    await userEvent.click(screen.getByRole("button", { name: "Show them" }));
    expect(screen.getByText("Send for review")).toBeInTheDocument();
    expect(screen.getByText("Apply comments")).toBeInTheDocument();
  });

  it("says everything is finished when nothing is open", () => {
    render(<OneStepView items={items.map((i) => ({ ...i, status: "done" as const }))} prefs={prefs()} />);
    expect(screen.getByText(/done or skipped/i)).toBeInTheDocument();
  });

  it("marking the step done reports the task and status", async () => {
    const onStatus = vi.fn();
    render(<OneStepView items={items} prefs={prefs()} onStatus={onStatus} />);
    await userEvent.click(screen.getByRole("button", { name: /Mark done: Write the draft/ }));
    expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ taskId: "t_b" }), "done");
  });
});

describe("Checklist view", () => {
  it("lists every step in dependency order with status as text", () => {
    render(<ChecklistView items={items} prefs={prefs()} />);
    const rows = screen.getAllByTestId("plan-item");
    expect(rows.map((r) => within(r).getByRole("heading").textContent)).toEqual(["Outline the proposal", "Write the draft", "Send for review", "Apply comments"]);
    expect(within(rows[0]!).getByText("Done")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("To do")).toBeInTheDocument();
  });

  it("shows no date for undated steps instead of guessing one", () => {
    render(<ChecklistView items={items} prefs={prefs()} />);
    const row = screen.getAllByTestId("plan-item")[2]!;
    expect(within(row).getByText("No date yet")).toBeInTheDocument();
  });
});

describe("Timeline view", () => {
  it("groups steps into stages and says what each waits for", () => {
    render(<PlanTimelineView items={items} prefs={prefs()} />);
    expect(screen.getByText("Stage 1", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Stage 4")).toBeInTheDocument();
    expect(screen.getByText("Waits for: Write the draft")).toBeInTheDocument();
  });
});

describe("preferences shape every view the same way", () => {
  it.each([
    ["one step", OneStepView],
    ["checklist", ChecklistView],
    ["timeline", PlanTimelineView],
  ] as const)("%s hides time estimates when the preference says hide", (_n, View) => {
    const { rerender } = render(<View items={items} prefs={prefs({ timeEstimates: "show" })} />);
    expect(screen.getAllByText(/\(estimate\)/).length).toBeGreaterThan(0);
    rerender(<View items={items} prefs={prefs({ timeEstimates: "hide" })} />);
    expect(screen.queryByText(/\(estimate\)/)).toBeNull();
  });

  it("concise density keeps details behind a button; detailed shows the reason up front", async () => {
    const withReason = items.map((i) => (i.key === "a" ? { ...i, status: "todo" as const } : i));
    const { unmount } = render(<ChecklistView items={withReason} prefs={prefs({ informationDensity: "concise" })} />);
    const first = screen.getAllByTestId("plan-item")[0]!;
    expect(within(first).queryByText("Headings only.")).toBeNull();
    await userEvent.click(within(first).getByRole("button", { name: "Show details" }));
    expect(within(first).getByText("Headings only.")).toBeInTheDocument();
    unmount();

    render(<ChecklistView items={withReason} prefs={prefs({ informationDensity: "detailed" })} />);
    const again = screen.getAllByTestId("plan-item")[0]!;
    expect(within(again).getByText(/An outline makes writing smaller/)).toBeInTheDocument();
    expect(within(again).queryByRole("button", { name: "Show details" })).toBeNull();
  });
});
