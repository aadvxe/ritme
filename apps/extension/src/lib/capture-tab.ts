import type { ExtractionOptions, ExtractionResult, ExtractionSuccess, FailReason } from "../extract/types";
import { captureUrl, createDraft, type CaptureDraft } from "./capture";
import { saveDraft } from "./storage";

export type CaptureOutcome = { ok: true; draftId: string } | { ok: false; reason: FailReason };

export const EXTRACT_FILE = "extract.js";

/** Plain-language message for every way a capture can fail to start. Never implies anything was saved. */
export const FAIL_MESSAGES: Record<FailReason, string> = {
  no_messages_found: "Ritme couldn't read this chat. Select the text you want and try again.",
  no_selection: "Select the text you want to save on the page, then use the Ritme button or right-click.",
  injection_failed:
    "Ritme couldn't read this page. The browser may not allow it here. Select the text you want and try again.",
  extractor_missing: "Ritme couldn't read this page. Select the text you want and try again.",
};

export function errorPageUrl(reason: FailReason): string {
  return chrome.runtime.getURL(`capture.html?error=${encodeURIComponent(reason)}`);
}

export function draftFromExtraction(result: ExtractionSuccess, tab: { title?: string; url?: string }): CaptureDraft {
  const url = result.pageUrl || tab.url || null;
  if (result.appId === null || result.app === null) {
    // Selected text on a site without an adapter: just the selection.
    return createDraft({
      text: result.messages[0]?.text ?? "",
      sourceType: "browser_selection",
      pageTitle: result.chatTitle ?? tab.title ?? null,
      url,
    });
  }
  return createDraft({
    text: "",
    sourceType: "browser_selection",
    pageTitle: result.chatTitle ?? tab.title ?? null,
    url,
    conversation: { app: result.app, chatTitle: result.chatTitle, messages: result.messages, capped: result.truncated },
  });
}

/**
 * Runs the extractor in the tab ONCE (the user just triggered this, which grants activeTab), then
 * removes it. The extractor is injected as a file into the extension's isolated world and called by a
 * second self-contained function; nothing stays running in the page.
 */
export async function captureTab(
  tab: { id?: number; title?: string; url?: string },
  opts: ExtractionOptions = {},
): Promise<CaptureOutcome> {
  if (tab.id === undefined) return { ok: false, reason: "injection_failed" };

  let result: ExtractionResult | undefined;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [EXTRACT_FILE] });
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [opts],
      func: (options: ExtractionOptions) => {
        const g = globalThis as unknown as { __ritmeExtract?: (o?: ExtractionOptions) => unknown };
        const run = g.__ritmeExtract;
        delete g.__ritmeExtract;
        return run ? run(options) : { ok: false, reason: "extractor_missing" };
      },
    });
    result = injection?.result as ExtractionResult | undefined;
  } catch {
    return { ok: false, reason: "injection_failed" };
  }

  if (!result || typeof result !== "object" || typeof result.ok !== "boolean") {
    return { ok: false, reason: "extractor_missing" };
  }
  if (!result.ok) return { ok: false, reason: result.reason };

  const draft = draftFromExtraction(result, tab);
  await saveDraft(draft);
  return { ok: true, draftId: draft.draftId };
}

/** Opens the preview for a successful capture, or a plain explanation page when nothing could be read. */
export async function openOutcome(outcome: CaptureOutcome): Promise<void> {
  await chrome.tabs.create({
    url: outcome.ok ? captureUrl(outcome.draftId) : errorPageUrl(outcome.reason),
    active: true,
  });
}
