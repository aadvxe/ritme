import { gmail } from "./adapters/gmail";
import { outlook } from "./adapters/outlook";
import { slack } from "./adapters/slack";
import { teams } from "./adapters/teams";
import { telegram } from "./adapters/telegram";
import { whatsapp } from "./adapters/whatsapp";
import type { Adapter } from "./types";

/** Data only (no DOM access): safe to import from the service worker and the popup. */
export const ADAPTERS: Adapter[] = [whatsapp, telegram, teams, slack, gmail, outlook];

export function adapterForHost(hostname: string): Adapter | null {
  const host = hostname.toLowerCase();
  return ADAPTERS.find((a) => a.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
}

export function adapterForUrl(url: string | null | undefined): Adapter | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return adapterForHost(u.hostname);
  } catch {
    return null;
  }
}

/** documentUrlPatterns for the "Save this conversation" menu item (a filter, not a permission). */
export function conversationUrlPatterns(): string[] {
  return ADAPTERS.flatMap((a) => a.hosts.map((h) => `https://${h}/*`));
}
