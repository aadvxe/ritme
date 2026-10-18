import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useApi } from "./api";

export const qk = {
  me: ["me"] as const,
  prefs: ["preferences"] as const,
  dashboard: ["dashboard"] as const,
  calendar: (from: string, to: string) => ["calendar", from, to] as const,
  captures: ["captures"] as const,
  workflows: ["workflows"] as const,
  workflow: (id: string) => ["workflow", id] as const,
  activity: (id: string) => ["activity", id] as const,
  knowledge: ["knowledge"] as const,
  devices: ["devices"] as const,
  privacy: ["privacy"] as const,
};

export function useMe() {
  const api = useApi();
  return useQuery({ queryKey: qk.me, queryFn: () => api.me() });
}

export function usePreferences() {
  const api = useApi();
  return useQuery({ queryKey: qk.prefs, queryFn: () => api.preferences.get() });
}

export function useDashboard() {
  const api = useApi();
  return useQuery({
    queryKey: qk.dashboard,
    queryFn: () => api.dashboard(),
    // While something is being read, keep the page fresh without a manual reload.
    refetchInterval: (q) => (q.state.data?.activeWorkflows.some((w) => w.status === "analyzing") ? 1500 : false),
  });
}

export function useCalendar(from: string, to: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.calendar(from, to), queryFn: () => api.calendarOverview(from, to) });
}

export function useCaptures(limit = 50) {
  const api = useApi();
  return useQuery({ queryKey: [...qk.captures, limit], queryFn: () => api.captures.list(limit) });
}

export function useWorkflow(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: qk.workflow(id),
    queryFn: () => api.workflows.get(id),
    refetchInterval: (q) => (q.state.data?.workflow.status === "analyzing" ? 1500 : false),
  });
}

export function useWorkflowActivity(id: string) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: qk.activity(id),
    queryFn: ({ pageParam }) => api.workflows.activity(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useWorkflows() {
  const api = useApi();
  return useQuery({ queryKey: qk.workflows, queryFn: () => api.workflows.list() });
}

export function useKnowledge() {
  const api = useApi();
  return useQuery({ queryKey: qk.knowledge, queryFn: () => api.knowledge.list() });
}

export function useDevices() {
  const api = useApi();
  return useQuery({ queryKey: qk.devices, queryFn: () => api.extension.devices() });
}

export function usePrivacy() {
  const api = useApi();
  return useQuery({ queryKey: qk.privacy, queryFn: () => api.privacy.overview() });
}

/** After any change to a workflow, everything that derives from it is re-read from the server. */
export function useRefreshWorkflowData() {
  const qc = useQueryClient();
  return useCallback(
    (workflowId?: string) =>
      Promise.all([
        workflowId ? qc.invalidateQueries({ queryKey: qk.workflow(workflowId) }) : qc.invalidateQueries({ queryKey: ["workflow"] }),
        workflowId ? qc.invalidateQueries({ queryKey: qk.activity(workflowId) }) : qc.invalidateQueries({ queryKey: ["activity"] }),
        qc.invalidateQueries({ queryKey: qk.dashboard }),
        qc.invalidateQueries({ queryKey: ["calendar"] }),
        qc.invalidateQueries({ queryKey: qk.captures }),
        qc.invalidateQueries({ queryKey: qk.workflows }),
        qc.invalidateQueries({ queryKey: qk.knowledge }),
        qc.invalidateQueries({ queryKey: qk.privacy }),
      ]),
    [qc],
  );
}
