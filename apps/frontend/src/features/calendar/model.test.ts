import type { CalendarItem, CalendarOverview } from "@ritme/api-client";
import { describe, expect, it } from "vitest";
import { buildCalendarModel, overviewRange } from "./model";

// Tests run with TZ=Asia/Jakarta (UTC+7), so the local day can differ from the UTC day.
const weekStart = new Date(2026, 9, 19); // Monday 19 Oct 2026, local
const now = new Date(2026, 9, 21, 10, 0); // Wednesday 21 Oct, 10:00 local

const item = (id: string, dueAt: string | null, status = "todo", extra: Partial<CalendarItem> = {}): CalendarItem => ({
  id,
  type: "task",
  title: `Task ${id}`,
  workflowId: "w1",
  workflowTitle: "Proposal",
  dueAt,
  status,
  dependsOn: [],
  ...extra,
});

const model = (items: CalendarItem[], undated: CalendarItem[] = []) => buildCalendarModel({ items, undated } as CalendarOverview, weekStart, now);
const dayOf = (m: ReturnType<typeof model>, id: string) => m.days.find((d) => d.items.some((i) => i.id === id))?.key;

describe("calendar model", () => {
  it("runs in a non-UTC zone so local-day tests mean something", () => {
    expect(new Date("2026-10-22T20:00:00Z").getDate()).toBe(23);
  });

  it("places an item on its local day, not its UTC day", () => {
    // 20:00 UTC on Thursday 22 is 03:00 on Friday 23 in Jakarta.
    const m = model([item("a", "2026-10-22T20:00:00Z")]);
    expect(dayOf(m, "a")).toBe("2026-10-23");
  });

  it("keeps an item at 23:30 local on the same local day", () => {
    const m = model([item("b", new Date(2026, 9, 23, 23, 30).toISOString())]);
    expect(dayOf(m, "b")).toBe("2026-10-23");
  });

  it("never places an item without a date on a day", () => {
    const m = model([item("x", null)], [item("y", null)]);
    expect(m.days.every((d) => d.items.length === 0)).toBe(true);
    expect(m.undated.map((i) => i.id).sort()).toEqual(["x", "y"]);
  });

  it("does not guess a date for items listed as undated, even if a stray dueAt is present", () => {
    const m = model([], [item("z", "2026-10-22T08:00:00Z")]);
    expect(m.days.every((d) => d.items.length === 0)).toBe(true);
    expect(m.undated.map((i) => i.id)).toEqual(["z"]);
  });

  it("puts open items from before today under 'Earlier, still open'", () => {
    const m = model([item("old", new Date(2026, 9, 19, 12, 0).toISOString())]);
    expect(m.earlier.map((i) => i.id)).toEqual(["old"]);
    expect(dayOf(m, "old")).toBeUndefined();
  });

  it("keeps finished items on their own day instead of calling them earlier", () => {
    const m = model([item("done1", new Date(2026, 9, 19, 12, 0).toISOString(), "done"), item("skip1", new Date(2026, 9, 20, 12, 0).toISOString(), "skipped")]);
    expect(m.earlier).toHaveLength(0);
    expect(dayOf(m, "done1")).toBe("2026-10-19");
    expect(dayOf(m, "skip1")).toBe("2026-10-20");
  });

  it("treats today's items as today, not earlier", () => {
    const m = model([item("t", new Date(2026, 9, 21, 8, 0).toISOString())]);
    expect(m.earlier).toHaveLength(0);
    expect(dayOf(m, "t")).toBe("2026-10-21");
  });

  it("shows each item once and counts items in other weeks", () => {
    const next = new Date(2026, 9, 27, 12, 0).toISOString();
    const m = model([item("a", new Date(2026, 9, 22, 12, 0).toISOString()), item("a", new Date(2026, 9, 22, 12, 0).toISOString()), item("far", next)]);
    expect(m.visibleIds).toEqual(["a"]);
    expect(m.outsideCount).toBe(1);
  });

  it("sorts a day's items by time", () => {
    const m = model([item("late", new Date(2026, 9, 23, 17, 0).toISOString()), item("early", new Date(2026, 9, 23, 9, 0).toISOString())]);
    expect(m.days.find((d) => d.key === "2026-10-23")!.items.map((i) => i.id)).toEqual(["early", "late"]);
  });

  it("asks the API for at most 62 days", () => {
    const { from, to } = overviewRange(weekStart);
    expect((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000).toBeLessThanOrEqual(62);
  });
});
