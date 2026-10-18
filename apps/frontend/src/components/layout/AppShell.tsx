import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { s } from "@/i18n";
import { IconWifiOff } from "@/components/ui/icons";
import { useOnline } from "@/components/ui/feedback";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import { SidebarProvider } from "./sidebar-context";

function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b border-border bg-info/10 px-6 py-2 text-sm text-info-fg" data-testid="offline-banner">
      <IconWifiOff className="h-4 w-4" />
      {s.common.offlineBanner}
    </div>
  );
}

export function AppShell() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);

  // Move focus to the page on navigation so keyboard and screen-reader users start at the top.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo?.({ top: 0 });
  }, [pathname]);

  return (
    <SidebarProvider>
      <a href="#main" className="sr-only z-[10000] rounded-lg bg-surface px-4 py-2 text-sm font-medium text-primary-strong focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        {s.skipToContent}
      </a>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Navbar />
          <OfflineBanner />
          <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
