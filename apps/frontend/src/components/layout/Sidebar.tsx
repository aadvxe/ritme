import { Wordmark, cn } from "@ritme/design";
import { CalenderIcon, FolderIcon, HomeIcon, Logout2Icon, SettingsIcon } from "@astraicons/react/bold";
import { ChevronLeftIcon } from "@astraicons/react/linear";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { s } from "@/i18n";
import { ConfirmDialog } from "@/components/ui/feedback";
import { useSidebar } from "./sidebar-context";

const NAV = [
  { to: "/", label: s.nav.dashboard, Icon: HomeIcon, end: true },
  { to: "/calendar", label: s.nav.calendar, Icon: CalenderIcon, end: false },
  { to: "/guidelines", label: s.nav.guidelines, Icon: FolderIcon, end: false },
];

const linkClass = (active: boolean, open: boolean) =>
  cn(
    "group relative flex h-12 items-center rounded-2xl px-4 transition-colors duration-200",
    open ? "justify-start" : "justify-center",
    // GMera uses #5C67F2 behind white text; the strong indigo keeps AA contrast.
    active ? "bg-primary-strong font-medium text-white shadow-card" : "text-text-secondary hover:bg-background hover:text-primary-strong",
  );

/** GMera collapsible sidebar: 250px, collapsing to a 72px icon rail on desktop; off-canvas on small screens. */
export function Sidebar() {
  const { open, isDesktop, toggle, close } = useSidebar();
  const { signOut } = useAuth();
  const [confirmOut, setConfirmOut] = useState(false);
  const closeOnMobile = () => {
    if (!isDesktop) close();
  };
  const hiddenOffCanvas = !open && !isDesktop;

  return (
    <>
      {open && !isDesktop && (
        <button type="button" aria-label={s.nav.closeMenu} onClick={close} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] lg:hidden" />
      )}
      <aside
        id="app-sidebar"
        // Off-canvas links must not be reachable by keyboard while hidden.
        {...(hiddenOffCanvas ? { inert: true } : {})}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh shrink-0 flex-col overflow-x-hidden border-r border-border bg-surface transition-all duration-300 ease-out-expo lg:sticky lg:top-0",
          open ? "w-[250px] translate-x-0" : "w-[250px] -translate-x-full lg:w-[72px] lg:translate-x-0",
        )}
      >
        <div className="flex h-20 shrink-0 items-center justify-between px-4">
          {open && (
            <div className="flex flex-1 justify-center pl-9">
              <Wordmark />
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={open ? s.nav.collapse : s.nav.expand}
            aria-expanded={open}
            aria-controls="app-sidebar"
            className={cn("shrink-0 rounded-lg p-2 text-text-secondary transition-colors hover:bg-background", !open && "mx-auto")}
          >
            <ChevronLeftIcon className={cn("h-5 w-5 transition-transform duration-300", !open && "rotate-180")} aria-hidden="true" />
          </button>
        </div>

        <nav aria-label={s.nav.main} className="scrollbar-none flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-4 py-4">
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={closeOnMobile}
              title={open ? undefined : label}
              aria-label={open ? undefined : label}
              className={({ isActive }) => linkClass(isActive, open)}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              {open && <span className="ml-4 whitespace-nowrap">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="mb-4 shrink-0 space-y-2 p-4">
          <NavLink
            to="/settings"
            onClick={closeOnMobile}
            title={open ? undefined : s.nav.settings}
            aria-label={open ? undefined : s.nav.settings}
            className={({ isActive }) => linkClass(isActive, open)}
          >
            <SettingsIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {open && <span className="ml-4 whitespace-nowrap">{s.nav.settings}</span>}
          </NavLink>
          <button
            type="button"
            onClick={() => setConfirmOut(true)}
            title={open ? undefined : s.nav.signOut}
            aria-label={open ? undefined : s.nav.signOut}
            className={cn(
              "flex h-12 w-full items-center rounded-2xl px-4 text-text-secondary transition-colors hover:bg-background hover:text-primary-strong",
              open ? "justify-start" : "justify-center",
            )}
          >
            <Logout2Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {open && <span className="ml-4 whitespace-nowrap">{s.nav.signOut}</span>}
          </button>
        </div>
      </aside>
      <ConfirmDialog
        open={confirmOut}
        onOpenChange={setConfirmOut}
        title={s.signOutDialog.title}
        description={s.signOutDialog.body}
        confirmLabel={s.signOutDialog.confirm}
        onConfirm={() => void signOut()}
      />
    </>
  );
}
