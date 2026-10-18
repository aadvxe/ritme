import { handleRequest, type HandlerOptions } from "./handlers";
import { browserStorage, createDb, memoryStorage, type MockStorage, type MockStore } from "./store";

export interface MockFetchOptions {
  latencyMs?: number;
  storage?: MockStorage;
  now?: () => Date;
  maxCaptureChars?: number;
}

export interface MockFetch {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  store: MockStore;
}

/** A `fetch` that answers every Ritme API endpoint from an in-memory (browser-persisted) fake. */
export function createMockFetch(options: MockFetchOptions = {}): MockFetch {
  const now = options.now ?? (() => new Date());
  const latency = options.latencyMs ?? 0;
  const storage = options.storage ?? (typeof window === "undefined" ? memoryStorage() : browserStorage());
  const store = createDb(storage, now);
  const opts: HandlerOptions = { now, analysisMs: latency > 0 ? 1200 : 0, maxCaptureChars: options.maxCaptureChars ?? 20_000 };

  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const headers = new Headers(init?.headers);
    let body: unknown;
    if (typeof init?.body === "string" && init.body) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = undefined;
      }
    }
    if (latency > 0) await new Promise((r) => setTimeout(r, latency));
    const res = handleRequest(
      store,
      {
        method: (init?.method ?? "GET").toUpperCase(),
        path: url.pathname,
        query: url.searchParams,
        body,
        authorized: (headers.get("Authorization") ?? "").startsWith("Bearer "),
      },
      opts,
    );
    return new Response(res.body === undefined ? null : JSON.stringify(res.body), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return Object.assign(impl, { store }) as MockFetch;
}
