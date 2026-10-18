import { createApiClient, type ApiClient } from "@ritme/api-client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { env } from "./env";
import { useAuth } from "./auth";

const ApiContext = createContext<ApiClient | null>(null);

type FetchImpl = typeof fetch;

let mockFetchPromise: Promise<FetchImpl> | null = null;
/** The fake API lives in apps/frontend/mocks and is only pulled in when VITE_USE_MOCK_API=true. */
function loadMockFetch(): Promise<FetchImpl> {
  // The literal comparison lets the bundler drop the mock (and its seed data) from production builds.
  if (import.meta.env.VITE_USE_MOCK_API !== "true") return Promise.reject(new Error("The mock API is disabled."));
  mockFetchPromise ??= import("../../mocks/mock-fetch").then((m) => m.createMockFetch({ latencyMs: env.mockLatencyMs }));
  return mockFetchPromise;
}

export function ApiProvider({ children, client }: { children: ReactNode; client?: ApiClient }) {
  const auth = useAuth();
  const getToken = auth.getToken;
  const value = useMemo<ApiClient>(
    () =>
      client ??
      createApiClient({
        baseUrl: env.apiBaseUrl,
        getToken,
        ...(env.useMock ? { fetchImpl: ((...a: Parameters<FetchImpl>) => loadMockFetch().then((f) => f(...a))) as FetchImpl } : {}),
      }),
    [client, getToken],
  );
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const v = useContext(ApiContext);
  if (!v) throw new Error("useApi must be used inside <ApiProvider>");
  return v;
}

/** Plain-language message for an API failure. Never shows raw server text for unexpected errors. */
export function describeError(e: unknown): string {
  const err = e as { status?: number; message?: string; isNetwork?: boolean } | null;
  if (err?.isNetwork || err?.status === 0) return "Ritme could not be reached. Check your connection and try again.";
  if (err?.status === 409) return "This changed somewhere else while you were looking. Reload the latest version and try again.";
  if (err?.status === 429) return "Too many requests just now. Give it a moment and try again.";
  if (err?.status === 413) return "That is larger than Ritme can take in one go. Try a shorter piece.";
  if (err?.status && err.status >= 500) return "Something went wrong on our side. Nothing was lost. Please try again.";
  return err?.message || "Something did not work. Please try again.";
}
