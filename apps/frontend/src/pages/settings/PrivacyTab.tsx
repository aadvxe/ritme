import { Alert, Badge, Button, Field, Input, Skeleton, toast } from "@ritme/design";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog, QueryBoundary } from "@/components/ui/feedback";
import { IconDownload, IconLock, IconShield, IconTrash } from "@/components/ui/icons";
import { Section } from "@/components/ui/page";
import { WorkflowStatusBadge } from "@/components/ui/status";
import { describeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatUpdated } from "@/lib/dates";
import { downloadJson } from "@/lib/files";
import { useCaptures, useKnowledge, usePrivacy, useRefreshWorkflowData, useWorkflows } from "@/lib/queries";
import { s } from "@/i18n";

const V = s.privacy;

function Counts({ counts }: { counts: { label: string; n: number }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {counts.map((c) => (
        <div key={c.label} className="rounded-xl bg-background p-3">
          <dt className="text-xs font-medium text-text-secondary">{c.label}</dt>
          <dd className="text-2xl font-bold text-navy" data-testid={`count-${c.label}`}>
            {c.n}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type Target = { kind: "capture" | "doc" | "workflow"; id: string; label: string } | null;

/** F33 (a Settings tab): everything stored (delete per item), what the model sees, no employer access, export, erase. */
export function PrivacyTab() {
  const api = useApi();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const refresh = useRefreshWorkflowData();
  const overview = usePrivacy();
  const captures = useCaptures(100);
  const docs = useKnowledge();
  const workflows = useWorkflows();
  const [target, setTarget] = useState<Target>(null);
  const [erasing, setErasing] = useState(false);
  const [typed, setTyped] = useState("");
  const [erased, setErased] = useState<Record<string, number> | null>(null);

  const removeItem = useMutation({
    mutationFn: (t: NonNullable<Target>) => (t.kind === "capture" ? api.captures.remove(t.id) : t.kind === "doc" ? api.knowledge.remove(t.id) : api.workflows.remove(t.id)),
    onSuccess: async () => {
      await refresh();
      setTarget(null);
      toast.success(V.deleted);
    },
  });

  const exportAll = useMutation({
    mutationFn: () => api.privacy.exportAll(),
    onSuccess: (data) => {
      downloadJson("ritme-export.json", data);
      toast.success(V.exportDone);
    },
    onError: () => toast.error(V.exportFailed),
  });

  const eraseAll = useMutation({
    mutationFn: () => api.privacy.deleteAccountData(),
    onSuccess: async (r) => {
      setErasing(false);
      setTyped("");
      setErased(r.removed as Record<string, number>);
      qc.removeQueries();
      await qc.invalidateQueries();
      toast.success(V.deleteAccountDone);
    },
  });

  return (
    <div className="rt-stack">
      <p className="max-w-2xl text-sm text-text-secondary">{V.intro}</p>

      <section aria-labelledby="noemp" className="rt-pad flex items-start gap-3 rounded-2xl border border-fact-fg/30 bg-fact/15 shadow-card">
        <span className="mt-0.5 text-fact-fg"><IconLock className="h-5 w-5" /></span>
        <div>
          <h2 id="noemp" className="text-base font-semibold text-fact-fg">
            {V.noEmployer}
          </h2>
          <p className="text-sm text-text">{V.noEmployerBody}</p>
        </div>
      </section>

      <Section title={V.storedTitle} id="stored">
        <QueryBoundary query={overview} skeleton={<Skeleton className="h-20 w-full" />}>
          {(o) => (
            <Counts
              counts={[
                { label: V.counts.captures, n: o.capturesCount },
                { label: V.counts.workflows, n: o.workflowsCount },
                { label: V.counts.tasks, n: o.tasksCount },
                { label: V.counts.knowledge, n: o.knowledgeDocumentsCount },
              ]}
            />
          )}
        </QueryBoundary>
      </Section>

      <QueryBoundary query={overview} skeleton={<Skeleton className="h-28 w-full" />}>
        {(o) => (
          <div className="grid gap-6 md:grid-cols-2">
            <Section title={V.modelTitle} id="model">
              <p className="flex items-center gap-2 text-sm font-medium text-navy">
                <span className="text-primary-strong"><IconShield /></span> {V.modelProvider(o.modelProvider)}
              </p>
              <p className="mt-2 text-sm text-text-secondary">{V.modelBody}</p>
              <p className="mt-2 text-sm text-text-secondary">{o.modelProcessingNote}</p>
            </Section>
            <Section title={V.logsTitle} id="logs">
              <p className="text-sm text-text-secondary">{o.logRetentionNote}</p>
            </Section>
          </div>
        )}
      </QueryBoundary>

      <Section title={V.yourDataTitle} description={V.yourDataIntro} id="your-data">
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-navy">{V.capturesList}</h3>
            <QueryBoundary query={captures} skeleton={<Skeleton className="h-16 w-full" />}>
              {(list) =>
                list.length === 0 ? (
                  <p className="text-sm text-text-secondary">{V.noneStored}</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border" data-testid="privacy-captures">
                    {list.map((c) => {
                      const label = c.title ?? c.sourcePageTitle ?? s.library.noTitle;
                      return (
                        <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-navy">{label}</p>
                            <p className="line-clamp-1 text-xs text-text-secondary">{c.contentText}</p>
                            <p className="text-xs text-text-secondary">{formatUpdated(c.createdAt)}</p>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => setTarget({ kind: "capture", id: c.id, label })} aria-label={`${V.deleteItem}: ${label}`}>
                            <IconTrash /> {V.deleteItem}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )
              }
            </QueryBoundary>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-navy">{V.docsList}</h3>
            <QueryBoundary query={docs} skeleton={<Skeleton className="h-16 w-full" />}>
              {(list) =>
                list.length === 0 ? (
                  <p className="text-sm text-text-secondary">{V.noneStored}</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {list.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                        <p className="flex items-center gap-2 text-sm font-medium text-navy">
                          {d.title} {d.isSeed && <Badge tone="info">{s.library.seed}</Badge>}
                        </p>
                        <Button variant="outline" size="sm" onClick={() => setTarget({ kind: "doc", id: d.id, label: d.title })} aria-label={`${V.deleteItem}: ${d.title}`}>
                          <IconTrash /> {V.deleteItem}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )
              }
            </QueryBoundary>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-navy">{V.workflowsList}</h3>
            <QueryBoundary query={workflows} skeleton={<Skeleton className="h-16 w-full" />}>
              {(list) =>
                list.length === 0 ? (
                  <p className="text-sm text-text-secondary">{V.noneStored}</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {list.map((w) => (
                      <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-navy">{w.title}</p>
                          <WorkflowStatusBadge status={w.status} paused={w.paused} />
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setTarget({ kind: "workflow", id: w.id, label: w.title })} aria-label={`${V.deleteItem}: ${w.title}`}>
                          <IconTrash /> {V.deleteItem}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )
              }
            </QueryBoundary>
          </div>
        </div>
      </Section>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title={V.exportTitle} description={V.exportBody} id="export">
          <Button variant="outline" onClick={() => exportAll.mutate()} loading={exportAll.isPending}>
            <IconDownload /> {V.exportButton}
          </Button>
        </Section>
        <Section title={V.deleteAccountTitle} description={V.deleteAccountBody} id="erase">
          {erased ? (
            <div className="space-y-3" data-testid="erased">
              <Alert tone="info" title={V.deleteAccountDone}>
                {V.deleteAccountRemoved} {Object.entries(erased).map(([k, n]) => `${n} ${k}`).join(", ")}
              </Alert>
              <Button variant="outline" onClick={() => void signOut()}>
                {s.nav.signOut}
              </Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setErasing(true)}>
              {V.deleteAccountButton}
            </Button>
          )}
        </Section>
      </div>

      <p className="text-xs text-text-secondary">{V.note}</p>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`${V.deleteItem}: ${target?.label ?? ""}`}
        description={target?.kind === "doc" ? s.library.deleteDocBody : target?.kind === "workflow" ? s.canvas.deleteBody : s.library.deleteCaptureBody}
        confirmLabel={V.deleteItem}
        danger
        loading={removeItem.isPending}
        onConfirm={() => target && removeItem.mutate(target)}
      >
        {removeItem.isError && <Alert tone="error" title={s.common.unknownError}>{describeError(removeItem.error)}</Alert>}
      </ConfirmDialog>

      <ConfirmDialog
        open={erasing}
        onOpenChange={(o) => {
          setErasing(o);
          if (!o) setTyped("");
        }}
        title={V.deleteAccountConfirmTitle}
        description={V.deleteAccountConfirmBody}
        confirmLabel={V.deleteAccountConfirm}
        danger
        loading={eraseAll.isPending}
        confirmDisabled={typed !== "DELETE"}
        onConfirm={() => eraseAll.mutate()}
      >
        <Field label={V.deleteAccountType} htmlFor="erase-confirm">
          <Input id="erase-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </Field>
        {eraseAll.isError && <div className="mt-3"><Alert tone="error" title={s.common.unknownError}>{describeError(eraseAll.error)}</Alert></div>}
      </ConfirmDialog>
    </div>
  );
}
