import type { ReactNode } from "react";
import { cn } from "@ritme/design";

export type NoticeTone = "info" | "success" | "warning" | "error";

const TONE: Record<NoticeTone, string> = {
  info: "bg-info/10 text-info-fg",
  success: "bg-fact/15 text-fact-fg",
  warning: "bg-assumption/30 text-assumption-fg",
  error: "bg-error/10 text-error-fg",
};

/**
 * A status message: icon + bold word(s) + detail, so state never relies on colour alone.
 * Errors are announced assertively; everything else politely.
 */
export function StatusNotice({
  tone,
  icon,
  title,
  children,
  className,
}: {
  tone: NoticeTone;
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl p-3 text-sm", TONE[tone], className)}
    >
      <span aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0">
        {icon}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="text-text">{children}</div>}
      </div>
    </div>
  );
}
