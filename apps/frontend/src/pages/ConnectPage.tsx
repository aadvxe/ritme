import { Alert, Badge, Button, Card, Field, Input, Wordmark } from "@ritme/design";
import type { ExtensionTokenResponse } from "@ritme/api-client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDocumentTitle } from "@/components/ui/feedback";
import { IconAlert, IconCheckCircle, IconLock, IconXCircle } from "@/components/ui/icons";
import { describeError, useApi } from "@/lib/api";
import { env } from "@/lib/env";
import { canMessageExtension, sendConnectToExtension } from "@/lib/extension";
import { formatDateTime } from "@/lib/dates";
import { s } from "@/i18n";

const X = s.connect;
const SCOPE_TEXT: Record<string, string> = { "captures:write": X.grants[0] };

type Outcome = { kind: "idle" } | { kind: "connected"; token: ExtensionTokenResponse } | { kind: "denied" } | { kind: "failed"; reason: "no-chrome" | "unreachable" };

/**
 * F4: the extension connect page. The extension opens /connect?ext=<EXTENSION_ID>.
 * It shows exactly what is granted, and only on Allow calls POST /api/extension/connect and hands the
 * result to the extension with chrome.runtime.sendMessage(EXTENSION_ID, { type: "ritme.connect", payload }).
 */
export function ConnectPage() {
  useDocumentTitle("Connect extension");
  const api = useApi();
  const [params] = useSearchParams();
  const extensionId = (params.get("ext") ?? env.extensionId).trim();
  const [label, setLabel] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });

  const allow = useMutation({
    mutationFn: async () => {
      const token = await api.extension.connect({ extensionId, label: label.trim() || null });
      try {
        if (canMessageExtension()) await sendConnectToExtension(extensionId, token);
        else if (!env.useMock) throw new Error("no-chrome");
        // Demo mode has no extension to talk to: the hand-off is simulated, and the page says so below.
      } catch (e) {
        // Never leave a connection the extension never received.
        await api.extension.revoke(token.deviceId).catch(() => undefined);
        throw Object.assign(new Error("handoff"), { reason: (e as Error).message === "no-chrome" ? "no-chrome" : "unreachable" });
      }
      return token;
    },
    onSuccess: (token) => setOutcome({ kind: "connected", token }),
    onError: (e) => {
      const reason = (e as { reason?: "no-chrome" | "unreachable" }).reason;
      if (reason) setOutcome({ kind: "failed", reason });
    },
  });

  const simulated = env.useMock && !canMessageExtension();

  return (
    <div className="flex min-h-dvh items-start justify-center bg-background px-4 py-10 sm:items-center">
      <main id="main" className="w-full max-w-xl space-y-6">
        <Wordmark className="text-2xl" />
        <Card className="space-y-5 p-6 sm:p-8">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-navy">{X.title}</h1>
            <p className="text-sm text-text-secondary">{X.intro}</p>
          </div>

          {!extensionId ? (
            <Alert tone="assumption" title={X.missingExt}>
              {X.missingExtBody}
            </Alert>
          ) : outcome.kind === "connected" ? (
            <div className="space-y-4" data-testid="connect-success">
              <Alert tone="info" title={X.success}>
                {X.successBody}
              </Alert>
              {simulated && <p className="text-sm text-text-secondary">{X.demoSimulated}</p>}
              <section aria-labelledby="granted-h">
                <h2 id="granted-h" className="text-sm font-semibold text-navy">
                  {X.grantsTitle}
                </h2>
                <ul className="mt-2 space-y-1.5 text-sm text-text">
                  {outcome.token.scopes.map((sc) => (
                    <li key={sc} className="flex items-start gap-2">
                      <span className="mt-0.5 text-fact-fg"><IconCheckCircle /></span>
                      {SCOPE_TEXT[sc] ?? sc}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-text-secondary">{X.accessRenews(formatDateTime(outcome.token.expiresAt))}</p>
              </section>
              <Button asChild variant="outline">
                <Link to="/settings/devices">{X.manageDevices}</Link>
              </Button>
            </div>
          ) : outcome.kind === "denied" ? (
            <Alert tone="info" title={X.denied} />
          ) : (
            <>
              <section aria-labelledby="grants-h" className="space-y-2">
                <h2 id="grants-h" className="flex items-center gap-2 text-sm font-semibold text-navy">
                  <span className="text-primary-strong"><IconLock /></span> {X.grantsTitle}
                </h2>
                <ul className="space-y-1.5 text-sm text-text" data-testid="grants-list">
                  {X.grants.map((g) => (
                    <li key={g} className="flex items-start gap-2">
                      <span className="mt-0.5 text-fact-fg"><IconCheckCircle /></span>
                      {g}
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-labelledby="not-h" className="space-y-2">
                <h2 id="not-h" className="text-sm font-semibold text-navy">
                  {X.notGrantedTitle}
                </h2>
                <ul className="space-y-1.5 text-sm text-text-secondary">
                  {X.notGranted.map((g) => (
                    <li key={g} className="flex items-start gap-2">
                      <span className="mt-0.5"><IconXCircle /></span>
                      {g}
                    </li>
                  ))}
                </ul>
              </section>

              <p className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                {X.extensionLabel}: <Badge tone="neutral">{extensionId}</Badge>
              </p>
              <Field label={X.deviceLabel} htmlFor="device-label">
                <Input id="device-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={X.devicePlaceholder} maxLength={60} />
              </Field>

              {outcome.kind === "failed" && (
                <Alert tone="error" title={outcome.reason === "no-chrome" ? X.noChrome : X.sendFailed}>
                  {outcome.reason === "no-chrome" ? X.noChromeBody : X.sendFailedBody}
                </Alert>
              )}
              {allow.isError && outcome.kind !== "failed" && (
                <Alert tone="error" title={s.common.unknownError}>
                  <span className="inline-flex items-center gap-1"><IconAlert />{describeError(allow.error)}</span>
                </Alert>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
                <Button variant="outline" onClick={() => setOutcome({ kind: "denied" })} disabled={allow.isPending}>
                  {X.deny}
                </Button>
                <Button onClick={() => allow.mutate()} loading={allow.isPending}>
                  {allow.isPending ? X.working : X.allow}
                </Button>
              </div>
            </>
          )}
        </Card>
        <p className="text-center text-sm">
          <Link to="/" className="font-medium text-primary-strong hover:underline">
            {s.common.goToDashboard}
          </Link>
        </p>
      </main>
    </div>
  );
}
