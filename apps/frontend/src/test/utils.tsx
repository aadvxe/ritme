import { createApiClient, type ApiClient } from "@ritme/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { createMockFetch, type MockFetch } from "../../mocks/mock-fetch";
import { memoryStorage } from "../../mocks/store";
import { AppRoutes } from "@/App";
import { ApiProvider } from "@/lib/api";
import { AuthProvider, type AuthBackend, type AuthUser } from "@/lib/auth";

/** A fixed "now" so date-dependent behaviour is repeatable. Monday 19 Oct 2026, 09:00 local. */
export const NOW = new Date(2026, 9, 19, 9, 0, 0);

export interface TestEnv {
  api: ApiClient;
  mock: MockFetch;
  calls: { method: string; path: string }[];
}

/** An API client wired to a fresh in-memory mock backend (the seeded demo workflow is present). */
export function makeEnv(now: () => Date = () => NOW): TestEnv {
  const calls: TestEnv["calls"] = [];
  const mock = createMockFetch({ storage: memoryStorage(), now, latencyMs: 0 });
  const spy = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push({ method: (init?.method ?? "GET").toUpperCase(), path: url.pathname });
    return mock(input, init);
  }) as typeof fetch;
  const api = createApiClient({ baseUrl: "http://api.test", getToken: async () => "test-token", fetchImpl: spy });
  return { api, mock, calls };
}

export const TEST_USER: AuthUser = { uid: "u1", displayName: "Test User", email: "test@example.com", photoUrl: null };

export function fakeAuth(user: AuthUser | null = TEST_USER): AuthBackend & { signedOut: boolean } {
  const state = { signedOut: false };
  return {
    get signedOut() {
      return state.signedOut;
    },
    subscribe(cb) {
      cb(state.signedOut ? null : user);
      return () => undefined;
    },
    async signIn() {},
    async signOut() {
      state.signedOut = true;
    },
    async getToken() {
      return user ? "test-token" : null;
    },
  } as AuthBackend & { signedOut: boolean };
}

export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 }, mutations: { retry: false } } });
}

export function Providers({ children, env, route = "/", user = TEST_USER }: { children: ReactNode; env: TestEnv; route?: string; user?: AuthUser | null }) {
  return (
    <AuthProvider backend={fakeAuth(user)}>
      <QueryClientProvider client={makeQueryClient()}>
        <ApiProvider client={env.api}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </ApiProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export function renderWith(ui: ReactElement, env: TestEnv = makeEnv(), route = "/") {
  return { env, ...render(<Providers env={env} route={route}>{ui}</Providers>) };
}

/** Render the whole routed app (guards, shell, pages) at a URL. */
export function renderApp(route: string, env: TestEnv = makeEnv(), opts: { onboarded?: boolean } = {}) {
  if (opts.onboarded !== false) env.mock.store.db.me.onboardingCompleted = true;
  return { env, ...render(<Providers env={env} route={route}><AppRoutes /></Providers>) };
}

export function demoWorkflowId(env: TestEnv): string {
  const w = env.mock.store.db.workflows.find((x) => x.summary.isDemo);
  if (!w) throw new Error("no demo workflow");
  return w.summary.id;
}

/** Answer both demo blockers through the API, so the workflow is ready to plan. */
export async function answerDemoBlockers(env: TestEnv): Promise<string> {
  const id = demoWorkflowId(env);
  const d = await env.api.workflows.get(id);
  const [q1, q2] = d.questions;
  await env.api.workflows.answer(id, q1!.id, { answer: "This Friday, end of day", disposition: "answer" });
  await env.api.workflows.answer(id, q2!.id, { answer: "Priya and Sam", disposition: "answer" });
  return id;
}

/** Ready-to-approve: blockers answered, plan drafted, action proposed (pending approval). */
export async function proposeDemoPlan(env: TestEnv): Promise<{ id: string; actionId: string; planId: string }> {
  const id = await answerDemoBlockers(env);
  await env.api.preferences.patch({ taskGranularity: "small_steps", planLayout: "one_step" });
  const plan = await env.api.workflows.plan(id);
  const action = await env.api.workflows.proposeAction(id, { planVersionId: plan.id });
  return { id, actionId: action.id, planId: plan.id };
}

/** Everything approved and executed: real tasks exist. */
export async function executeDemoPlan(env: TestEnv) {
  const p = await proposeDemoPlan(env);
  await env.api.actions.approve(p.actionId);
  const done = await env.api.actions.execute(p.actionId);
  return { ...p, done };
}
