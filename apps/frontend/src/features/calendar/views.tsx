import { Badge, Button, cn } from "@ritme/design";
import type { CalendarItem } from "@ritme/api-client";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ItemStatusBadge } from "@/components/ui/status";
import { IconFlag } from "@/components/ui/icons";
import { formatDayCard, formatDayLong, formatDayShort, formatTime, localDayKey } from "@/lib/dates";
import { s } from "@/i18n";
import { isOpenItem, type CalendarDay, type CalendarModel } from "./model";

const c = s.calendar;

/** One calendar item. The same row renders in every view, so item content is identical everywhere. */
export function CalendarItemRow({ item, showDay, extra }: { item: CalendarItem; showDay?: boolean; extra?: ReactNode }) {
  const isDeadline = item.type === "workflow_deadline";
  const open = isOpenItem(item);
  const time = item.dueAt ? formatTime(item.dueAt) : "";
  return (
    <li
      data-testid="cal-item"
      data-item-id={item.id}
      className={cn("rounded-xl border border-border bg-surface p-3", !open && "bg-background")}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isDeadline && (
          <Badge tone="info" icon={<IconFlag />}>
            {c.deadline}
          </Badge>
        )}
        <ItemStatusBadge status={item.status} />
      </div>
      <p className={cn("mt-1.5 text-sm font-medium", open ? "text-navy" : "text-text-secondary")}>
        <Link to={`/workflows/${item.workflowId}`} className="hover:underline">
          {item.title}
        </Link>
      </p>
      <p className="mt-0.5 text-xs text-text-secondary">
        {!isDeadline && <>{c.inWorkflow(item.workflowTitle)}</>}
        {showDay && item.dueAt && <>{!isDeadline ? " · " : ""}{formatDayShort(new Date(item.dueAt))}</>}
        {time && <> {showDay || !isDeadline ? "· " : ""}{c.at(time)}</>}
      </p>
      {extra && <div className="mt-2">{extra}</div>}
    </li>
  );
}

export function UndatedGroup({ items }: { items: CalendarItem[] }) {
  return (
    <section aria-labelledby="cal-undated" data-testid="group-undated" className="rt-pad rounded-2xl border border-border bg-surface shadow-card">
      <h3 id="cal-undated" className="text-base font-semibold text-navy">
        {c.noDate} <span className="font-normal text-text-secondary">({items.length})</span>
      </h3>
      <p className="mt-0.5 text-sm text-text-secondary">{c.noDateHint}</p>
      {items.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((i) => (
            <CalendarItemRow key={i.id} item={i} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function EarlierGroup({ items }: { items: CalendarItem[] }) {
  return (
    <section aria-labelledby="cal-earlier" data-testid="group-earlier" className="rt-pad rounded-2xl border border-border bg-surface shadow-card">
      <h3 id="cal-earlier" className="text-base font-semibold text-navy">
        {c.earlier} <span className="font-normal text-text-secondary">({items.length})</span>
      </h3>
      <p className="mt-0.5 text-sm text-text-secondary">{c.earlierHint}</p>
      {items.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((i) => (
            <CalendarItemRow
              key={i.id}
              item={i}
              showDay
              extra={
                <Button asChild variant="soft" size="sm">
                  <Link to={`/workflows/${i.workflowId}?changed=1`}>{c.somethingChanged}</Link>
                </Button>
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SharedGroups({ model }: { model: CalendarModel }) {
  return (
    <div className="rt-stack">
      {model.earlier.length > 0 && <EarlierGroup items={model.earlier} />}
      <UndatedGroup items={model.undated} />
      {model.outsideCount > 0 && <p className="text-sm text-text-secondary">{c.outside(model.outsideCount)}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ Week */

export function WeekView({ model, todayKey }: { model: CalendarModel; todayKey: string }) {
  return (
    <div className="rt-stack">
      <ol aria-label={c.daysOfWeek} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {model.days.map((d) => (
          <li
            key={d.key}
            data-testid="week-day"
            data-day={d.key}
            aria-current={d.key === todayKey ? "date" : undefined}
            className={cn("min-w-0 rounded-2xl border bg-surface p-3 shadow-card", d.key === todayKey ? "border-primary-strong ring-2 ring-primary-strong/30" : "border-border")}
          >
            <h3 className="text-sm font-semibold tracking-wide text-navy">
              {formatDayCard(d.date)}
              {d.key === todayKey && <span className="ml-1.5 rounded-full bg-primary-strong px-2 py-0.5 text-[11px] font-semibold text-white">{c.today}</span>}
            </h3>
            {d.items.length === 0 ? (
              <p className="mt-2 text-sm text-text-secondary">
                <span aria-hidden="true">—</span>
                <span className="sr-only">{c.nothingOnDay}</span>
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {d.items.map((i) => (
                  <CalendarItemRow key={i.id} item={i} />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      <SharedGroups model={model} />
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- Agenda */

export function AgendaView({ model, todayKey }: { model: CalendarModel; todayKey: string }) {
  const daysWithItems = model.days.filter((d) => d.items.length > 0);
  return (
    <div className="rt-stack">
      {model.earlier.length > 0 && <EarlierGroup items={model.earlier} />}
      <section aria-labelledby="agenda-week" className="rt-pad rounded-2xl border border-border bg-surface shadow-card">
        <h3 id="agenda-week" className="text-base font-semibold text-navy">
          {c.agendaHeading}
        </h3>
        {daysWithItems.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">{c.agendaEmpty}</p>
        ) : (
          <div className="mt-3 space-y-5">
            {daysWithItems.map((d: CalendarDay) => (
              <div key={d.key} data-testid="agenda-day" data-day={d.key}>
                <h4 className="text-sm font-semibold text-navy">
                  {formatDayLong(d.date)}
                  {d.key === todayKey && <span className="ml-1.5 text-xs font-medium text-primary-strong">({c.today})</span>}
                </h4>
                <ul className="mt-2 space-y-2">
                  {d.items.map((i) => (
                    <CalendarItemRow key={i.id} item={i} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
      <UndatedGroup items={model.undated} />
      {model.outsideCount > 0 && <p className="text-sm text-text-secondary">{c.outside(model.outsideCount)}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------------------- Timeline */

const ROW_H = 104;

interface Lane {
  workflowId: string;
  title: string;
  cells: { item: CalendarItem; col: number; row: number }[];
  rows: number;
}

function buildLanes(model: CalendarModel): Lane[] {
  const lanes = new Map<string, Lane>();
  model.days.forEach((d, col) => {
    for (const item of d.items) {
      let lane = lanes.get(item.workflowId);
      if (!lane) {
        lane = { workflowId: item.workflowId, title: item.workflowTitle, cells: [], rows: 1 };
        lanes.set(item.workflowId, lane);
      }
      const row = lane.cells.filter((x) => x.col === col).length;
      lane.cells.push({ item, col, row });
      lane.rows = Math.max(lane.rows, row + 1);
    }
  });
  return [...lanes.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * A horizontal strip, one lane per workflow, with dependency links between tasks of the same workflow.
 * It is a visual summary only: no dragging, no rescheduling. The Agenda is the text equivalent.
 */
export function TimelineView({ model, todayKey, onOpenAgenda }: { model: CalendarModel; todayKey: string; onOpenAgenda: () => void }) {
  const lanes = buildLanes(model);
  const names = new Map(model.days.flatMap((d) => d.items).map((i) => [i.id, i.title]));
  return (
    <div className="rt-stack">
      <p className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
        {c.timelineNote}
        <Button variant="soft" size="sm" onClick={onOpenAgenda}>
          {c.switchToAgenda}
        </Button>
      </p>

      {lanes.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-text-secondary shadow-card">{c.nothingOnDay}</p>
      ) : (
        <div role="region" tabIndex={0} aria-label={c.timeline} className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
          <div className="min-w-[72rem] p-4">
            <div className="grid grid-cols-7 gap-2 pl-0" aria-hidden="true">
              {model.days.map((d) => (
                <p key={d.key} className={cn("text-xs font-semibold", d.key === todayKey ? "text-primary-strong" : "text-text-secondary")}>
                  {formatDayShort(d.date)}
                  {d.key === todayKey && ` (${c.today})`}
                </p>
              ))}
            </div>
            <div className="mt-2 space-y-5">
              {lanes.map((lane) => {
                const pos = new Map(lane.cells.map((cell) => [cell.item.id, cell]));
                const h = lane.rows * ROW_H;
                return (
                  <section key={lane.workflowId} aria-label={c.lane(lane.title)} data-testid="timeline-lane">
                    <h3 className="mb-1 text-sm font-semibold text-navy">{lane.title}</h3>
                    <div className="rt-timeline-lane rounded-xl bg-background p-1" style={{ height: h + 8 }}>
                      <div className="relative h-full">
                        <div className="grid h-full grid-cols-7 gap-2">
                          {model.days.map((d) => (
                            <div key={d.key} className="rounded-lg border border-dashed border-border/70" aria-hidden="true" />
                          ))}
                        </div>
                        <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute inset-0 h-full w-full">
                          <defs>
                            <marker id={`arrow-${lane.workflowId}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                              <path d="M0 0 8 4 0 8z" fill="rgb(71 85 105)" />
                            </marker>
                          </defs>
                          {lane.cells.flatMap(({ item, col, row }) =>
                            item.dependsOn
                              .map((depId) => pos.get(depId))
                              .filter((from): from is NonNullable<typeof from> => Boolean(from))
                              .map((from) => (
                                <line
                                  key={`${from.item.id}->${item.id}`}
                                  x1={`${((from.col + 0.5) / 7) * 100}%`}
                                  y1={from.row * ROW_H + ROW_H / 2}
                                  x2={`${((col + 0.5) / 7) * 100}%`}
                                  y2={row * ROW_H + ROW_H / 2}
                                  stroke="rgb(71 85 105)"
                                  strokeWidth="1.5"
                                  strokeDasharray="4 3"
                                  markerEnd={`url(#arrow-${lane.workflowId})`}
                                />
                              )),
                          )}
                        </svg>
                        {lane.cells.map(({ item, col, row }) => {
                          const deps = item.dependsOn.map((d) => names.get(d)).filter(Boolean) as string[];
                          return (
                            <div
                              key={item.id}
                              className="absolute px-1"
                              style={{ left: `${(col / 7) * 100}%`, width: `${100 / 7}%`, top: row * ROW_H + 2, height: ROW_H - 6 }}
                            >
                              <ul className="h-full">
                                <li
                                  data-testid="cal-item"
                                  data-item-id={item.id}
                                  className={cn("h-full overflow-hidden rounded-lg border border-border bg-surface p-2 text-xs shadow-card", !isOpenItem(item) && "bg-background")}
                                >
                                  <div className="flex flex-wrap items-center gap-1">
                                    {item.type === "workflow_deadline" && (
                                      <Badge tone="info" icon={<IconFlag />}>
                                        {c.deadline}
                                      </Badge>
                                    )}
                                    <ItemStatusBadge status={item.status} />
                                  </div>
                                  <Link to={`/workflows/${item.workflowId}`} className="mt-1 line-clamp-2 block font-medium text-navy hover:underline" title={item.title}>
                                    {item.title}
                                  </Link>
                                  {deps.length > 0 && <span className="line-clamp-1 block text-text-secondary">{c.dependsOn(deps.join(", "))}</span>}
                                </li>
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {model.earlier.length > 0 && <EarlierGroup items={model.earlier} />}
      <UndatedGroup items={model.undated} />
      {model.outsideCount > 0 && <p className="text-sm text-text-secondary">{c.outside(model.outsideCount)}</p>}
    </div>
  );
}

export function todayKeyOf(now: Date): string {
  return localDayKey(now);
}
