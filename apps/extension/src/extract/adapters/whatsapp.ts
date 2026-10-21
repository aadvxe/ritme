import type { Adapter } from "../types";

/**
 * WhatsApp Web (web.whatsapp.com). UNVERIFIED against live accounts.
 * Fix selectors here when WhatsApp changes its markup. Strategy 1 relies on
 * `data-pre-plain-text="[10:15, 18/10/2026] Sender Name: "` on the copyable-text node.
 */
const PRE_PLAIN = /^\[([^\]]*)\]\s*(.*?):\s*$/s;

const dataIdOf = (el: Element) => el.closest("[data-id]")?.getAttribute("data-id") ?? "";
const isOwn = (el: Element) => !!el.closest(".message-out") || dataIdOf(el).startsWith("true_");

const QUOTED = "[data-testid='quoted-message'], [aria-label^='Quoted'], .quoted-mention";

export const whatsapp: Adapter = {
  id: "whatsapp",
  appName: "WhatsApp",
  hosts: ["web.whatsapp.com"],
  scope: ["#main", "[data-testid='conversation-panel-messages']"],
  title: [
    "#main header [data-testid='conversation-info-header-chat-title']",
    "#main header span[title]",
    "header span[dir='auto'][title]",
    "#main header span[dir='auto']",
  ],
  strategies: [
    {
      name: "data-pre-plain-text",
      messages: "[data-pre-plain-text]",
      root: (el) => el.closest("[data-id]") ?? el.parentElement ?? el,
      meta: (el) => {
        const m = PRE_PLAIN.exec(el.getAttribute("data-pre-plain-text") ?? "");
        return m ? { time: (m[1] ?? "").trim() || null, sender: (m[2] ?? "").trim() || null } : null;
      },
      text: [".selectable-text", "[data-testid='msg-text']", ":self"],
      skipWithin: QUOTED,
      own: isOwn,
    },
    {
      name: "data-id",
      messages: "[data-id^='true_'], [data-id^='false_']",
      text: [".selectable-text", "[data-testid='msg-text']"],
      skipWithin: QUOTED,
      sender: ["[data-testid='author']", "span[role='button'][aria-label][dir='auto']"],
      time: ["[data-testid='msg-time']"],
      own: isOwn,
    },
    {
      name: "message-in-out-class",
      messages: ".message-in, .message-out",
      text: [".selectable-text", "[data-testid='msg-text']"],
      skipWithin: QUOTED,
      sender: ["[data-testid='author']"],
      own: (el) => el.classList.contains("message-out"),
    },
  ],
};
