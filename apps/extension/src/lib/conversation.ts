/**
 * Conversation drafts: a list of messages the user can include/exclude, optional "Person A/B" names,
 * and the readable transcript that becomes `contentText`.
 */

export interface DraftMessage {
  id: string;
  sender: string | null;
  time: string | null;
  text: string;
  included: boolean;
}

export interface DraftConversation {
  /** Display name, e.g. "WhatsApp". */
  app: string;
  chatTitle: string | null;
  messages: DraftMessage[];
  /** Replace other people's names with Person A/B... (your own messages stay "You"). */
  hideNames: boolean;
  /** More messages were on screen than Ritme read. */
  capped: boolean;
  /** Older messages left unchecked at the start because they would not fit the size limit. */
  autoExcluded: number;
  /** The user typed in the text box: changing the message selection no longer rebuilds it. */
  textEdited: boolean;
}

const SELF = "You";

function personLabel(index: number): string {
  return index < 26 ? `Person ${String.fromCharCode(65 + index)}` : `Person ${index + 1}`;
}

/** Stable labels: assigned in order of first appearance across ALL messages, so toggling a message never renames anyone. */
export function senderLabels(messages: Pick<DraftMessage, "sender">[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const m of messages) {
    if (m.sender && m.sender !== SELF && !labels.has(m.sender)) labels.set(m.sender, personLabel(labels.size));
  }
  return labels;
}

/** The chat title is withheld from the transcript while names are hidden (it is often a person's name). */
export function effectiveTitle(conv: Pick<DraftConversation, "chatTitle" | "hideNames">): string | null {
  return conv.hideNames ? null : conv.chatTitle;
}

export function buildTranscript(conv: Pick<DraftConversation, "app" | "chatTitle" | "messages" | "hideNames">): string {
  const title = effectiveTitle(conv);
  const header = title ? `Chat: ${title} (${conv.app})` : `Chat (${conv.app})`;
  const labels = conv.hideNames ? senderLabels(conv.messages) : null;
  const lines = conv.messages
    .filter((m) => m.included)
    .map((m) => {
      const who = m.sender ? (labels?.get(m.sender) ?? m.sender) : null;
      return `${m.time ? `[${m.time}] ` : ""}${who ? `${who}: ` : ""}${m.text}`;
    });
  return [header, ...lines].join("\n");
}

/**
 * Keeps the NEWEST messages that fit `max` characters and unchecks older ones. Never truncates a
 * message. If a single message is longer than `max`, it stays included and the preview blocks Save.
 */
export function fitToLimit(conv: DraftConversation, max: number): DraftConversation {
  const messages = conv.messages.map((m) => ({ ...m, included: true }));
  let autoExcluded = 0;
  const next = { ...conv, messages };
  while (buildTranscript(next).length > max) {
    const oldest = messages.find((m) => m.included);
    if (!oldest || messages.filter((m) => m.included).length <= 1) break;
    oldest.included = false;
    autoExcluded++;
  }
  return { ...next, autoExcluded };
}

export function includedCount(conv: Pick<DraftConversation, "messages">): number {
  return conv.messages.filter((m) => m.included).length;
}
