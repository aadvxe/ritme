import type { ExtensionTokenResponse } from "@ritme/api-client";

export interface ConnectMessage {
  type: "ritme.connect";
  payload: ExtensionTokenResponse;
}

interface ChromeRuntime {
  sendMessage: (extensionId: string, message: unknown, cb?: (response: unknown) => void) => void;
  lastError?: { message?: string };
}

const chromeRuntime = (): ChromeRuntime | null => {
  const c = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  return c?.runtime && typeof c.runtime.sendMessage === "function" ? c.runtime : null;
};

export const canMessageExtension = () => chromeRuntime() !== null;

/**
 * Step 3 of the connect protocol (docs/api.md): hand the token response to the extension with
 * chrome.runtime.sendMessage(EXTENSION_ID, { type: "ritme.connect", payload }).
 * Resolves once the extension answers; rejects if it can't be reached or doesn't answer in time.
 */
export function sendConnectToExtension(extensionId: string, payload: ExtensionTokenResponse, timeoutMs = 5000): Promise<void> {
  const rt = chromeRuntime();
  if (!rt) return Promise.reject(new Error("no-chrome"));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    try {
      const msg: ConnectMessage = { type: "ritme.connect", payload };
      rt.sendMessage(extensionId, msg, () => {
        clearTimeout(timer);
        if (rt.lastError) reject(new Error(rt.lastError.message ?? "unreachable"));
        else resolve();
      });
    } catch (e) {
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error("unreachable"));
    }
  });
}
