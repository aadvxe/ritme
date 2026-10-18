import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOW, executeDemoPlan, makeEnv, renderApp } from "@/test/utils";

const ids = (root: HTMLElement | Document = document) =>
  [...root.querySelectorAll("[data-testid=cal-item]")].map((e) => (e as HTMLElement).dataset.itemId).sort();

describe("Dashboard: Schedule & Commitments", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW); // Monday 19 Oct 2026
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is the last section, with the Calendar Overview card and its read-only subtitle", async () => {
    renderApp("/", makeEnv());
    const schedule = await screen.findByRole("region", { name: "Schedule & Commitments" });
    expect(within(schedule).getByRole("heading", { level: 3, name: "Calendar Overview" })).toBeInTheDocument();
    expect(within(schedule).getByText("Read-only timeline of confirmed commitments across all workflows. Zero automatic scheduling.")).toBeInTheDocument();
    const regions = [...document.querySelectorAll("main section[aria-labelledby]")];
    expect(regions[regions.length - 1]).toBe(schedule);
  });

  it("defaults to Week: seven day cards from SUN to SAT, today highlighted, '—' when empty", async () => {
    renderApp("/", makeEnv());
    const schedule = await screen.findByRole("region", { name: "Schedule & Commitments" });
    expect(within(schedule).getByRole("tab", { name: "Week" })).toHaveAttribute("aria-selected", "true");
    const days = await within(schedule).findAllByTestId("week-day");
    expect(days).toHaveLength(7);
    expect(within(days[0]!).getByRole("heading").textContent).toMatch(/^SUN 18/);
    expect(within(days[6]!).getByRole("heading").textContent).toMatch(/^SAT 24/);
    const today = days.find((d) => d.getAttribute("aria-current") === "date")!;
    expect(within(today).getByRole("heading").textContent).toMatch(/^MON 19/);
    expect(within(today).getByText("Today")).toBeInTheDocument();
    expect(days[3]!.textContent).toContain("—");
  });

  it("Agenda shows 'Chronological agenda' and the empty text when nothing is scheduled", async () => {
    renderApp("/", makeEnv());
    const schedule = await screen.findByRole("region", { name: "Schedule & Commitments" });
    await userEvent.click(within(schedule).getByRole("tab", { name: "Agenda" }));
    expect(await within(schedule).findByRole("heading", { name: "Chronological agenda" })).toBeInTheDocument();
    expect(within(schedule).getByText("No dated commitments scheduled for this period.")).toBeInTheDocument();
    // The empty state still tells people how dated items appear.
    expect(within(schedule).getByTestId("calendar-empty")).toHaveTextContent("Dated tasks appear here after you approve a plan");
  });

  it("Week and Agenda show the same items, plus 'No date yet' and Timeline as a third option", async () => {
    const env = makeEnv();
    await executeDemoPlan(env);
    renderApp("/", env);
    const schedule = await screen.findByRole("region", { name: "Schedule & Commitments" });
    await waitFor(() => expect(ids(schedule).length).toBeGreaterThan(0));
    const week = ids(schedule);
    expect(week).toContain(env.mock.store.db.workflows[0]!.tasks[0]!.id);
    await userEvent.click(within(schedule).getByRole("tab", { name: "Agenda" }));
    await within(schedule).findByRole("heading", { name: "Chronological agenda" });
    expect(ids(schedule)).toEqual(week);
    expect(within(schedule).getByTestId("group-undated")).toHaveTextContent("No date yet");
    expect(within(schedule).getByRole("tab", { name: "Timeline" })).toBeInTheDocument();
    expect(schedule.textContent).not.toMatch(/overdue|\blate\b|missed/i);
  });
});

describe("Settings: Privacy & data tab", () => {
  it("has no Privacy & Data sidebar item, and /privacy lands on the tab", async () => {
    renderApp("/privacy", makeEnv());
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Privacy & data", selected: true })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "No employer access" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).queryByRole("link", { name: /Privacy/ })).toBeNull();
    expect(within(nav).getByRole("link", { name: "Guidelines" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: /Library/ })).toBeNull();
  });

  it("sits next to the other three settings tabs", async () => {
    renderApp("/settings", makeEnv());
    for (const name of ["Working style", "Display", "Connected devices", "Privacy & data"]) {
      expect(await screen.findByRole("tab", { name })).toBeInTheDocument();
    }
  });

  it("keeps the model-processing note, provider, counts and export", async () => {
    renderApp("/settings/privacy", makeEnv());
    expect(await screen.findByText(/Provider: Local test model/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("count-Captures")).toHaveTextContent("1"));
    expect(screen.getByRole("button", { name: "Export all as JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete all my data" })).toBeInTheDocument();
  });
});

describe("Header model badge", () => {
  it("is derived from GET /api/privacy, not hardcoded", async () => {
    const env = makeEnv();
    env.mock.store.db.modelProvider = "Vertex AI (gemini-test)";
    renderApp("/", env);
    expect(await screen.findByTestId("model-badge")).toHaveTextContent("Model: Vertex AI (gemini-test)");
    expect(env.calls.some((c) => c.path === "/api/privacy")).toBe(true);
  });

  it("says it is a local test model when the server reports one, and claims no verification engine", async () => {
    renderApp("/", makeEnv());
    expect(await screen.findByTestId("model-badge")).toHaveTextContent("Model: Local test model (fake LLM)");
    expect(document.body.textContent).not.toMatch(/Verification Engine Active/i);
    expect(screen.getAllByRole("banner")[0]!.textContent).not.toMatch(/Vertex|Gemini|Verification/);
  });
});
