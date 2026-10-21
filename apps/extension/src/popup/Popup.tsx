import { useEffect, useState } from "react";
import { Badge, Button, Card, Spinner, Wordmark } from "@ritme/design";
import { adapterForUrl } from "../extract/registry";
import { disconnect, openConnectPage } from "../lib/auth";
import { FAIL_MESSAGES, captureTab, openOutcome } from "../lib/capture-tab";
import { useConnected } from "../ui/hooks";
import { ErrorIcon, InfoGlyph, NotConnectedIcon, SuccessIcon } from "../ui/icons";
import { StatusNotice } from "../ui/StatusNotice";

type ActiveTab = { id?: number; title?: string; url?: string };

async function getActiveTab(): Promise<ActiveTab | null> {
  try {
    // activeTab makes the current tab's URL and title readable because the user opened this popup.
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ? { id: tab.id, title: tab.title, url: tab.url } : null;
  } catch {
    return null;
  }
}

export function Popup() {
  const connected = useConnected();
  const [tab, setTab] = useState<ActiveTab | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getActiveTab().then((t) => alive && setTab(t));
    return () => {
      alive = false;
    };
  }, []);

  const adapter = adapterForUrl(tab?.url);

  async function capture() {
    if (busy || !tab) return;
    setBusy(true);
    setError(null);
    const outcome = await captureTab(tab);
    if (!outcome.ok) {
      setError(FAIL_MESSAGES[outcome.reason]);
      setBusy(false);
      return;
    }
    await openOutcome(outcome);
    window.close();
  }

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
          <p>Connect this browser to your Ritme account so it can receive what you choose to save.</p>
          <Button className="mt-2" size="sm" onClick={() => void openConnectPage()}>
            Connect to Ritme
          </Button>
        </StatusNotice>
      )}

      <Card className="space-y-3 p-4">
        {tab === undefined ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Spinner label="Checking this tab" className="h-4 w-4" /> Checking this tab…
          </div>
        ) : adapter ? (
          <>
            <StatusNotice tone="success" icon={<SuccessIcon />} title={`${adapter.appName} detected`}>
              <p>Ritme can read the messages on screen in this conversation. You'll review them before anything is saved.</p>
            </StatusNotice>
            <p className="text-xs text-text-secondary">
              If you've selected text, only the selection is captured. Otherwise the latest 30 messages shown on the page.
            </p>
            <Button className="w-full" onClick={() => void capture()} loading={busy}>
              Capture this conversation
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-base font-semibold text-navy">Save selected text</h1>
            <p className="text-xs text-text-secondary">
              Select text on the page, then use the Ritme button or right-click and choose “Save selection to Ritme”.
            </p>
            <Button className="w-full" variant="outline" onClick={() => void capture()} loading={busy} disabled={!tab}>
              Save selected text
            </Button>
          </>
        )}

        {error && (
          <StatusNotice tone="error" icon={<ErrorIcon />} title="Nothing was captured">
            <p>{error}</p>
          </StatusNotice>
        )}

        <p className="flex items-start gap-2 text-xs text-text-muted">
          <span aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0">
            <InfoGlyph />
          </span>
          Ritme reads the page only when you ask, once. Nothing is sent until you press Save on the next screen.
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
