import type { CalendarItem, CalendarOverview } from "@ritme/api-client";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { buildCalendarModel } from "./model";
import { AgendaView, TimelineView, WeekView } from "./views";

const weekStart = new Date(2026, 9, 19);
const now = new Date(2026, 9, 21, 10, 0);
const iso = (d: number, h = 12) => new Date(2026, 9, d, h, 0).toISOString();

const mk = (id: string, dueAt: string | null, status = "todo", extra: Partial<CalendarItem> = {}): CalendarItem => ({
  id,
  type: "task",
  title: `Title ${id}`,
  workflowId: extra.workflowId ?? "w1",
  workflowTitle: extra.workflowTitle ?? "Proposal",
  dueAt,
  status,
  dependsOn: [],
  ...extra,
});

const overview: CalendarOverview = {
  items: [
    mk("t1", iso(19), "todo"), // earlier, still open
    mk("t2", iso(19), "done"), // finished earlier: stays on its day
    mk("t3", iso(21, 9), "in_progress"),
    mk("t4", iso(22), "blocked", { dependsOn: ["t3"] }),
    mk("t5", iso(23, 17), "todo", { dependsOn: ["t4"] }),
    mk("d1", iso(23, 18), "in_progress", { type: "workflow_deadline", title: "Proposal" }),
    mk("o1", iso(22), "todo", { workflowId: "w2", workflowTitle: "Report" }),
  ],
  undated: [mk("u1", null, "todo", { workflowId: "w2", workflowTitle: "Report" })],
};
const model = buildCalendarModel(overview, weekStart, now);
const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const ids = (c: HTMLElement) => [...c.querySelectorAll("[data-testid=cal-item]")].map((e) => (e as HTMLElement).dataset.itemId).sort();

describe("calendar views", () => {
  const views = {
    week: () => <WeekView model={model} todayKey="2026-10-21" />,
    agenda: () => <AgendaView model={model} todayKey="2026-10-21" />,
    timeline: () => <TimelineView model={model} todayKey="2026-10-21" onOpenAgenda={() => undefined} />,
  };

  it("Week, Agenda and Timeline show exactly the same item set", () => {
    const sets = Object.values(views).map((v) => ids(wrap(v()).container));
    expect(sets[0]).toEqual([...model.visibleIds].sort());
    expect(sets[1]).toEqual(sets[0]);
    expect(sets[2]).toEqual(sets[0]);
    expect(sets[0]).toContain("u1"); // undated is in every view
    expect(sets[0]).toContain("t1"); // earlier is in every view
  });

  it.each(Object.entries(views))("%s: undated items sit under 'No date yet' and never on a day", (_name, v) => {
    const { container } = wrap(v());
    const group = within(screen.getByTestId("group-undated"));
    expect(group.getByText(/No date yet/)).toBeInTheDocument();
    expect(group.getByText("Title u1")).toBeInTheDocument();
    for (const day of container.querySelectorAll("[data-testid=week-day], [data-testid=agenda-day], [data-testid=timeline-lane]")) {
      expect(within(day as HTMLElement).queryByText("Title u1")).toBeNull();
    }
  });

  it.each(Object.entries(views))("%s: 'Earlier, still open' has Something changed and no overdue/late/missed wording", (_name, v) => {
    const { container } = wrap(v());
    const earlier = within(screen.getByTestId("group-earlier"));
    expect(earlier.getByText(/Earlier, still open/)).toBeInTheDocument();
    expect(earlier.getByText("Title t1")).toBeInTheDocument();
    expect(earlier.getByRole("link", { name: "Something changed" })).toHaveAttribute("href", "/workflows/w1?changed=1");
    expect(container.textContent).not.toMatch(/overdue|\blate\b|missed|behind schedule/i);
  });

  it("labels workflow deadlines 'Deadline' and shows status as text", () => {
    const { container } = wrap(<AgendaView model={model} todayKey="2026-10-21" />);
    const deadline = container.querySelector('[data-item-id="d1"]') as HTMLElement;
    expect(within(deadline).getByText("Deadline")).toBeInTheDocument();
    expect(within(deadline).getByText("In progress")).toBeInTheDocument();
    const blocked = container.querySelector('[data-item-id="t4"]') as HTMLElement;
    expect(within(blocked).getByText("Blocked")).toBeInTheDocument();
    expect(within(blocked).getByRole("link", { name: "Title t4" })).toHaveAttribute("href", "/workflows/w1");
  });

  it("Agenda lists days in order with local-day headings", () => {
    const { container } = wrap(<AgendaView model={model} todayKey="2026-10-21" />);
    const days = [...container.querySelectorAll("[data-testid=agenda-day]")].map((e) => (e as HTMLElement).dataset.day);
    expect(days).toEqual([...days].sort());
    expect(days).toContain("2026-10-21");
  });

  it("Timeline has one lane per workflow with the dependency written out in words", () => {
    wrap(<TimelineView model={model} todayKey="2026-10-21" onOpenAgenda={() => undefined} />);
    expect(screen.getAllByTestId("timeline-lane")).toHaveLength(2);
    expect(screen.getByText("After: Title t3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Agenda" })).toBeInTheDocument();
  });
});
