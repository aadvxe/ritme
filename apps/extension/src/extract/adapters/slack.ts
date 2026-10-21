import type { Adapter } from "../types";

/**
 * Slack on the web (app.slack.com). UNVERIFIED.
 * Relies on data-qa: message_container, message_sender_name, message-text, timestamp
 * (the timestamp link carries data-ts epoch seconds).
 */
export const slack: Adapter = {
  id: "slack",
  appName: "Slack",
  hosts: ["app.slack.com"],
  scope: ["[data-qa='message_pane']", "[data-qa='slack_kit_list']", ".c-virtual_list__scroll_container"],
  title: [
    "[data-qa='channel_name']",
    "[data-qa='channel_header'] [data-qa='channel_name']",
    ".p-view_header__channel_title",
    "[data-qa='im_name']",
    "[data-qa='inline_channel_entity__name']",
  ],
  strategies: [
    {
      name: "message_container",
      messages: "[data-qa='message_container']",
      text: ["[data-qa='message-text']", ".p-rich_text_section", ".p-rich_text_block"],
      exclude: "[data-qa='message_attachment'], .c-message_attachment",
      sender: ["[data-qa='message_sender_name']", ".c-message__sender_link", ".c-message__sender"],
      time: ["[data-qa='timestamp']", "a.c-timestamp", "time[datetime]"],
    },
    {
      name: "c-message_kit",
      messages: ".c-message_kit__background, .c-message_kit__message",
      text: [".c-message_kit__blocks .p-rich_text_block", ".p-rich_text_section", ".c-message__body"],
      sender: [".c-message__sender_link", ".c-message__sender"],
      time: ["a.c-timestamp", ".c-timestamp"],
    },
    {
      name: "virtual-list item",
      messages: "div[data-item-key]",
      text: [".p-rich_text_block", ".c-message__body"],
      sender: [".c-message__sender_link"],
      time: ["a.c-timestamp"],
    },
  ],
};
