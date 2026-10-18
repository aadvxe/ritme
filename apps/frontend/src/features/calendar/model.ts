import type { CalendarItem, CalendarOverview } from "@ritme/api-client";
import { addDays, localDayKey, startOfLocalDay } from "@/lib/dates";

/** Statuses that mean the work no longer needs attention. */
export const CLOSED_STATUSES = new Set(["done", "skipped", "completed", "cancelled"]);
export const isOpenItem = (i: Pick<CalendarItem, "status">) => !CLOSED_STATUSES.has(i.status);

export interface CalendarDay {
  key: string;
  date: Date;
  items: CalendarItem[];
}

export interface CalendarModel {
  /** The seven local days of the selected week. */
  days: CalendarDay[];
  /** Open items whose date has passed. Neutral wording, never "overdue". */
  earlier: CalendarItem[];
  /** Items with no confirmed date. Never placed on a day. */
  undated: CalendarItem[];
  /** Dated items that live in other weeks (not an error: just not in this view). */
  outsideCount: number;
  /** Every item id that appears somewhere in the model; all views must show exactly this set. */
  visibleIds: string[];
}

const byDate = (a: CalendarItem, b: CalendarItem) =>
  (a.dueAt ?? "").localeCompare(b.dueAt ?? "") || a.title.localeCompare(b.title);

/**
 * One model feeds Week, Agenda and Timeline, so they show exactly the same items.
 *
 * Rules (spec §14.2):
 * - Only items with a confirmed date are placed on a day; the rest go to "No date yet".
 * - Dates are stored as UTC and placed on the user's *local* day.
 * - Open items dated before today's local start sit under "Earlier, still open".
 * - Each item appears once.
 */
export function buildCalendarModel(overview: CalendarOverview, weekStart: Date, now: Date): CalendarModel {
  const todayStart = startOfLocalDay(now).getTime();
  const days: CalendarDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    return { key: localDayKey(date), date, items: [] };
  });
  const dayByKey = new Map(days.map((d) => [d.key, d]));

  const seen = new Set<string>();
  const undatedSeen = new Set<string>();
  const undated: CalendarItem[] = [];
  const earlier: CalendarItem[] = [];
  let outsideCount = 0;

  for (const raw of overview.undated) {
    if (undatedSeen.has(raw.id)) continue;
    undatedSeen.add(raw.id);
    undated.push(raw);
  }

  for (const item of overview.items) {
    if (seen.has(item.id) || undatedSeen.has(item.id)) continue;
    seen.add(item.id);
    if (!item.dueAt) {
      undatedSeen.add(item.id);
      undated.push(item);
      continue;
    }
    const key = localDayKey(item.dueAt);
    const dayStart = startOfLocalDay(new Date(`${key}T00:00:00`)).getTime();
    if (isOpenItem(item) && dayStart < todayStart) {
      earlier.push(item);
      continue;
    }
    const day = dayByKey.get(key);
    if (day) day.items.push(item);
    else outsideCount += 1;
  }

  for (const d of days) d.items.sort(byDate);
  earlier.sort(byDate);
  undated.sort((a, b) => a.workflowTitle.localeCompare(b.workflowTitle) || a.title.localeCompare(b.title));

  const visibleIds = [...days.flatMap((d) => d.items), ...earlier, ...undated].map((i) => i.id);
  return { days, earlier, undated, outsideCount, visibleIds };
}

/** The window the page asks the API for: about four weeks back (for "Earlier") and four weeks ahead. Under 62 days. */
export function overviewRange(weekStart: Date): { from: string; to: string } {
  return {
    from: addDays(weekStart, -27).toISOString(),
    to: addDays(weekStart, 33).toISOString(),
  };
}
