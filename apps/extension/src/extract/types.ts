export type AppId = "whatsapp" | "telegram" | "teams" | "slack" | "gmail" | "outlook";

export interface ExtractedMessage {
  id: string;
  sender: string | null;
  time: string | null;
  text: string;
}

export interface ExtractionOptions {
  /** Newest messages to read from the open conversation (default 30). */
  maxMessages?: number;
  /** Selection reported by the browser, used only if the page selection is empty. */
  selectionText?: string;
}

export type FailReason = "no_messages_found" | "no_selection" | "injection_failed" | "extractor_missing";

export interface ExtractionSuccess {
  ok: true;
  mode: "selection" | "conversation";
  appId: AppId | null;
  app: string | null;
  chatTitle: string | null;
  domain: string;
  pageUrl: string;
  messages: ExtractedMessage[];
  /** True when more messages were rendered than were read. */
  truncated: boolean;
}

export type ExtractionResult = ExtractionSuccess | { ok: false; reason: FailReason };

/**
 * One way of finding messages in an app's DOM. Selectors drift, so every adapter lists several
 * strategies; the first one that yields at least one message wins.
 */
export interface Strategy {
  name: string;
  /** Selector for message elements (outermost match wins when matches nest). */
  messages: string;
  /** Maps a matched element to the element holding the message (used for text, ids, selection tests). */
  root?: (el: Element) => Element;
  /** Selectors tried in order for the message text; ":self" means the whole element. */
  text: string[];
  /** Descendants to leave out of the text (reply quotes, timestamps, quoted mail...). */
  exclude?: string;
  /** Parts of the text container to ignore when found inside (e.g. quoted replies). */
  skipWithin?: string;
  /** Where to look for sender/time: the closest match of this selector, else the adapter scope. */
  container?: string;
  sender?: string[];
  time?: string[];
  /** Pulls sender/time out of attributes instead of descendants (e.g. WhatsApp data-pre-plain-text). */
  meta?: (el: Element) => { sender?: string | null; time?: string | null } | null;
  /** True for messages written by the user; their sender becomes "You". */
  own?: (el: Element) => boolean;
}

export interface Adapter {
  id: AppId;
  appName: string;
  /** Hostnames (exact or parent domain) this adapter handles. */
  hosts: string[];
  /** Selectors for the region to read from (first present wins; falls back to the whole document). */
  scope: string[];
  /** Selectors for the conversation title / email subject. */
  title: string[];
  strategies: Strategy[];
}
