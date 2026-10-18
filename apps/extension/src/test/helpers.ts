import { vi } from "vitest";
import type { StoredTokens } from "../lib/storage";
import { TOKEN_KEY } from "../lib/storage";
import type { ChromeMock } from "./chrome-mock";

export function validTokens(overrides: Partial<StoredTokens> = {}): StoredTokens {
  return {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    deviceId: "dev-1",
    scopes: ["captures:write"],
    ...overrides,
  };
}

export function connect(chromeMock: ChromeMock, tokens: StoredTokens = validTokens()) {
  chromeMock.storage.local.data.set(TOKEN_KEY, tokens);
}

export function captureResponse(overrides: Record<string, unknown> = {}) {
  return {
    capture: { id: "cap-1" },
    created: true,
    nextUrl: "/workflows/wf-1",
    workflow: { id: "wf-1" },
    ...overrides,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function errorResponse(status: number, code = "internal", message = "Something failed", retryable = status >= 500) {
  return jsonResponse({ error: { code, message, retryable, requestId: "r1" } }, status);
}

/** Installs a fetch stub that answers with the given handlers in order (last one repeats). */
export function stubFetch(...handlers: Array<(url: string, init?: RequestInit) => Response | Promise<Response>>) {
  let i = 0;
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const h = handlers[Math.min(i++, handlers.length - 1)];
    if (!h) throw new Error("no fetch handler");
    return h(url, init);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

export function sentBodies(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith("/api/captures"))
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}
