import type { CaptureCreate } from "@ritme/api-client";
import { MAX_CAPTURE_CHARS } from "../config";
import type { ExtractedMessage } from "../extract/types";
import { buildTranscript, fitToLimit, type DraftConversation } from "./conversation";

export type DraftSourceType = "browser_selection" | "manual_text";

/**
 * A capture the user is still reviewing. Lives only in chrome.storage.session until the user presses
 * "Save to Ritme" and the API answers 2xx; nothing is sent before that.
 */
export interface CaptureDraft {
  /** Storage handle (constant for the life of the draft). */
  draftId: string;
  /** Idempotency key: reused on retry, rotated only if the user changes what would be sent. */
  idempotencyKey: string;
  sourceType: DraftSourceType;
  text: string;
  pageTitle: string | null;
  url: string | null;
  domain: string | null;
  includeTitle: boolean;
  includeUrl: boolean;
  includeDomain: boolean;
  note: string;
  /** Set for captures read from a supported chat/mail app; null for plain selected text. */
  conversation: DraftConversation | null;
  /** Per-capture confirmation for sensitive domains. Never carried over to another draft. */
  sensitiveConfirmed: boolean;
  /** Fingerprint of the last payload we attempted to send (without the key). */
  attemptFingerprint: string | null;
  createdAt: string;
}

export interface DraftSource {
  text: string;
  sourceType: DraftSourceType;
  pageTitle?: string | null;
  url?: string | null;
  conversation?: { app: string; chatTitle: string | null; messages: ExtractedMessage[]; capped: boolean };
}

/** http(s) only; strips credentials and the #fragment. Anything else is treated as "no URL". */
export function cleanUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.username = "";
    u.password = "";
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

export function domainFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

/** URL of the extension-owned preview page for a draft. */
export function captureUrl(draftId: string): string {
  return chrome.runtime.getURL(`capture.html?draft=${encodeURIComponent(draftId)}`);
}

export function createDraft(source: DraftSource): CaptureDraft {
  const url = cleanUrl(source.url);
  const title = source.pageTitle?.trim() || null;
  const conversation: DraftConversation | null = source.conversation
    ? fitToLimit(
        {
          app: source.conversation.app,
          chatTitle: source.conversation.chatTitle,
          messages: source.conversation.messages.map((m) => ({ ...m, included: true })),
          hideNames: false,
          capped: source.conversation.capped,
          autoExcluded: 0,
          textEdited: false,
        },
        MAX_CAPTURE_CHARS,
      )
    : null;
  return {
    draftId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    sourceType: source.sourceType,
    text: conversation ? buildTranscript(conversation) : source.text,
    pageTitle: title,
    url,
    domain: domainFromUrl(url),
    includeTitle: title !== null,
    includeUrl: url !== null,
    includeDomain: url !== null,
    note: "",
    conversation,
    sensitiveConfirmed: false,
    attemptFingerprint: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * The exact request body. Only current preview values are used: edited text (not the original
 * selection), and any source detail the user removed is an explicit null.
 */
export function buildPayload(draft: CaptureDraft): CaptureCreate {
  const note = draft.note.trim();
  return {
    contentText: draft.text,
    idempotencyKey: draft.idempotencyKey,
    sourceType: draft.sourceType,
    sourceUrl: draft.includeUrl ? draft.url : null,
    sourceDomain: draft.includeDomain ? draft.domain : null,
    // While names are hidden the chat title (often a person's name) is withheld too.
    sourcePageTitle: draft.includeTitle && !draft.conversation?.hideNames ? draft.pageTitle : null,
    userNote: note ? note : null,
  };
}

/** What would be sent, ignoring the idempotency key. */
export function fingerprint(draft: CaptureDraft): string {
  const payload: Partial<CaptureCreate> = buildPayload(draft);
  delete payload.idempotencyKey;
  return JSON.stringify(payload);
}

/** Applies a conversation change (include/exclude, hide names) and rebuilds the transcript unless the user edited the text by hand. */
export function updateConversation(draft: CaptureDraft, patch: Partial<DraftConversation>): CaptureDraft {
  if (!draft.conversation) return draft;
  const conversation = { ...draft.conversation, ...patch };
  return { ...draft, conversation, text: conversation.textEdited ? draft.text : buildTranscript(conversation) };
}
