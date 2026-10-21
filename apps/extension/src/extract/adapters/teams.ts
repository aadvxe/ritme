import type { Adapter } from "../types";

/**
 * Microsoft Teams on the web (teams.microsoft.com, teams.live.com, teams.cloud.microsoft). UNVERIFIED.
 * Relies on data-tid attributes: chat-pane-message / channel-pane-message, message-body,
 * message-author-name, and <time datetime>.
 */
const common = {
  text: ["[data-tid='message-body']", "[id^='content-']"],
  exclude: "[data-tid='quoted-reply-card'], [data-tid='reply-card'], blockquote",
  sender: ["[data-tid='message-author-name']", "[id^='author-']"],
  time: ["time[datetime]", "[id^='timestamp-']"],
};

export const teams: Adapter = {
  id: "teams",
  appName: "Microsoft Teams",
  hosts: ["teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft"],
  scope: ["[data-tid='message-pane-list-viewport']", "[data-tid='chat-pane']", "[role='main']"],
  title: [
    "[data-tid='chat-title']",
    "[data-tid='chat-header-title']",
    "[data-tid='thread-title']",
    "[data-tid='chat-header'] h2",
    "[data-tid='channel-header'] h2",
  ],
  strategies: [
    { name: "chat-pane-message", messages: "[data-tid='chat-pane-message']", ...common },
    { name: "channel-pane-message", messages: "[data-tid='channel-pane-message']", ...common },
    { name: "data-mid listitem", messages: "[role='listitem'][data-mid], [data-mid]", ...common },
  ],
};
