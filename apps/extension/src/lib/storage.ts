/**
 * Typed wrappers over chrome.storage.
 *  - local   : connection tokens (survive browser restarts; scoped to captures:write, revocable).
 *  - session : capture drafts (cleared when the browser closes; never synced; never readable by web pages).
 */
import type { CaptureDraft } from "./capture";

export const TOKEN_KEY = "ritme.tokens";
const DRAFT_PREFIX = "ritme.draft.";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp from the API. */
  expiresAt: string;
  deviceId: string;
  scopes: string[];
}

export async function getTokens(): Promise<StoredTokens | null> {
  const got = await chrome.storage.local.get(TOKEN_KEY);
  return (got[TOKEN_KEY] as StoredTokens | undefined) ?? null;
}

export async function setTokens(tokens: StoredTokens): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: tokens });
}

export async function clearTokens(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_KEY);
}

export async function getDraft(draftId: string): Promise<CaptureDraft | null> {
  const key = DRAFT_PREFIX + draftId;
  const got = await chrome.storage.session.get(key);
  return (got[key] as CaptureDraft | undefined) ?? null;
}

export async function saveDraft(draft: CaptureDraft): Promise<void> {
  await chrome.storage.session.set({ [DRAFT_PREFIX + draft.draftId]: draft });
}

export async function removeDraft(draftId: string): Promise<void> {
  await chrome.storage.session.remove(DRAFT_PREFIX + draftId);
}
