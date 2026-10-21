import { adapterForUrl, conversationUrlPatterns } from "../extract/registry";
import { handleExternalMessage } from "./auth";
import { captureTab, openOutcome } from "./capture-tab";
import { captureUrl, createDraft } from "./capture";
import { saveDraft } from "./storage";

export const MENU_SELECTION = "ritme-save-selection";
export const MENU_CONVERSATION = "ritme-save-conversation";
export const COMMAND_CAPTURE = "capture-conversation";

/** Plain selected text: opens the preview. Nothing is sent to the server here. */
async function saveSelectionDraft(text: string, tab?: chrome.tabs.Tab, pageUrl?: string): Promise<void> {
  const draft = createDraft({
    text,
    sourceType: "browser_selection",
    pageTitle: tab?.title ?? null,
    url: pageUrl ?? tab?.url ?? null,
  });
  await saveDraft(draft);
  await chrome.tabs.create({ url: captureUrl(draft.draftId), active: true });
}

export async function handleMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  if (info.menuItemId === MENU_SELECTION) {
    const text = info.selectionText;
    // Defence in depth: the menu is registered for "selection" only, but never create an empty draft.
    if (!text || !text.trim()) return;
    const url = info.pageUrl ?? tab?.url;
    if (tab && adapterForUrl(url)) {
      // Supported app: read the selection once more to attribute it (sender, chat title). Falls back to plain text.
      const outcome = await captureTab(tab, { selectionText: text });
      if (outcome.ok) return openOutcome(outcome);
    }
    return saveSelectionDraft(text, tab, info.pageUrl);
  }

  if (info.menuItemId === MENU_CONVERSATION) {
    if (!tab) return;
    return openOutcome(await captureTab(tab, { selectionText: info.selectionText }));
  }
}

export async function handleCommand(command: string): Promise<void> {
  if (command !== COMMAND_CAPTURE) return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return;
  await openOutcome(await captureTab(tab));
}

export function registerBackground(): void {
  chrome.runtime.onInstalled.addListener(async () => {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: MENU_SELECTION,
      title: "Save selection to Ritme",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: MENU_CONVERSATION,
      title: "Save this conversation to Ritme",
      contexts: ["page"],
      // Only offered on the supported web apps. This is a menu filter, not a host permission.
      documentUrlPatterns: conversationUrlPatterns(),
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    void handleMenuClick(info, tab);
  });

  chrome.commands.onCommand.addListener((command) => {
    void handleCommand(command);
  });

  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    handleExternalMessage(message, sender).then(sendResponse, () => sendResponse({ ok: false, error: "internal" }));
    return true; // async response
  });
}
