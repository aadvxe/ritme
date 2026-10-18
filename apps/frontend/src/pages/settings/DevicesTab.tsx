import { Alert, Badge, Button, EmptyState, Skeleton, toast } from "@ritme/design";
import type { ConnectedDevice } from "@ritme/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog, QueryBoundary } from "@/components/ui/feedback";
import { IconCheckCircle, IconXCircle } from "@/components/ui/icons";
import { Section } from "@/components/ui/page";
import { formatUpdated } from "@/lib/dates";
import { describeError, useApi } from "@/lib/api";
import { qk, useDevices } from "@/lib/queries";
import { s } from "@/i18n";

/** F4 (second half): connected extensions with revoke. */
export function DevicesTab() {
  const api = useApi();
  const qc = useQueryClient();
  const devices = useDevices();
  const [target, setTarget] = useState<ConnectedDevice | null>(null);

  const revoke = useMutation({
    mutationFn: (id: string) => api.extension.revoke(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.devices });
      toast.success(s.devices.revokeDone);
      setTarget(null);
    },
  });

  return (
    <Section title={s.devices.title} description={s.devices.intro} actions={<Button asChild variant="outline" size="sm"><Link to="/connect">{s.devices.connectLink}</Link></Button>}>
      <QueryBoundary query={devices} skeleton={<Skeleton className="h-20 w-full" />}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState title={s.devices.empty} description={s.devices.emptyBody} />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {list.map((d) => {
                const active = !d.revokedAt;
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium text-navy">{d.label ?? s.devices.unnamed}</p>
                      <p className="text-xs text-text-secondary">
                        {d.revokedAt ? s.devices.revoked(formatUpdated(d.revokedAt)) : s.devices.connected(formatUpdated(d.createdAt))}
                        {" · "}
                        {d.lastUsedAt ? s.devices.lastUsed(formatUpdated(d.lastUsedAt)) : s.devices.neverUsed}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={active ? "fact" : "neutral"} icon={active ? <IconCheckCircle /> : <IconXCircle />}>
                        {active ? s.devices.status.active : s.devices.status.revoked}
                      </Badge>
                      {active && (
                        <Button variant="outline" size="sm" onClick={() => setTarget(d)}>
                          {s.devices.revoke}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        }
      </QueryBoundary>
      {revoke.isError && <div className="mt-3"><Alert tone="error" title={s.common.unknownError}>{describeError(revoke.error)}</Alert></div>}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={s.devices.revokeTitle}
        description={s.devices.revokeBody}
        confirmLabel={s.devices.revoke}
        loading={revoke.isPending}
        onConfirm={() => target && revoke.mutate(target.id)}
      />
    </Section>
  );
}
