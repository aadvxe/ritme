import { handleExternalMessage } from "./auth";
import { captureUrl, createDraft } from "./capture";
import { saveDraft } from "./storage";

export const MENU_ID = "ritme-save-selection";

/** Opens the preview page for a selection. Nothing is sent to the server here. */
export async function handleMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  if (info.menuItemId !== MENU_ID) return;
  const text = info.selectionText;
  // Defence in depth: the menu is registered for "selection" only, but never create an empty draft.
  if (!text || !text.trim()) return;
  const draft = createDraft({
    text,
    sourceType: "browser_selection",
    pageTitle: tab?.title ?? null,
    url: info.pageUrl ?? tab?.url ?? null,
  });
  await saveDraft(draft);
  await chrome.tabs.create({ url: captureUrl(draft.draftId), active: true });
}

export function registerBackground(): void {
  chrome.runtime.onInstalled.addListener(async () => {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Save selection to Ritme",
      contexts: ["selection"],
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    void handleMenuClick(info, tab);
  });

  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    handleExternalMessage(message, sender).then(sendResponse, () => sendResponse({ ok: false, error: "internal" }));
    return true; // async response
  });
}
