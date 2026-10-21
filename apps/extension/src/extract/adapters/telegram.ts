import type { Adapter } from "../types";

/**
 * Telegram Web (web.telegram.org), both clients. UNVERIFIED against live accounts.
 *  - /a ("Web A", React): `.Message` bubbles, `.text-content`, `.message-title-name`, `.message-time`.
 *  - /k ("Web K"): `.bubble[data-mid]`, `.message` (contains `.time`), `.peer-title`.
 */
export const telegram: Adapter = {
  id: "telegram",
  appName: "Telegram",
  hosts: ["web.telegram.org"],
  scope: ["#MiddleColumn", ".MessageList", ".chat.tabs-tab.active .bubbles", ".bubbles"],
  title: [
    ".MiddleHeader .ChatInfo .title",
    ".MiddleHeader .ChatInfo .fullName",
    ".MiddleHeader h3",
    ".chat-info .peer-title",
    ".sidebar-header .peer-title",
  ],
  strategies: [
    {
      name: "web-a .Message",
      messages: ".Message",
      text: [".text-content", ".content-inner .text-content"],
      exclude: ".MessageMeta, .message-time, .Reactions, .reply-message, .EmbeddedMessage",
      sender: [".message-title-name", ".message-title .interactive", ".sender-title"],
      time: [".message-time", ".MessageMeta .message-time"],
      own: (el) => el.classList.contains("own"),
    },
    {
      name: "web-k .bubble",
      messages: ".bubble[data-mid], .bubble",
      text: [".message", ".bubble-content .message"],
      exclude: ".time, .reactions, .reply, .reply-markup, .name",
      sender: [".name .peer-title", ".peer-title"],
      time: [".time"],
      own: (el) => el.classList.contains("is-out"),
    },
    {
      name: "data-message-id",
      messages: "[data-message-id]",
      text: [".text-content", ".message"],
      exclude: ".MessageMeta, .time",
      sender: [".message-title-name", ".peer-title"],
      time: [".message-time", ".time"],
      own: (el) => el.classList.contains("own") || el.classList.contains("is-out"),
    },
  ],
};
