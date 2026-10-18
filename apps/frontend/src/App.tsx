import { Toaster } from "@ritme/design";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth, RequireOnboarded } from "@/components/layout/guards";
import { ApiProvider } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";
import { CalendarPage } from "@/pages/CalendarPage";
import { ConnectPage } from "@/pages/ConnectPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { GuidelinesPage } from "@/pages/GuidelinesPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { WelcomePage } from "@/pages/WelcomePage";
import { WorkflowPage } from "@/pages/WorkflowPage";
import type { ApiClient } from "@ritme/api-client";
import type { AuthBackend } from "@/lib/auth";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        // Surface offline as an explicit state instead of silently pausing.
        networkMode: "always",
        refetchOnWindowFocus: true,
        retry: (count, err) => {
          const e = err as { isNetwork?: boolean; retryable?: boolean; status?: number };
          if (e.status && e.status >= 400 && e.status < 500) return false;
          return count < (e.isNetwork || e.retryable ? 2 : 0);
        },
      },
      mutations: { networkMode: "always" },
    },
  });
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/connect" element={<ConnectPage />} />
        <Route element={<RequireOnboarded />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="guidelines" element={<GuidelinesPage />} />
            <Route path="library" element={<Navigate to="/guidelines" replace />} />
            <Route path="workflows/:id" element={<WorkflowPage />} />
            <Route path="settings/*" element={<SettingsPage />} />
            <Route path="preferences" element={<Navigate to="/settings/working-style" replace />} />
            <Route path="privacy" element={<Navigate to="/settings/privacy" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}

export function App({ apiClient, authBackend, queryClient }: { apiClient?: ApiClient; authBackend?: AuthBackend; queryClient?: QueryClient }) {
  const [qc] = useState(() => queryClient ?? makeQueryClient());
  return (
    <AuthProvider backend={authBackend}>
      <QueryClientProvider client={qc}>
        <ApiProvider client={apiClient}>
          <AppRoutes />
          <Toaster />
        </ApiProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}
