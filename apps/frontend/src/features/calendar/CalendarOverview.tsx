import { Button, Skeleton, SegmentedContent, SegmentedList, SegmentedTabs, SegmentedTrigger } from "@ritme/design";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { QueryBoundary } from "@/components/ui/feedback";
import { IconCalendar } from "@/components/ui/icons";
import { buildCalendarModel, overviewRange } from "@/features/calendar/model";
import { AgendaView, TimelineView, WeekView, todayKeyOf } from "@/features/calendar/views";
import { addDays, formatRange, weekStartOf } from "@/lib/dates";
import { sessionStore } from "@/lib/safe-storage";
import { useCalendar } from "@/lib/queries";
import { s } from "@/i18n";

type View = "week" | "agenda" | "timeline";
const VIEW_KEY = "ritme.calendar.view";
const isView = (v: string | null): v is View => v === "week" || v === "agenda" || v === "timeline";

/** F17: read-only calendar overview. Week (default), Agenda and Timeline all show the same item set. */
export function CalendarOverview() {
  const [view, setView] = useState<View>(() => {
    const v = sessionStore.get(VIEW_KEY);
    return isView(v) ? v : "week";
  });
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  const range = useMemo(() => overviewRange(weekStart), [weekStart]);
  const overview = useCalendar(range.from, range.to);
  const now = new Date();
  const todayKey = todayKeyOf(now);

  const pick = (v: string) => {
    if (!isView(v)) return;
    setView(v);
    sessionStore.set(VIEW_KEY, v);
  };

  return (
    <div className="rt-stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addDays(w, -7))}>
            {s.calendar.prev}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(weekStartOf(new Date()))}>
            {s.calendar.thisWeek}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addDays(w, 7))}>
            {s.calendar.next}
          </Button>
          <p className="ml-2 text-sm font-medium text-navy" aria-live="polite">
            {s.calendar.rangeLabel(formatRange(weekStart))}
          </p>
        </div>
      </div>

      <SegmentedTabs value={view} onValueChange={pick}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedList aria-label={s.calendar.views}>
            <SegmentedTrigger value="week">{s.calendar.week}</SegmentedTrigger>
            <SegmentedTrigger value="agenda">{s.calendar.agenda}</SegmentedTrigger>
            <SegmentedTrigger value="timeline">{s.calendar.timeline}</SegmentedTrigger>
          </SegmentedList>
          <p className="text-xs text-text-secondary">{s.calendar.sameItems}</p>
        </div>

        <div className="mt-4">
          {(['week', 'agenda', 'timeline'] as const).map((v) => (
            <SegmentedContent key={v} value={v} className="outline-none">
              <QueryBoundary query={overview} skeleton={<Skeleton className="h-80 w-full rounded-2xl" />}>
                {(data) => {
                  const model = buildCalendarModel(data, weekStart, now);
                  const empty = data.items.length === 0 && data.undated.length === 0;
                  const view =
                    v === "week" ? (
                      <WeekView model={model} todayKey={todayKey} />
                    ) : v === "agenda" ? (
                      <AgendaView model={model} todayKey={todayKey} />
                    ) : (
                      <TimelineView model={model} todayKey={todayKey} onOpenAgenda={() => pick("agenda")} />
                    );
                  return (
                    <div className="rt-stack">
                      {empty && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-surface p-4" data-testid="calendar-empty">
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 text-primary-strong">
                              <IconCalendar className="h-5 w-5" />
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-navy">{s.calendar.emptyTitle}</p>
                              <p className="text-sm text-text-secondary">{s.calendar.emptyBody}</p>
                            </div>
                          </div>
                          <Button asChild variant="outline" size="sm">
                            <Link to="/#add-text">{s.calendar.emptyCta}</Link>
                          </Button>
                        </div>
                      )}
                      {view}
                    </div>
                  );
                }}
              </QueryBoundary>
            </SegmentedContent>
          ))}
        </div>
      </SegmentedTabs>
    </div>
  );
}
