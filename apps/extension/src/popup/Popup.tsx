import { useState } from "react";
import { Badge, Button, Card, Field, Spinner, Textarea, Wordmark } from "@ritme/design";
import { MAX_CAPTURE_CHARS } from "../config";
import { disconnect, openConnectPage } from "../lib/auth";
import { captureUrl, createDraft } from "../lib/capture";
import { saveDraft } from "../lib/storage";
import { useConnected } from "../ui/hooks";
import { InfoGlyph, NotConnectedIcon, SuccessIcon } from "../ui/icons";
import { StatusNotice } from "../ui/StatusNotice";

async function activeTabDetails(): Promise<{ title: string | null; url: string | null }> {
  try {
    // activeTab grants this only because the user opened the popup, and only for the current tab.
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return { title: tab?.title ?? null, url: tab?.url ?? null };
  } catch {
    return { title: null, url: null };
  }
}

export function Popup() {
  const connected = useConnected();
  const [text, setText] = useState("");
  const [attachTab, setAttachTab] = useState(false);
  const [busy, setBusy] = useState(false);

  async function review() {
    if (busy || !text.trim()) return;
    setBusy(true);
    const tab = attachTab ? await activeTabDetails() : { title: null, url: null };
    const draft = createDraft({ text, sourceType: "manual_text", pageTitle: tab.title, url: tab.url });
    await saveDraft(draft);
    await chrome.tabs.create({ url: captureUrl(draft.draftId), active: true });
    window.close();
  }

  const overLimit = text.length > MAX_CAPTURE_CHARS;

  return (
    <main className="space-y-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <Wordmark />
        {connected === null ? (
          <Spinner label="Checking connection" className="h-4 w-4" />
        ) : connected ? (
          <Badge tone="fact" icon={<SuccessIcon />}>
            Connected
          </Badge>
        ) : (
          <Badge tone="assumption" icon={<NotConnectedIcon />}>
            Not connected
          </Badge>
        )}
      </header>

      {connected === false && (
        <StatusNotice tone="warning" icon={<NotConnectedIcon />} title="Connect to save">
          <p>Connect this browser to your Ritme account so it can receive text you choose to save.</p>
          <Button className="mt-2" size="sm" onClick={() => void openConnectPage()}>
            Connect to Ritme
          </Button>
        </StatusNotice>
      )}

      <Card className="space-y-3 p-4">
        <h1 className="text-base font-semibold text-navy">Paste text to save</h1>
        <p className="text-xs text-text-secondary">
          Ritme only saves text you select (right-click, then “Save selection to Ritme”) or paste here. It never reads a page on its own.
        </p>
        <Field
          label="Text"
          htmlFor="popup-text"
          error={overLimit ? `That's over the ${MAX_CAPTURE_CHARS.toLocaleString()} character limit. You can shorten it in the next step.` : undefined}
        >
          <Textarea id="popup-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste something you need to act on…" />
        </Field>
        <label className="flex items-start gap-2 text-xs text-text-secondary">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-strong" checked={attachTab} onChange={(e) => setAttachTab(e.target.checked)} />
          <span>Also attach this tab's title and address. You can remove them in the preview.</span>
        </label>
        <Button className="w-full" onClick={() => void review()} disabled={!text.trim()} loading={busy}>
          Review before saving
        </Button>
        <p className="flex items-start gap-2 text-xs text-text-muted">
          <span aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0">
            <InfoGlyph />
          </span>
          Nothing is sent until you press Save on the next screen.
        </p>
      </Card>

      {connected && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => void disconnect()}>
            Disconnect this browser
          </Button>
        </div>
      )}
    </main>
  );
}
