import { Button, cn } from "@ritme/design";
import { MenuIcon } from "@astraicons/react/bold";
import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { s } from "@/i18n";
import { ConfirmDialog } from "@/components/ui/feedback";
import { IconChevronDown } from "@/components/ui/icons";
import { ModelBadge } from "./ModelBadge";
import { useSidebar } from "./sidebar-context";

function initialsOf(name: string | null, email: string | null): string {
  const base = (name ?? email ?? "?").trim();
  const parts = base.split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export function Navbar() {
  const { toggle, open, isDesktop } = useSidebar();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const name = user?.displayName ?? user?.email ?? s.common.accountFallback;

  return (
    <header role="banner" className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-2">
        {!isDesktop && (
          <button
            type="button"
            onClick={toggle}
            aria-label={s.nav.openMenu}
            aria-expanded={open}
            aria-controls="app-sidebar"
            className="rounded-lg p-2 text-text-secondary hover:bg-background"
          >
            <MenuIcon className="h-6 w-6" aria-hidden="true" />
          </button>
        )}
        <ModelBadge />
      </div>

      <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            title={s.nav.account}
            className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 shadow-card transition-colors hover:bg-background"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-strong text-xs font-semibold text-white">
              {initialsOf(user?.displayName ?? null, user?.email ?? null)}
            </span>
            <span className="hidden max-w-[10rem] truncate text-sm font-medium text-navy sm:inline">{name}</span>
            <IconChevronDown className="h-4 w-4 text-text-secondary" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            className={cn("z-50 w-64 animate-scale-in rounded-2xl border border-border bg-surface p-2 shadow-popover")}
          >
            <div className="px-3 py-2">
              <p className="truncate text-sm font-semibold text-navy">{user?.displayName ?? s.common.signedIn}</p>
              {user?.email && <p className="truncate text-xs text-text-secondary">{user.email}</p>}
            </div>
            <div className="my-1 border-t border-border" />
            <Link to="/settings" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2 text-sm text-text hover:bg-background">
              {s.nav.settings}
            </Link>
            <Link to="/settings/privacy" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2 text-sm text-text hover:bg-background">
              {s.nav.privacy}
            </Link>
            <div className="my-1 border-t border-border" />
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setMenuOpen(false);
                setConfirmOut(true);
              }}
            >
              {s.nav.signOut}
            </Button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <ConfirmDialog
        open={confirmOut}
        onOpenChange={setConfirmOut}
        title={s.signOutDialog.title}
        description={s.signOutDialog.body}
        confirmLabel={s.signOutDialog.confirm}
        onConfirm={() => void signOut()}
      />
    </header>
  );
}
