import type { Adapter } from "../types";

/**
 * Outlook on the web (outlook.office.com, outlook.live.com, ...). UNVERIFIED and the least certain
 * adapter: Outlook's class names are obfuscated, so this leans on ids and aria-labels
 * (UniqueMessageBody*, "Message body", "From:"). Reads the message(s) open in the reading pane.
 */
const common = {
  text: [":self"],
  container: "[role='article'], [role='listitem'], [data-convid]",
  sender: [
    "[data-testid='message-sender']",
    "[aria-label^='From:']",
    "span[title*='@']",
    "[id^='SenderName']",
  ],
  time: ["[data-testid='message-date']", "[aria-label^='Sent:']", "[id^='dateTime']", "time[datetime]"],
};

export const outlook: Adapter = {
  id: "outlook",
  appName: "Outlook",
  hosts: ["outlook.office.com", "outlook.office365.com", "outlook.live.com", "outlook.cloud.microsoft"],
  scope: ["#ConversationReadingPaneContainer", "[data-app-section='ConversationContainer']", "[role='main']"],
  title: [
    "[data-testid='message-subject']",
    "#ConversationReadingPaneContainer [role='heading'][aria-level='2']",
    "[role='main'] [role='heading'][aria-level='2']",
    "#ConversationReadingPaneContainer [role='heading']",
  ],
  strategies: [
    { name: "UniqueMessageBody", messages: "[id^='UniqueMessageBody']", ...common },
    { name: "Message body label", messages: "div[aria-label='Message body']", ...common },
    { name: "document role", messages: "[role='document'][aria-label*='essage']", ...common },
  ],
};
