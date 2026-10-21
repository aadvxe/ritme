import { collect } from "./engine";
import { adapterForHost } from "./registry";
import type { ExtractionOptions, ExtractionResult } from "./types";

export const DEFAULT_MAX_MESSAGES = 30;

export interface PageSelection {
  text: string;
  /** Node containing the whole selection (Range.commonAncestorContainer). */
  anchor: Node | null;
}

/**
 * Reads the page ONCE and returns a structured result. Pure function of the document: it never
 * scrolls, clicks, observes or stores anything.
 *  - Text selected  -> only the selection (attributed to its sender when it sits inside one message).
 *  - Otherwise      -> the newest `maxMessages` rendered messages of the open conversation.
 */
export function extractFromDocument(
  doc: Document,
  loc: { hostname: string; href: string },
  selection: PageSelection,
  opts: ExtractionOptions = {},
): ExtractionResult {
  const adapter = adapterForHost(loc.hostname);
  const selected = (selection.text || opts.selectionText || "").trim();
  const max = Math.max(1, opts.maxMessages ?? DEFAULT_MAX_MESSAGES);
  const base = { domain: loc.hostname, pageUrl: loc.href };

  if (!adapter) {
    // Generic fallback: selected text only, never page content.
    if (!selected) return { ok: false, reason: "no_selection" };
    return {
      ok: true,
      mode: "selection",
      appId: null,
      app: null,
      chatTitle: doc.title.trim() || null,
      messages: [{ id: "selection", sender: null, time: null, text: selected }],
      truncated: false,
      ...base,
    };
  }

  const collected = collect(doc, adapter);

  if (selected) {
    const hit = selection.anchor ? collected.items.find((i) => i.el.contains(selection.anchor)) : undefined;
    return {
      ok: true,
      mode: "selection",
      appId: adapter.id,
      app: adapter.appName,
      chatTitle: collected.chatTitle,
      messages: [
        { id: hit?.message.id ?? "selection", sender: hit?.message.sender ?? null, time: hit?.message.time ?? null, text: selected },
      ],
      truncated: false,
      ...base,
    };
  }

  if (collected.items.length === 0) return { ok: false, reason: "no_messages_found" };
  return {
    ok: true,
    mode: "conversation",
    appId: adapter.id,
    app: adapter.appName,
    chatTitle: collected.chatTitle,
    messages: collected.items.slice(-max).map((i) => i.message),
    truncated: collected.items.length > max,
    ...base,
  };
}
