import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMMAND_CAPTURE, MENU_CONVERSATION, MENU_SELECTION, registerBackground } from "./background";
import { installChromeMock, type ChromeMock } from "../test/chrome-mock";
import type { StoredDraft } from "../test/helpers";

let chromeMock: ChromeMock;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  chromeMock = installChromeMock();
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  registerBackground();
});

const tab = { id: 5, title: "Intern onboarding", url: "https://docs.example.com/onboarding#section" } as chrome.tabs.Tab;
const slackTab = { id: 6, title: "Slack", url: "https://app.slack.com/client/T/C" } as chrome.tabs.Tab;

const slackResult = {
  ok: true,
  mode: "conversation",
  appId: "slack",
  app: "Slack",
  chatTitle: "launch-plan",
  domain: "app.slack.com",
  pageUrl: "https://app.slack.com/client/T/C",
  messages: [{ id: "1", sender: "Fajar", time: "10:15", text: "Due Thursday" }],
  truncated: false,
};

function stubInjection(result: unknown) {
  chromeMock.scripting.executeScript.mockImplementation(async (inj: unknown) =>
    "files" in (inj as object) ? [] : [{ result }],
  );
}

const flush = () => new Promise((r) => setTimeout(r, 10));
const onlyDraft = () => [...chromeMock.storage.session.data.values()][0] as StoredDraft;

describe("context menus", () => {
  it("registers selection capture for selections and conversation capture only on the supported apps", async () => {
    await Promise.all(chromeMock.runtime.onInstalled.emit({}));
    expect(chromeMock.contextMenus.removeAll).toHaveBeenCalled();
    expect(chromeMock.contextMenus.create).toHaveBeenCalledTimes(2);
    expect(chromeMock.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: MENU_SELECTION, title: "Save selection to Ritme", contexts: ["selection"] }),
    );
    const conversation = chromeMock.contextMenus.create.mock.calls.find(([p]) => p.id === MENU_CONVERSATION)?.[0];
    expect(conversation).toMatchObject({ title: "Save this conversation to Ritme", contexts: ["page"] });
    expect(conversation?.documentUrlPatterns).toEqual(
      expect.arrayContaining(["https://web.whatsapp.com/*", "https://mail.google.com/*", "https://app.slack.com/*"]),
    );
    expect(conversation?.documentUrlPatterns).not.toContain("<all_urls>");
  });

  it("opens the preview with a local draft when text is selected, without sending anything or injecting", async () => {
    chromeMock.contextMenus.onClicked.emit(
      { menuItemId: MENU_SELECTION, selectionText: "Submit the report by Friday", pageUrl: tab.url } as chrome.contextMenus.OnClickData,
      tab,
    );
    await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1));
    expect(onlyDraft()).toMatchObject({
      text: "Submit the report by Friday",
      sourceType: "browser_selection",
      pageTitle: "Intern onboarding",
      url: "https://docs.example.com/onboarding", // fragment stripped
      domain: "docs.example.com",
      conversation: null,
    });
    expect(chromeMock.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringMatching(/^chrome-extension:\/\/testextensionid\/capture\.html\?draft=/) }),
    );
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "   \n"])("does nothing when there is no selection (%j)", async (selectionText) => {
    chromeMock.contextMenus.onClicked.emit({ menuItemId: MENU_SELECTION, selectionText } as chrome.contextMenus.OnClickData, tab);
    await flush();
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(chromeMock.storage.session.data.size).toBe(0);
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores clicks on other menu items", async () => {
    chromeMock.contextMenus.onClicked.emit({ menuItemId: "other", selectionText: "hello" } as chrome.contextMenus.OnClickData, tab);
    await flush();
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });

  it("attributes a selection on a supported app (sender, chat title) via a one-off extraction", async () => {
    stubInjection({
      ...slackResult,
      mode: "selection",
      messages: [{ id: "1", sender: "Fajar", time: "10:15", text: "Due Thursday" }],
    });
    chromeMock.contextMenus.onClicked.emit(
      { menuItemId: MENU_SELECTION, selectionText: "Due Thursday", pageUrl: slackTab.url } as chrome.contextMenus.OnClickData,
      slackTab,
    );
    await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1));
    expect(onlyDraft().conversation?.app).toBe("Slack");
    expect(chromeMock.scripting.executeScript).toHaveBeenCalledTimes(2);
  });

  it("falls back to the plain selection if attribution fails", async () => {
    chromeMock.scripting.executeScript.mockRejectedValue(new Error("no access"));
    chromeMock.contextMenus.onClicked.emit(
      { menuItemId: MENU_SELECTION, selectionText: "Due Thursday", pageUrl: slackTab.url } as chrome.contextMenus.OnClickData,
      slackTab,
    );
    await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1));
    expect(onlyDraft()).toMatchObject({ text: "Due Thursday", conversation: null });
  });
});

describe("conversation capture triggers", () => {
  it("'Save this conversation' reads the tab once and opens the preview", async () => {
    stubInjection(slackResult);
    chromeMock.contextMenus.onClicked.emit({ menuItemId: MENU_CONVERSATION } as chrome.contextMenus.OnClickData, slackTab);
    await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1));
    expect(chromeMock.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining("capture.html?draft=") }));
    expect(onlyDraft().conversation?.messages).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows a plain explanation (not a preview, not a success) when nothing could be read", async () => {
    stubInjection({ ok: false, reason: "no_messages_found" });
    chromeMock.contextMenus.onClicked.emit({ menuItemId: MENU_CONVERSATION } as chrome.contextMenus.OnClickData, slackTab);
    await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1));
    expect(chromeMock.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: "chrome-extension://testextensionid/capture.html?error=no_messages_found" }),
    );
    expect(chromeMock.storage.session.data.size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the keyboard command captures the active tab", async () => {
    chromeMock.tabs.query.mockResolvedValue([slackTab]);
    stubInjection(slackResult);
    chromeMock.commands.onCommand.emit(COMMAND_CAPTURE);
    await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1));
    expect(chromeMock.tabs.query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
    expect(onlyDraft().conversation?.app).toBe("Slack");
  });

  it("ignores other commands", async () => {
    chromeMock.commands.onCommand.emit("something-else");
    await flush();
    expect(chromeMock.tabs.query).not.toHaveBeenCalled();
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("nothing is injected until a trigger fires (no capture on install, navigation or tab changes)", async () => {
    await Promise.all(chromeMock.runtime.onInstalled.emit({}));
    await flush();
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
