import type {
  ActivityPage,
  AnswerRequest,
  CalendarOverview,
  CaptureCreate,
  CaptureCreateResponse,
  CaptureOut,
  ConnectedDevice,
  DashboardOut,
  DeletionResult,
  DraftClarificationResponse,
  ErrorResponse,
  ExtensionConnectRequest,
  ExtensionRefreshRequest,
  ExtensionTokenResponse,
  KnowledgeDocCreate,
  KnowledgeDocOut,
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  MeOut,
  PlanPatch,
  PlanVersionOut,
  PreferencesOut,
  PreferencesPatch,
  PrivacyOverview,
  ProposedActionOut,
  ProposeActionRequest,
  ReplanRequest,
  ReplanResponse,
  RequirementItem,
  RequirementPatch,
  TaskOut,
  TaskPatch,
  WorkflowDetail,
  WorkflowPatch,
  WorkflowStatus,
  WorkflowSummary,
} from "./types.generated";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
  /** True when the request never reached the server (offline, DNS, CORS). */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns a Firebase ID token (web) or the extension access token. */
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

type Query = Record<string, string | number | undefined | null>;

export function createApiClient(opts: ApiClientOptions) {
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function request<T>(
    method: string,
    path: string,
    init: { body?: unknown; query?: Query; headers?: Record<string, string> } = {},
  ): Promise<T> {
    const url = new URL(path, opts.baseUrl);
    for (const [k, v] of Object.entries(init.query ?? {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const token = await opts.getToken();
    const headers: Record<string, string> = { Accept: "application/json", ...init.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (init.body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await doFetch(url.toString(), {
        method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw new ApiError(0, "network", "Could not reach Ritme. Check your connection.", true);
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const err = (json as ErrorResponse | undefined)?.error;
      throw new ApiError(
        res.status,
        err?.code ?? "internal",
        err?.message ?? `Request failed (${res.status})`,
        err?.retryable ?? res.status >= 500,
        err?.requestId,
      );
    }
    return json as T;
  }

  const get = <T>(p: string, query?: Query) => request<T>("GET", p, { query });
  const post = <T>(p: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>("POST", p, { body: body ?? {}, headers });
  const patch = <T>(p: string, body: unknown, headers?: Record<string, string>) =>
    request<T>("PATCH", p, { body, headers });
  const del = <T>(p: string) => request<T>("DELETE", p);

  return {
    me: () => get<MeOut>("/api/me"),
    completeOnboarding: () => post<MeOut>("/api/me/onboarding"),

    dashboard: () => get<DashboardOut>("/api/dashboard"),
    calendarOverview: (from: string, to: string) =>
      get<CalendarOverview>("/api/calendar-overview", { from, to }),

    captures: {
      create: (b: CaptureCreate) => post<CaptureCreateResponse>("/api/captures", b),
      list: (limit = 20) => get<CaptureOut[]>("/api/captures", { limit }),
      get: (id: string) => get<CaptureOut>(`/api/captures/${id}`),
      remove: (id: string) => del<DeletionResult>(`/api/captures/${id}`),
      analyze: (id: string) => post<WorkflowSummary>(`/api/captures/${id}/analyze`),
    },

    workflows: {
      list: (status?: WorkflowStatus) => get<WorkflowSummary[]>("/api/workflows", { status }),
      get: (id: string) => get<WorkflowDetail>(`/api/workflows/${id}`),
      patch: (id: string, b: WorkflowPatch) => patch<WorkflowSummary>(`/api/workflows/${id}`, b),
      remove: (id: string) => del<DeletionResult>(`/api/workflows/${id}`),
      pause: (id: string) => post<WorkflowSummary>(`/api/workflows/${id}/pause`),
      resume: (id: string) => post<WorkflowSummary>(`/api/workflows/${id}/resume`),
      cancel: (id: string) => post<WorkflowSummary>(`/api/workflows/${id}/cancel`),
      activity: (id: string, cursor?: string, limit = 30) =>
        get<ActivityPage>(`/api/workflows/${id}/activity`, { cursor, limit }),
      patchRequirement: (id: string, rid: string, b: RequirementPatch) =>
        patch<RequirementItem>(`/api/workflows/${id}/requirements/${rid}`, b),
      answer: (id: string, qid: string, b: AnswerRequest) =>
        post<WorkflowDetail>(`/api/workflows/${id}/questions/${qid}/answer`, b),
      draftClarification: (id: string, qid: string) =>
        post<DraftClarificationResponse>(`/api/workflows/${id}/questions/${qid}/draft`),
      plan: (id: string) => post<PlanVersionOut>(`/api/workflows/${id}/plan`),
      replan: (id: string, b: ReplanRequest) => post<ReplanResponse>(`/api/workflows/${id}/replan`, b),
      proposeAction: (id: string, b: ProposeActionRequest) =>
        post<ProposedActionOut>(`/api/workflows/${id}/actions`, b),
      tasks: (id: string) => get<TaskOut[]>(`/api/workflows/${id}/tasks`),
    },

    activity: (cursor?: string, limit = 30) => get<ActivityPage>("/api/activity", { cursor, limit }),

    planVersions: {
      /** `rowVersion` goes in the body; the server also honours `If-Match`. */
      patch: (id: string, b: PlanPatch) =>
        patch<PlanVersionOut>(`/api/plan-versions/${id}`, b, { "If-Match": String(b.rowVersion) }),
    },

    actions: {
      approve: (id: string) => post<ProposedActionOut>(`/api/actions/${id}/approve`),
      reject: (id: string) => post<ProposedActionOut>(`/api/actions/${id}/reject`),
      /** Executes an already-approved action exactly once; returns verification state. */
      execute: (id: string) => post<ProposedActionOut>(`/api/actions/${id}/execute`),
    },

    tasks: {
      patch: (id: string, b: TaskPatch) => patch<TaskOut>(`/api/tasks/${id}`, b),
    },

    preferences: {
      get: () => get<PreferencesOut>("/api/preferences"),
      patch: (b: PreferencesPatch) => patch<PreferencesOut>("/api/preferences", b),
      reset: () => del<PreferencesOut>("/api/preferences"),
      export: () => get<PreferencesOut>("/api/preferences/export"),
      import: (b: PreferencesPatch) => post<PreferencesOut>("/api/preferences/import", b),
      collabGuide: () => post<{ text: string }>("/api/preferences/collab-guide"),
    },

    knowledge: {
      list: () => get<KnowledgeDocOut[]>("/api/knowledge/documents"),
      create: (b: KnowledgeDocCreate) => post<KnowledgeDocOut>("/api/knowledge/documents", b),
      remove: (id: string) => del<DeletionResult>(`/api/knowledge/documents/${id}`),
      search: (b: KnowledgeSearchRequest) => post<KnowledgeSearchResponse>("/api/knowledge/search", b),
    },

    extension: {
      connect: (b: ExtensionConnectRequest) => post<ExtensionTokenResponse>("/api/extension/connect", b),
      refresh: (b: ExtensionRefreshRequest) => post<ExtensionTokenResponse>("/api/extension/refresh", b),
      devices: () => get<ConnectedDevice[]>("/api/extension/devices"),
      revoke: (id: string) => del<ConnectedDevice>(`/api/extension/devices/${id}`),
    },

    privacy: {
      overview: () => get<PrivacyOverview>("/api/privacy"),
      exportAll: () => get<Record<string, unknown>>("/api/privacy/export"),
      deleteAccountData: () => del<DeletionResult>("/api/privacy/account"),
    },

    demo: {
      reset: () => post<WorkflowSummary>("/api/demo/reset"),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
