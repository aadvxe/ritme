import { firstEl, oneLine, outermost, readText, timeFrom } from "./dom";
import type { Adapter, ExtractedMessage, Strategy } from "./types";

export interface CollectedItem {
  /** The element that holds the message; used to attribute a text selection. */
  el: Element;
  message: ExtractedMessage;
}

export interface Collected {
  chatTitle: string | null;
  items: CollectedItem[];
  strategy: string | null;
}

function textFor(base: Element, s: Strategy): string {
  for (const sel of s.text) {
    const els =
      sel === ":self"
        ? [base]
        : outermost(Array.from(base.querySelectorAll(sel))).filter((e) => !(s.skipWithin && e.closest(s.skipWithin)));
    const text = els
      .map((e) => readText(e, s.exclude))
      .filter(Boolean)
      .join("\n");
    if (text) return text;
  }
  return "";
}

function cleanSender(raw: string): string | null {
  const s = oneLine(raw.replace(/^(from|de|von)\s*:\s*/i, ""));
  return s || null;
}

function runStrategy(scope: ParentNode, s: Strategy): CollectedItem[] {
  const matches = outermost(Array.from(scope.querySelectorAll(s.messages)));
  const items: CollectedItem[] = [];
  let carriedSender: string | null = null;

  matches.forEach((match, index) => {
    const root = s.root?.(match) ?? match;
    const lookup: ParentNode = (s.container ? root.closest(s.container) : null) ?? (s.container ? scope : root);
    const meta = s.meta?.(match) ?? {};

    let sender: string | null = null;
    if (s.own?.(match)) {
      sender = "You";
    } else if (meta.sender) {
      sender = meta.sender;
    } else if (s.sender) {
      const senderEl = firstEl(lookup, s.sender);
      sender = senderEl ? cleanSender(senderEl.getAttribute("title") ?? readText(senderEl)) : null;
    }
    if (sender) carriedSender = sender;
    else sender = carriedSender; // consecutive messages from one person often omit the name

    const text = textFor(root, s);
    if (!text) return; // media-only or empty rows

    let time = meta.time ?? null;
    if (!time && s.time) {
      const timeEl = firstEl(lookup, s.time);
      time = timeEl ? timeFrom(timeEl) : null;
    }
    const id = root.getAttribute("data-id") ?? root.getAttribute("data-message-id") ?? (root.id || `m${index}`);
    items.push({ el: root, message: { id, sender, time, text } });
  });
  return items;
}

/** Reads what is currently rendered. Never scrolls, clicks or loads more. */
export function collect(doc: Document, adapter: Adapter): Collected {
  const scope: ParentNode = firstEl(doc, adapter.scope) ?? doc;
  const titleEl = firstEl(doc, adapter.title);
  const rawTitle = titleEl ? (titleEl.getAttribute("title") || readText(titleEl)) : "";
  const chatTitle = oneLine(rawTitle) || null;

  for (const strategy of adapter.strategies) {
    const items = runStrategy(scope, strategy);
    if (items.length) return { chatTitle, items, strategy: strategy.name };
  }
  // Some apps render outside the expected scope; retry on the whole document before giving up.
  if (scope !== doc) {
    for (const strategy of adapter.strategies) {
      const items = runStrategy(doc, strategy);
      if (items.length) return { chatTitle, items, strategy: strategy.name };
    }
  }
  return { chatTitle, items: [], strategy: null };
}

