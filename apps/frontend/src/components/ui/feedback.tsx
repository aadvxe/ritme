import { Button, Modal, Skeleton } from "@ritme/design";
import type { UseQueryResult } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { describeError } from "@/lib/api";
import { s } from "@/i18n";
import { IconAlert, IconWifiOff } from "./icons";

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Ritme`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

/** Error or offline panel with a retry. Offline is its own explicit state, not a generic error. */
export function ErrorPanel({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const online = useOnline();
  const offline = !online || (error as { isNetwork?: boolean } | null)?.isNetwork === true;
  return (
    <div
      role="alert"
      className={`flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface ${compact ? "p-4" : "p-6"} shadow-card`}
      data-testid={offline ? "state-offline" : "state-error"}
    >
      <div className="flex items-center gap-2 text-navy">
        <span className={offline ? "text-info-fg" : "text-error-fg"}>{offline ? <IconWifiOff className="h-5 w-5" /> : <IconAlert className="h-5 w-5" />}</span>
        <h2 className="text-base font-semibold">{offline ? s.common.offlineTitle : s.common.errorTitle}</h2>
      </div>
      <p className="text-sm text-text-secondary">{offline ? s.common.offlineBody : describeError(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {s.common.retry}
        </Button>
      )}
    </div>
  );
}

/** Explicit loading / error / offline handling around any query. Empty states are handled by the caller. */
export function QueryBoundary<T>({
  query,
  skeleton,
  children,
}: {
  query: UseQueryResult<T>;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return (
      <div role="status" aria-label={s.common.loading} data-testid="state-loading">
        {skeleton ?? <DefaultSkeleton />}
      </div>
    );
  }
  if (query.isError) return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />;
  return <>{children(query.data)}</>;
}

export function DefaultSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading,
  danger,
  children,
  confirmDisabled,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  danger?: boolean;
  children?: ReactNode;
  confirmDisabled?: boolean;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {s.common.cancel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
