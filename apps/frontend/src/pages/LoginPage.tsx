import { Alert, Button, Field, Input, Wordmark } from "@ritme/design";
import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { s } from "@/i18n";
import { useDocumentTitle } from "@/components/ui/feedback";
import { IconAlert, IconCheckCircle, IconLock, IconQuestion } from "@/components/ui/icons";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.2 1-3.8 1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.7 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.2H2.1a11 11 0 0 0 0 9.6L5.7 14Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7.2L5.7 10c.9-2.6 3.4-4.6 6.3-4.6Z" />
    </svg>
  );
}

/** A static, decorative preview of the Truth Board for the showcase side. Hidden from assistive tech. */
function ShowcaseCards() {
  return (
    <div aria-hidden="true" className="relative h-[420px] w-[460px] shrink-0 origin-center scale-[0.7] sm:scale-90 lg:scale-100">
      <div className="absolute left-1/2 top-1/2 z-10 w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/60 bg-white/90 p-6 shadow-lg backdrop-blur">
        <p className="text-sm font-semibold text-navy">Get the proposal over the line</p>
        <p className="mt-0.5 text-xs text-text-secondary">What Ritme found</p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 rounded-xl bg-fact/15 px-3 py-2 text-xs font-medium text-fact-fg">
            <IconCheckCircle /> Known: the deliverable is the proposal
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-assumption/30 px-3 py-2 text-xs font-medium text-assumption-fg">
            <IconQuestion /> Assumption: peer review applies
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-blocker/15 px-3 py-2 text-xs font-medium text-blocker-fg">
            <IconAlert /> Missing: which Friday?
          </div>
        </div>
      </div>
      <div className="absolute left-3 top-2 z-20 w-[210px] rounded-2xl border border-border bg-white p-4 shadow-xl animate-float">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Next best step</p>
        <p className="mt-1 text-sm font-semibold text-navy">List who needs to agree</p>
        <p className="mt-1 text-xs text-text-secondary">About 10 min (estimate)</p>
      </div>
      <div className="absolute bottom-6 right-2 z-20 w-[220px] rounded-2xl border border-border bg-white p-4 shadow-xl">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Waiting for you</p>
        <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-navy">
          <span className="text-fact-fg"><IconCheckCircle /></span> Verified: 6 tasks
        </p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { status, signIn, signInLocal, localSignInAvailable, error, configured } = useAuth();
  const loc = useLocation();
  const [busy, setBusy] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  useDocumentTitle("Sign in");

  if (status === "signedIn") {
    const from = (loc.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/login" ? from : "/"} replace />;
  }

  const onSignIn = async () => {
    setBusy(true);
    await signIn();
    setBusy(false);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-surface lg:h-dvh lg:flex-row lg:overflow-hidden">
      {/* Showcase side: pastel gradient blobs (static under reduced motion) */}
      <div className="flex h-72 w-full shrink-0 p-2 sm:h-96 sm:p-4 lg:h-full lg:w-1/2">
        <div className="relative isolate flex h-full w-full items-center justify-center overflow-hidden rounded-showcase bg-[#fafbfe]">
          <div aria-hidden="true" className="rt-blob pointer-events-none absolute -inset-20 animate-blob-a" style={{ background: "radial-gradient(circle at 20% 80%, rgba(121,131,255,0.35) 0%, transparent 60%)" }} />
          <div aria-hidden="true" className="rt-blob pointer-events-none absolute -inset-20 animate-blob-b" style={{ background: "radial-gradient(circle at 80% 20%, rgba(247,37,133,0.18) 0%, transparent 55%)" }} />
          <div aria-hidden="true" className="rt-blob pointer-events-none absolute -inset-20 animate-blob-a" style={{ background: "radial-gradient(circle at 40% 40%, rgba(76,201,240,0.25) 0%, transparent 50%)" }} />
          <div className="relative hidden sm:block">
            <ShowcaseCards />
          </div>
          <div className="relative z-10 max-w-xs px-6 text-center sm:hidden">
            <p className="text-lg font-semibold text-navy">{s.login.showcaseTitle}</p>
          </div>
        </div>
      </div>

      {/* Form side */}
      <main id="main" className="flex w-full flex-1 flex-col justify-center overflow-y-auto px-6 py-10 sm:px-12 lg:w-1/2 lg:px-24">
        <div className="mx-auto w-full max-w-md space-y-6">
          <Wordmark className="text-3xl" />
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-navy">{s.login.title}</h1>
            <p className="text-base text-text-secondary">{s.login.subtitle}</p>
          </div>

          <ul className="space-y-2 text-sm text-text-secondary">
            {s.login.showcaseBullets.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <span className="mt-0.5 text-fact-fg"><IconCheckCircle /></span>
                {b}
              </li>
            ))}
          </ul>

          {!configured && (
            <Alert tone="assumption" title={s.login.notConfigured}>
              {s.login.notConfiguredBody}
            </Alert>
          )}
          {error && (
            <Alert tone="error" title={s.login.signInFailed}>
              {error}
            </Alert>
          )}

          <Button size="lg" className="w-full" onClick={() => void onSignIn()} disabled={!configured || status === "loading"} loading={busy}>
            {!busy && !env.useMock && <GoogleMark />}
            {busy ? s.login.signingIn : env.useMock ? s.login.demo : s.login.google}
          </Button>

          {localSignInAvailable && (
            <section aria-labelledby="local-signin" className="space-y-3 rounded-2xl border border-dashed border-border bg-background p-4" data-testid="local-signin">
              <h2 id="local-signin" className="text-sm font-semibold text-navy">
                {s.login.local.title}
              </h2>
              <p className="text-xs text-text-secondary">{s.login.local.note}</p>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  setLocalBusy(true);
                  void signInLocal(email.trim(), password).finally(() => setLocalBusy(false));
                }}
              >
                <Field label={s.login.local.email} htmlFor="local-email">
                  <Input id="local-email" type="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label={s.login.local.password} htmlFor="local-password">
                  <Input id="local-password" type="password" autoComplete="off" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <Button type="submit" variant="outline" className="w-full" loading={localBusy} disabled={status === "loading"}>
                  {localBusy ? s.login.local.signingIn : s.login.local.submit}
                </Button>
              </form>
            </section>
          )}

          {env.useMock && <p className="text-sm text-text-secondary">{s.login.demoNote}</p>}
          {!env.useMock && env.useAuthEmulator && <p className="text-sm text-text-secondary">{s.login.emulatorNote}</p>}

          <p className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="text-primary-strong"><IconLock /></span>
            {s.login.privacyLine}
          </p>
        </div>
      </main>
    </div>
  );
}
