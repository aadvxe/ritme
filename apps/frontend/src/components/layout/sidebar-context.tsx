import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { safeStorage } from "@/lib/safe-storage";

interface SidebarValue {
  open: boolean;
  isDesktop: boolean;
  toggle: () => void;
  close: () => void;
}
const Ctx = createContext<SidebarValue | null>(null);
const KEY = "ritme.sidebar.open";

const desktopQuery = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(min-width: 1024px)") : null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isDesktop, setIsDesktop] = useState(() => desktopQuery()?.matches ?? true);
  const [open, setOpen] = useState(() => (desktopQuery()?.matches ?? true) && safeStorage.get(KEY) !== "0");

  useEffect(() => {
    const mq = desktopQuery();
    if (!mq) return;
    const on = () => {
      setIsDesktop(mq.matches);
      setOpen(mq.matches ? safeStorage.get(KEY) !== "0" : false);
    };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const toggle = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      if (desktopQuery()?.matches) safeStorage.set(KEY, next ? "1" : "0");
      return next;
    });
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, isDesktop, toggle, close }), [open, isDesktop, toggle, close]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSidebar(): SidebarValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return v;
}
