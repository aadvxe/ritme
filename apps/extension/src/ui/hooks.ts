import { useEffect, useState } from "react";
import { TOKEN_KEY, getTokens } from "../lib/storage";

/** Live connection state. null = still reading storage. Updates when tokens change in any extension page. */
export function useConnected(): boolean | null {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () =>
      void getTokens().then((t) => {
        if (alive) setConnected(t !== null);
      });
    read();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && TOKEN_KEY in changes) read();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);
  return connected;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
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
