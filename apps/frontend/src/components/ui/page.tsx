import type { ReactNode } from "react";
import { cn } from "@ritme/design";
import { useDocumentTitle } from "./feedback";

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  useDocumentTitle(title);
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-navy">{title}</h1>
        {meta}
        {description && <p className="max-w-2xl text-sm text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled card section. `as` is the heading level so the page keeps a logical outline. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  id,
  headingLevel = 2,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  headingLevel?: 2 | 3;
}) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const hid = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={hid} className={cn("rt-pad rounded-2xl border border-border bg-surface shadow-card", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <H id={hid} className={cn("font-semibold text-navy", headingLevel === 2 ? "text-lg" : "text-base")}>
            {title}
          </H>
          {description && <p className="mt-0.5 text-sm text-text-secondary">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rt-stack", className)}>{children}</div>;
}
