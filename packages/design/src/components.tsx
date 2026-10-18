import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Toaster as SonnerToaster } from "sonner";
import * as React from "react";
import { cn } from "./cn";

/* ------------------------------------------------------------------ Button */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors duration-200 ease-out-expo disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Text-bearing primary uses the strong indigo for AA contrast.
        primary: "bg-primary-strong text-white shadow-card hover:bg-primary-strong/90",
        outline: "border border-border bg-surface text-text shadow-card hover:bg-background",
        ghost: "text-text-secondary hover:bg-background",
        soft: "bg-primary/10 text-primary-strong hover:bg-primary/15",
        danger: "bg-error-fg text-white hover:bg-error-fg/90",
      },
      size: {
        sm: "h-8 rounded-lg px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? children : (
          <>
            {loading && <Spinner className="h-4 w-4" label="" />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

/* ------------------------------------------------------------------ Inputs */

const fieldBase =
  "w-full rounded-xl border border-border bg-surface px-3 text-sm text-text shadow-card placeholder:text-text-muted disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, "h-10", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, "min-h-[96px] py-2", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

/** Label + control + hint/error wired with ids so screen readers announce all three. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-navy">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-xs text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-error-fg">
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Card / Badge */

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-2xl border border-border bg-surface p-6 shadow-card", className)} {...props} />
  ),
);
Card.displayName = "Card";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
  {
    variants: {
      tone: {
        neutral: "bg-background text-text-secondary border border-border",
        fact: "bg-fact/15 text-fact-fg",
        assumption: "bg-assumption/30 text-assumption-fg",
        blocker: "bg-blocker/15 text-blocker-fg",
        info: "bg-info/10 text-info-fg",
        error: "bg-error/10 text-error-fg",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

/** Always give a Badge visible text; pass `icon` too so status never relies on colour alone. */
export function Badge({
  tone,
  icon,
  children,
  className,
}: VariantProps<typeof badgeVariants> & { icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)}>
      {icon && <span aria-hidden="true" className="inline-flex h-3.5 w-3.5 items-center">{icon}</span>}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Feedback */

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role={label ? "status" : undefined} aria-label={label || undefined} className="inline-flex">
      <span className={cn("h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary", className)} />
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-border/60", className)} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
      {icon && <div aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary-strong">{icon}</div>}
      <h3 className="text-lg font-semibold text-navy">{title}</h3>
      <p className="max-w-md text-sm text-text-secondary">{description}</p>
      {action}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "error" | "assumption";
  title: string;
  children?: React.ReactNode;
}) {
  const t = { info: "bg-info/10 text-info-fg", error: "bg-error/10 text-error-fg", assumption: "bg-assumption/30 text-assumption-fg" }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl p-4 text-sm", t)}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-text">{children}</div>}
    </div>
  );
}

/** Mount once near the root. Toasts announce via aria-live (sonner default). */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      closeButton
      toastOptions={{
        className: "!rounded-[20px] !border-border !bg-surface !p-4 !shadow-toast !font-sans",
      }}
    />
  );
}
export { toast } from "sonner";

/* ------------------------------------------------------------------ Dialog (Radix: focus trap, Esc, aria) */

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  const width = { md: "max-w-md", lg: "max-w-lg", xl: "max-w-2xl" }[size];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[9998] animate-fade-in bg-black/50 backdrop-blur-sm" />
        {/*
          Centering lives on a flex wrapper, NOT on the content via translate: the open animation sets
          `transform`, which would overwrite a translate(-50%,-50%) and push the dialog off-centre.
          The wrapper ignores pointer events so clicks on the dimmed area still reach Radix's outside-click close.
        */}
        <div className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center p-3">
          <DialogPrimitive.Content
            className={cn(
              "pointer-events-auto relative flex max-h-[90dvh] w-full animate-scale-in flex-col overflow-hidden rounded-2xl bg-surface shadow-popover",
              width,
            )}
          >
            <div className="shrink-0 border-b border-border p-6 pr-14">
              <DialogPrimitive.Title className="text-xl font-bold text-navy">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-text-secondary">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
              <DialogPrimitive.Close
                aria-label="Close"
                className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl text-text-secondary transition-colors hover:bg-background"
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              </DialogPrimitive.Close>
            </div>
            {/* Only the body scrolls; header and footer stay visible on short screens. */}
            {children && <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>}
            {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 bg-background p-6">{footer}</div>}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ Segmented tabs (GMera capsule) */

export const SegmentedTabs = TabsPrimitive.Root;

export const SegmentedList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn("inline-flex rounded-lg bg-background p-1", className)} {...props} />
));
SegmentedList.displayName = "SegmentedList";

export const SegmentedTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary transition-all duration-300 ease-out-expo data-[state=active]:bg-surface data-[state=active]:text-navy data-[state=active]:shadow-card",
      className,
    )}
    {...props}
  />
));
SegmentedTrigger.displayName = "SegmentedTrigger";

export const SegmentedContent = TabsPrimitive.Content;

/* ------------------------------------------------------------------ Brand */

/** Plain "Ritme" wordmark (placeholder until a logo exists). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-xl tracking-tight text-navy", className)}>
      <span className="font-bold">Rit</span>
      <span className="font-normal text-primary-strong">me</span>
    </span>
  );
}

export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
