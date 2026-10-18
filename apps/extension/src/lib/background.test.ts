import { beforeEach, describe, expect, it, vi } from "vitest";
import { MENU_ID, registerBackground } from "./background";
import { installChromeMock, type ChromeMock } from "../test/chrome-mock";

let chromeMock: ChromeMock;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  chromeMock = installChromeMock();
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  registerBackground();
});

const tab = { title: "Intern onboarding", url: "https://docs.example.com/onboarding#section" } as chrome.tabs.Tab;

describe("context menu", () => {
  it("is registered for text selections only", async () => {
    await Promise.all(chromeMock.runtime.onInstalled.emit({}));
    expect(chromeMock.contextMenus.removeAll).toHaveBeenCalled();
    expect(chromeMock.contextMenus.create).toHaveBeenCalledTimes(1);
    expect(chromeMock.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: MENU_ID, title: "Save selection to Ritme", contexts: ["selection"] }),
    );
  });

  it("opens the preview with a local draft when text is selected, without sending anything", async () => {
    chromeMock.contextMenus.onClicked.emit(
      { menuItemId: MENU_ID, selectionText: "Submit the report by Friday", pageUrl: tab.url } as chrome.contextMenus.OnClickData,
      tab,
    );
    await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1));

    const draftKeys = [...chromeMock.storage.session.data.keys()];
    expect(draftKeys).toHaveLength(1);
    const draft = chromeMock.storage.session.data.get(draftKeys[0]!) as Record<string, unknown>;
    expect(draft).toMatchObject({
      text: "Submit the report by Friday",
      sourceType: "browser_selection",
      pageTitle: "Intern onboarding",
      url: "https://docs.example.com/onboarding", // fragment stripped
      domain: "docs.example.com",
    });
    expect(chromeMock.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringMatching(/^chrome-extension:\/\/testextensionid\/capture\.html\?draft=/) }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "   \n"])("does nothing when there is no selection (%j)", async (selectionText) => {
    chromeMock.contextMenus.onClicked.emit({ menuItemId: MENU_ID, selectionText } as chrome.contextMenus.OnClickData, tab);
    await new Promise((r) => setTimeout(r, 10));
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(chromeMock.storage.session.data.size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores clicks on other menu items", async () => {
    chromeMock.contextMenus.onClicked.emit({ menuItemId: "other", selectionText: "hello" } as chrome.contextMenus.OnClickData, tab);
    await new Promise((r) => setTimeout(r, 10));
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });
});
