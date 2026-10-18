import { Button, cn } from "@ritme/design";
import type { PreferencesOut, TaskStatus } from "@ritme/api-client";
import { useState } from "react";
import { IconArrowRight, IconCalendar } from "@/components/ui/icons";
import { TaskStatusBadge } from "@/components/ui/status";
import { formatDateTime } from "@/lib/dates";
import { s } from "@/i18n";
import { estimateText, isClosed, layersOf, nextStepOf, type PlanItem } from "./plan";

const P = s.canvas.plan;

export interface PlanViewProps {
  items: PlanItem[];
  prefs: PreferencesOut | undefined;
  /** Present only when the items are real tasks. */
  onStatus?: (item: PlanItem, status: TaskStatus) => void;
  pendingTaskId?: string | null;
  disabled?: boolean;
}

function StatusActions({ item, onStatus, pending, disabled }: { item: PlanItem; onStatus?: PlanViewProps["onStatus"]; pending: boolean; disabled?: boolean }) {
  if (!onStatus || !item.taskId || !item.status) return null;
  const set = (st: TaskStatus) => () => onStatus(item, st);
  const common = { size: "sm" as const, disabled: disabled || pending };
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {item.status === "todo" && (
        <Button variant="soft" {...common} onClick={set("in_progress")}>
          {P.markDoing}
        </Button>
      )}
      {(item.status === "todo" || item.status === "in_progress" || item.status === "blocked") && (
        <Button variant="primary" {...common} onClick={set("done")} aria-label={`${P.markDone}: ${item.title}`}>
          {P.markDone}
        </Button>
      )}
      {(item.status === "todo" || item.status === "in_progress") && (
        <Button variant="ghost" {...common} onClick={set("skipped")} aria-label={`${P.markSkipped}: ${item.title}`}>
          {P.markSkipped}
        </Button>
      )}
      {(item.status === "done" || item.status === "skipped" || item.status === "blocked") && (
        <Button variant="ghost" {...common} onClick={set("todo")} aria-label={`${P.markTodo}: ${item.title}`}>
          {P.markTodo}
        </Button>
      )}
    </div>
  );
}

/** One step. How much shows up front follows the information_density preference. */
export function PlanItemCard({
  item,
  prefs,
  names,
  big,
  onStatus,
  pending,
  disabled,
}: {
  item: PlanItem;
  prefs: PreferencesOut | undefined;
  names: Map<string, string>;
  big?: boolean;
  onStatus?: PlanViewProps["onStatus"];
  pending: boolean;
  disabled?: boolean;
}) {
  const density = prefs?.isSet ? prefs.informationDensity : "balanced";
  const [open, setOpen] = useState(false);
  const showEstimates = prefs?.isSet ? prefs.timeEstimates === "show" : true;
  const est = estimateText(item.estimatedMinutes, showEstimates);
  const waits = item.dependsOn.map((k) => names.get(k)).filter(Boolean) as string[];
  const extra = [item.description && density === "concise" ? item.description : null, item.rationale && density !== "detailed" ? item.rationale : null].filter(Boolean);
  const showDescription = density !== "concise" && item.description;
  const showRationale = density === "detailed" && item.rationale;
  const detailsId = `details-${item.key}`;

  return (
    <article
      data-testid="plan-item"
      data-item-key={item.key}
      className={cn("rounded-2xl border border-border bg-surface shadow-card", big ? "p-6" : "p-4", isClosed(item) && "bg-background")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className={cn("font-semibold", big ? "text-xl text-navy" : "text-sm text-navy", isClosed(item) && "text-text-secondary")}>{item.title}</h4>
        {item.status && <TaskStatusBadge status={item.status} />}
      </div>
      <div className="mt-2 space-y-1 text-sm">
        <p>
          <span className="font-medium text-text-secondary">{P.doneWhen}: </span>
          <span className="text-text">{item.definitionOfDone}</span>
        </p>
        {showDescription && <p className="text-text-secondary">{item.description}</p>}
        {showRationale && (
          <p className="text-text-secondary">
            <span className="font-medium">{P.why}: </span>
            {item.rationale}
          </p>
        )}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1">
          <IconCalendar /> {item.dueAt ? P.dueOn(formatDateTime(item.dueAt)) : P.noDue}
        </span>
        {est && <span>{est}</span>}
      </p>
      {waits.length > 0 && <p className="mt-1 text-xs text-text-secondary">{P.waitsFor(waits.join(", "))}</p>}

      {extra.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            className="text-xs font-medium text-primary-strong underline-offset-2 hover:underline"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? P.hideDetails : P.showDetails}
          </button>
          {open && (
            <div id={detailsId} className="mt-1 space-y-1 text-sm text-text-secondary">
              {density === "concise" && item.description && <p>{item.description}</p>}
              {density !== "detailed" && item.rationale && (
                <p>
                  <span className="font-medium">{P.why}: </span>
                  {item.rationale}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <StatusActions item={item} onStatus={onStatus} pending={pending} disabled={disabled} />
    </article>
  );
}

const nameMap = (items: PlanItem[]) => new Map(items.map((i) => [i.key, i.title]));

/** Micro-Step ("Just One Thing"): only the next step; everything else waits behind a calm count. */
export function OneStepView({ items, prefs, onStatus, pendingTaskId, disabled }: PlanViewProps) {
  const [showWaiting, setShowWaiting] = useState(false);
  const next = nextStepOf(items);
  const names = nameMap(items);
  if (!next) return <p className="rounded-xl bg-fact/15 p-4 text-sm font-medium text-fact-fg">{P.allDone}</p>;
  const position = items.findIndex((i) => i.key === next.key) + 1;
  const waiting = items.filter((i) => !isClosed(i) && i.key !== next.key);
  return (
    <div className="space-y-4" data-testid="view-one-step">
      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary-strong">
          <IconArrowRight /> {P.justOne} · {P.step(position, items.length)}
        </p>
        <PlanItemCard item={next} prefs={prefs} names={names} big onStatus={onStatus} pending={pendingTaskId === next.taskId} disabled={disabled} />
      </div>
      {waiting.length > 0 && (
        <div>
          <p className="flex flex-wrap items-center gap-3 text-sm text-text-secondary" data-testid="steps-waiting">
            <span>{P.stepsWaiting(waiting.length)}</span>
            <Button variant="ghost" size="sm" aria-expanded={showWaiting} onClick={() => setShowWaiting((v) => !v)}>
              {showWaiting ? P.hideWaiting : P.showWaiting}
            </Button>
          </p>
          {showWaiting && (
            <ol className="mt-2 list-decimal space-y-1 pl-6 text-sm text-text-secondary">
              {waiting.map((w) => (
                <li key={w.key}>{w.title}</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/** Standard checklist: clean and scannable. */
export function ChecklistView({ items, prefs, onStatus, pendingTaskId, disabled }: PlanViewProps) {
  const names = nameMap(items);
  return (
    <ol className="space-y-3" data-testid="view-checklist">
      {items.map((i) => (
        <li key={i.key}>
          <PlanItemCard item={i} prefs={prefs} names={names} onStatus={onStatus} pending={pendingTaskId === i.taskId} disabled={disabled} />
        </li>
      ))}
    </ol>
  );
}

/** Timeline / dependencies: stages by what has to come first, with the dependency written out in words. */
export function PlanTimelineView({ items, prefs, onStatus, pendingTaskId, disabled }: PlanViewProps) {
  const names = nameMap(items);
  const layers = layersOf(items);
  return (
    <div role="region" tabIndex={0} aria-label={P.views.timeline} className="overflow-x-auto" data-testid="view-timeline">
      <ol className="flex min-w-max gap-4">
        {layers.map((layer, n) => (
          <li key={n} className="w-72 shrink-0 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {P.stage(n + 1)}
              {n === 0 && <span className="ml-1 font-normal normal-case"> · {P.startsFirst}</span>}
            </h4>
            <ul className="space-y-3">
              {layer.map((i) => (
                <li key={i.key}>
                  <PlanItemCard item={i} prefs={prefs} names={names} onStatus={onStatus} pending={pendingTaskId === i.taskId} disabled={disabled} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
