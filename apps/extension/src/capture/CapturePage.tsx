import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Field, Input, Spinner, Textarea, Wordmark } from "@ritme/design";
import { openConnectPage } from "../lib/auth";
import { updateConversation, type CaptureDraft } from "../lib/capture";
import { includedCount } from "../lib/conversation";
import { ConversationSection } from "./ConversationSection";
import { MAX_CAPTURE_CHARS, MAX_PAGE_TITLE_CHARS } from "../config";
import { CATEGORY_LABEL, detectSensitive } from "../lib/sensitive";
import { getDraft, removeDraft, saveDraft } from "../lib/storage";
import { submitDraft } from "../lib/submit";
import { useConnected, useOnline } from "../ui/hooks";
import { CopyGlyph, ErrorIcon, InfoGlyph, NotConnectedIcon, RetryIcon, PrivacyIcon, SensitiveIcon, SuccessIcon } from "../ui/icons";
import { StatusNotice } from "../ui/StatusNotice";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; workflowUrl: string }
  | { kind: "not_connected" }
  | { kind: "offline" }
  | { kind: "error"; message: string; retryable: boolean }
  | { kind: "cancelled" };

async function closeThisTab(): Promise<void> {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id !== undefined) {
      await chrome.tabs.remove(tab.id);
      return;
    }
  } catch {
    /* fall back below */
  }
  window.close();
}

export function CapturePage({ draftId }: { draftId: string | null }) {
  const [draft, setDraft] = useState<CaptureDraft | null | "missing">(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const connected = useConnected();
  const online = useOnline();
  const closedRef = useRef(false); // set once saved or cancelled: the draft must not be written back
  const busyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    if (!draftId) {
      setDraft("missing");
      return;
    }
    void getDraft(draftId).then((d) => {
      if (alive) setDraft(d ?? "missing");
    });
    return () => {
      alive = false;
    };
  }, [draftId]);

  // Keep the local draft current while the user edits (session storage only; nothing is sent).
  useEffect(() => {
    if (draft && draft !== "missing" && !closedRef.current) void saveDraft(draft);
  }, [draft]);

  // Connecting in another tab should unblock saving without a reload.
  useEffect(() => {
    if (connected && status.kind === "not_connected") setStatus({ kind: "idle" });
  }, [connected, status.kind]);

  const update = useCallback((patch: Partial<CaptureDraft>) => {
    setDraft((d) => (d && d !== "missing" ? { ...d, ...patch } : d));
  }, []);

  if (draft === null) {
    return (
      <Shell>
        <div className="flex items-center gap-3 text-sm text-text-secondary">
          <Spinner label="Loading your draft" /> Loading your draft…
        </div>
      </Shell>
    );
  }

  if (draft === "missing") {
    return (
      <Shell>
        <StatusNotice tone="info" icon={<InfoGlyph />} title="This draft isn't here anymore">
          <p>Nothing was sent to Ritme. To save something, select text on a page, right-click, and choose “Save selection to Ritme”, or paste it from the Ritme toolbar button.</p>
        </StatusNotice>
      </Shell>
    );
  }

  if (status.kind === "success") {
    return (
      <Shell>
        <Card className="space-y-4">
          <StatusNotice tone="success" icon={<SuccessIcon />} title="Saved to Ritme">
            <p>Your text is saved. Open the workflow to see what Ritme found and decide what happens next.</p>
          </StatusNotice>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={status.workflowUrl} target="_blank" rel="noopener noreferrer">
                Open workflow
              </a>
            </Button>
            <Button variant="outline" onClick={() => void closeThisTab()}>
              Close
            </Button>
          </div>
        </Card>
      </Shell>
    );
  }

  if (status.kind === "cancelled") {
    return (
      <Shell>
        <Card className="space-y-4">
          <StatusNotice tone="info" icon={<InfoGlyph />} title="Cancelled">
            <p>Nothing was sent to Ritme and the draft was discarded. You can close this tab.</p>
          </StatusNotice>
          <Button variant="outline" onClick={() => void closeThisTab()}>
            Close tab
          </Button>
        </Card>
      </Shell>
    );
  }

  const current = draft;
  const sensitiveCategory = detectSensitive(current.domain);
  const overLimit = current.text.length > MAX_CAPTURE_CHARS;
  const conversation = current.conversation;
  const hasText =
    current.text.trim().length > 0 && (!conversation || conversation.textEdited || includedCount(conversation) > 0);
  const submitting = status.kind === "submitting";
  const needsConnect = connected === false || status.kind === "not_connected";
  const canSubmit = hasText && !overLimit && (sensitiveCategory === null || current.sensitiveConfirmed);
  const failed = status.kind === "offline" || status.kind === "error" || status.kind === "not_connected";
  const canRetry = status.kind === "offline" || (status.kind === "error" && status.retryable);

  async function onSave() {
    if (busyRef.current || !canSubmit) return;
    busyRef.current = true;
    setStatus({ kind: "submitting" });
    setCopied(false);
    try {
      const { result, draft: next } = await submitDraft(current);
      if (result.kind === "success") {
        closedRef.current = true;
        await removeDraft(current.draftId);
        setStatus({ kind: "success", workflowUrl: result.workflowUrl });
        return;
      }
      setDraft(next); // keeps the (possibly rotated) idempotency key for the next attempt
      setStatus(result.kind === "error" ? result : { kind: result.kind });
    } finally {
      busyRef.current = false;
    }
  }

  async function onCancel() {
    closedRef.current = true;
    await removeDraft(current.draftId);
    setStatus({ kind: "cancelled" });
    void closeThisTab();
  }

  async function onCopy() {
    const text = current.note.trim() ? `${current.text}\n\n${current.note.trim()}` : current.text;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Shell>
      <div className="space-y-5">
        <StatusNotice tone="info" icon={<PrivacyIcon />} title="Nothing is sent until you press Save">
          <p>
            When you press <strong>Save to Ritme</strong>, the text, note and page details shown below are sent to Ritme.
            Cancel sends nothing.
          </p>
        </StatusNotice>

        {!online && (
          <StatusNotice tone="warning" icon={<ErrorIcon />} title="You're offline">
            <p>Your draft is kept here. You can save once you're back online.</p>
          </StatusNotice>
        )}

        {sensitiveCategory && (
          <StatusNotice tone="warning" icon={<SensitiveIcon />} title={`This page looks ${CATEGORY_LABEL[sensitiveCategory]}-related`}>
            <p>Take a moment to check the text below for anything you don't want Ritme to store.</p>
            <label className="mt-2 flex items-start gap-2 font-medium">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary-strong"
                checked={current.sensitiveConfirmed}
                onChange={(e) => update({ sensitiveConfirmed: e.target.checked })}
              />
              <span>I've checked this text and want to save it to Ritme.</span>
            </label>
          </StatusNotice>
        )}

        {conversation && (
          <ConversationSection
            conversation={conversation}
            onChange={(patch) => setDraft((d) => (d && d !== "missing" ? updateConversation(d, patch) : d))}
          />
        )}

        <Field
          label="Text to save"
          htmlFor="capture-text"
          hint={conversation ? "This is exactly what will be saved. You can edit it." : "You can edit this. Only what's in this box is saved."}
          error={overLimit ? `This is ${current.text.length.toLocaleString()} characters; Ritme can save up to ${MAX_CAPTURE_CHARS.toLocaleString()}. Please shorten it. We won't cut it for you.` : undefined}
        >
          <Textarea
            id="capture-text"
            className="min-h-[160px]"
            value={current.text}
            onChange={(e) => {
              const text = e.target.value;
              setDraft((d) =>
                d && d !== "missing"
                  ? { ...d, text, conversation: d.conversation ? { ...d.conversation, textEdited: true } : null }
                  : d,
              );
            }}
            aria-describedby={overLimit ? "capture-text-error" : "capture-text-hint"}
            aria-invalid={overLimit || undefined}
          />
          <p className="text-right text-xs text-text-muted">
            {current.text.length.toLocaleString()} / {MAX_CAPTURE_CHARS.toLocaleString()}
          </p>
        </Field>

        {(current.pageTitle || current.url || current.domain) && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-navy">Where it came from</legend>
            <p className="text-xs text-text-muted">Remove anything you don't want to share. Removed items are not sent.</p>
            {current.pageTitle && (
              <SourceRow
                label="Page title"
                value={current.pageTitle.slice(0, MAX_PAGE_TITLE_CHARS)}
                included={current.includeTitle && !conversation?.hideNames}
                onToggle={() => update({ includeTitle: !current.includeTitle })}
                disabled={!!conversation?.hideNames}
                note={conversation?.hideNames ? "Withheld while names are hidden." : undefined}
              />
            )}
            {current.url && (
              <SourceRow
                label="Page address"
                value={current.url}
                included={current.includeUrl}
                onToggle={() => update({ includeUrl: !current.includeUrl })}
              />
            )}
            {current.domain && (
              <SourceRow
                label="Website"
                value={current.domain}
                included={current.includeDomain}
                onToggle={() => update({ includeDomain: !current.includeDomain })}
              />
            )}
          </fieldset>
        )}

        <Field label="What do I need to do with this? (optional)" htmlFor="capture-note" hint="A short note helps Ritme understand why you saved it.">
          <Input id="capture-note" value={current.note} onChange={(e) => update({ note: e.target.value })} maxLength={500} />
        </Field>

        {submitting && (
          <StatusNotice tone="info" icon={<InfoGlyph />} title="Saving…">
            <p>Waiting for Ritme to confirm.</p>
          </StatusNotice>
        )}
        {status.kind === "not_connected" && (
          <StatusNotice tone="warning" icon={<NotConnectedIcon />} title="Not connected to Ritme">
            <p>Nothing was saved. Connect to Ritme, then come back; your draft is kept here.</p>
          </StatusNotice>
        )}
        {status.kind === "offline" && (
          <StatusNotice tone="error" icon={<ErrorIcon />} title="Couldn't reach Ritme">
            <p>Nothing was saved. Your draft is kept here. Check your connection and retry.</p>
          </StatusNotice>
        )}
        {status.kind === "error" && (
          <StatusNotice tone="error" icon={<ErrorIcon />} title="Not saved">
            <p>{status.message}</p>
          </StatusNotice>
        )}
        {connected === false && status.kind === "idle" && (
          <StatusNotice tone="warning" icon={<NotConnectedIcon />} title="Not connected to Ritme">
            <p>Connect first so Ritme can receive this. Your draft stays here while you do.</p>
          </StatusNotice>
        )}
        {copied && (
          <p role="status" className="text-sm text-text-secondary">
            Copied to your clipboard.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {needsConnect ? (
            <Button onClick={() => void openConnectPage()}>Connect to Ritme</Button>
          ) : canRetry ? (
            <Button onClick={() => void onSave()} disabled={!canSubmit} loading={submitting}>
              <span aria-hidden="true" className="h-4 w-4">
                <RetryIcon />
              </span>
              Retry
            </Button>
          ) : (
            <Button onClick={() => void onSave()} disabled={!canSubmit} loading={submitting}>
              Save to Ritme
            </Button>
          )}
          {failed && (
            <Button variant="outline" onClick={() => void onCopy()}>
              <span aria-hidden="true" className="h-4 w-4">
                <CopyGlyph />
              </span>
              Copy text
            </Button>
          )}
          <Button variant="ghost" onClick={() => void onCancel()} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </div>
    </Shell>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6">
      <header className="mb-5 space-y-1">
        <Wordmark />
        <h1 className="text-xl font-bold text-navy">Review before saving</h1>
      </header>
      {children}
    </main>
  );
}

function SourceRow({
  label,
  value,
  included,
  onToggle,
  note,
  disabled,
}: {
  label: string;
  value: string;
  included: boolean;
  onToggle: () => void;
  note?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-secondary">{label}</p>
        <p className={included ? "break-all text-sm text-text" : "break-all text-sm text-text-muted line-through"}>{value}</p>
        {!included && <p className="text-xs font-medium text-text-secondary">Not included</p>}
        {note && <p className="text-xs text-text-secondary">{note}</p>}
      </div>
      <Button variant="outline" size="sm" onClick={onToggle} disabled={disabled} aria-label={`${included ? "Remove" : "Add back"} ${label.toLowerCase()}`}>
        {included ? "Remove" : "Add back"}
      </Button>
    </div>
  );
}
