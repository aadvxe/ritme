import { addDays, format, formatDistanceToNowStrict, startOfDay, startOfWeek } from "date-fns";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parse an API timestamp (UTC ISO) or a plain date. Plain dates are treated as local days. */
export function parseApiDate(value: string): Date {
  if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split("-").map(Number) as [number, number, number];
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

/** yyyy-MM-dd of the *local* day the instant falls on (stored as UTC, shown in local time). */
export function localDayKey(value: string | Date): string {
  const d = typeof value === "string" ? parseApiDate(value) : value;
  return format(d, "yyyy-MM-dd");
}

export const startOfLocalDay = (d: Date) => startOfDay(d);
export const weekStartOf = (d: Date) => startOfWeek(d, { weekStartsOn: 0 });
export { addDays };

export function formatDayLong(d: Date): string {
  return format(d, "EEEE d MMMM");
}
/** "SUN 18" style label for a day card. */
export function formatDayCard(d: Date): string {
  return format(d, "EEE d").toUpperCase();
}
export function formatDayShort(d: Date): string {
  return format(d, "EEE d MMM");
}
export function formatTime(value: string): string {
  return DATE_ONLY.test(value) ? "" : format(new Date(value), "p");
}
export function formatDateTime(value: string): string {
  const d = parseApiDate(value);
  return DATE_ONLY.test(value) ? format(d, "EEE d MMM yyyy") : format(d, "EEE d MMM yyyy, p");
}
export function formatDateOnly(value: string): string {
  return format(parseApiDate(value), "d MMM yyyy");
}
export function formatUpdated(value: string): string {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}
export function formatRange(start: Date): string {
  const end = addDays(start, 6);
  return `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
}
