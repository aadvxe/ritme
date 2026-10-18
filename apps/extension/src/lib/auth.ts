/**
 * Extension connection: tokens in chrome.storage.local, delivered by the Ritme website via
 * chrome.runtime.onMessageExternal (docs/api.md "Extension connect protocol"), refreshed through
 * /api/extension/refresh. The token is scoped to captures:write and revocable server-side.
 */
import { ApiError, createApiClient, type ExtensionTokenResponse } from "@ritme/api-client";
import { API_BASE_URL, WEB_ORIGIN, WEB_URL } from "../config";
import { clearTokens, getTokens, setTokens, type StoredTokens } from "./storage";

export const CONNECT_MESSAGE = "ritme.connect";
const REFRESH_SKEW_MS = 30_000;

const refreshClient = createApiClient({ baseUrl: API_BASE_URL, getToken: async () => null });

export function parseConnectPayload(raw: unknown): StoredTokens | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<ExtensionTokenResponse>;
  const strings = [p.accessToken, p.refreshToken, p.expiresAt, p.deviceId];
  if (!strings.every((s) => typeof s === "string" && s.length > 0)) return null;
  if (!Array.isArray(p.scopes) || !p.scopes.includes("captures:write")) return null;
  if (Number.isNaN(Date.parse(p.expiresAt as string))) return null;
  return {
    accessToken: p.accessToken as string,
    refreshToken: p.refreshToken as string,
    expiresAt: p.expiresAt as string,
    deviceId: p.deviceId as string,
    scopes: [...p.scopes],
  };
}

function senderOrigin(sender: chrome.runtime.MessageSender): string | null {
  const raw = sender.origin ?? sender.url;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export interface ExternalReply {
  ok: boolean;
  error?: string;
}

/** Accepts tokens only from the Ritme web origin, and only in the documented message shape. */
export async function handleExternalMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<ExternalReply> {
  if (senderOrigin(sender) !== WEB_ORIGIN) return { ok: false, error: "origin_not_allowed" };
  if (!message || typeof message !== "object" || (message as { type?: unknown }).type !== CONNECT_MESSAGE) {
    return { ok: false, error: "unknown_message" };
  }
  const tokens = parseConnectPayload((message as { payload?: unknown }).payload);
  if (!tokens) return { ok: false, error: "invalid_payload" };
  await setTokens(tokens);
  return { ok: true };
}

export async function isConnected(): Promise<boolean> {
  return (await getTokens()) !== null;
}

export async function disconnect(): Promise<void> {
  await clearTokens();
}

export function connectUrl(): string {
  return `${WEB_URL.replace(/\/$/, "")}/connect?ext=${encodeURIComponent(chrome.runtime.id)}`;
}

export async function openConnectPage(): Promise<void> {
  await chrome.tabs.create({ url: connectUrl(), active: true });
}

let inflightRefresh: Promise<StoredTokens | null> | null = null;

/**
 * Rotates the tokens. Returns null (and clears the connection) when the server says the refresh token
 * is no longer valid. A network failure throws ApiError(status 0) and keeps the stored tokens.
 */
export function refreshTokens(): Promise<StoredTokens | null> {
  inflightRefresh ??= (async () => {
    const current = await getTokens();
    if (!current) return null;
    try {
      const fresh = parseConnectPayload(await refreshClient.extension.refresh({ refreshToken: current.refreshToken }));
      if (!fresh) throw new ApiError(502, "invalid_refresh", "Unexpected refresh response", true);
      await setTokens(fresh);
      return fresh;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 401 || err.status === 403)) {
        await clearTokens();
        return null;
      }
      throw err;
    }
  })().finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

/** A usable access token, refreshing when it is about to expire. null = not connected. */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getTokens();
  if (!tokens) return null;
  if (Date.parse(tokens.expiresAt) - Date.now() > REFRESH_SKEW_MS) return tokens.accessToken;
  const fresh = await refreshTokens();
  return fresh?.accessToken ?? null;
}
