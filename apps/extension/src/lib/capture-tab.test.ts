import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureTab, openOutcome } from "./capture-tab";
import type { ExtractionOptions, ExtractionResult } from "../extract/types";
import { installChromeMock, type ChromeMock } from "../test/chrome-mock";
import type { StoredDraft } from "../test/helpers";

let chromeMock: ChromeMock;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  chromeMock = installChromeMock();
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

const success: ExtractionResult = {
  ok: true,
  mode: "conversation",
  appId: "slack",
  app: "Slack",
  chatTitle: "launch-plan",
  domain: "app.slack.com",
  pageUrl: "https://app.slack.com/client/T1/C1",
  messages: [
    { id: "a", sender: "Fajar", time: "10:15", text: "Release notes are due Thursday" },
    { id: "b", sender: "Fajar", time: null, text: "And tag the build" },
  ],
  truncated: false,
};

function stubInjection(result: unknown) {
  chromeMock.scripting.executeScript.mockImplementation(async (inj: unknown) =>
    "files" in (inj as object) ? [] : [{ result }],
  );
}

describe("captureTab", () => {
  it("injects the extractor file once, then calls it in a second self-contained function", async () => {
    stubInjection(success);
    const outcome = await captureTab({ id: 7, title: "Slack", url: "https://app.slack.com/client/T1/C1" });
    expect(outcome.ok).toBe(true);

    const calls = chromeMock.scripting.executeScript.mock.calls.map(([inj]) => inj as Record<string, unknown>);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ target: { tabId: 7 }, files: ["extract.js"] }); // top frame only, no "world" tricks
    expect(calls[1]).toMatchObject({ target: { tabId: 7 }, args: [{}] });
    expect(typeof calls[1]?.func).toBe("function");
    expect(fetchSpy).not.toHaveBeenCalled(); // reading the page sends nothing
  });

  it("stores a local conversation draft (session storage) and nothing else", async () => {
    stubInjection(success);
    const outcome = await captureTab({ id: 7, title: "Slack", url: "https://app.slack.com/client/T1/C1" });
    if (!outcome.ok) throw new Error("expected ok");
    const draft = chromeMock.storage.session.data.get(`ritme.draft.${outcome.draftId}`) as StoredDraft;
    expect(draft.sourceType).toBe("browser_selection");
    expect(draft.domain).toBe("app.slack.com");
    expect(draft.pageTitle).toBe("launch-plan");
    expect(draft.conversation?.messages).toHaveLength(2);
    expect(draft.text).toBe("Chat: launch-plan (Slack)\n[10:15] Fajar: Release notes are due Thursday\nFajar: And tag the build");
    expect(chromeMock.storage.local.data.size).toBe(0);
  });

  it("makes a plain draft for selected text on a site without an adapter", async () => {
    stubInjection({
      ok: true,
      mode: "selection",
      appId: null,
      app: null,
      chatTitle: "Policy",
      domain: "intranet.example.com",
      pageUrl: "https://intranet.example.com/policy",
      messages: [{ id: "selection", sender: null, time: null, text: "Remote days are Tuesday" }],
      truncated: false,
    } satisfies ExtractionResult);
    const outcome = await captureTab({ id: 1, title: "Policy", url: "https://intranet.example.com/policy" });
    if (!outcome.ok) throw new Error("expected ok");
    const draft = chromeMock.storage.session.data.get(`ritme.draft.${outcome.draftId}`) as StoredDraft;
    expect(draft.conversation).toBeNull();
    expect(draft.text).toBe("Remote days are Tuesday");
  });

  it("passes the browser's selection text to the extractor", async () => {
    stubInjection(success);
    await captureTab({ id: 7 }, { selectionText: "just this" });
    const second = chromeMock.scripting.executeScript.mock.calls[1]?.[0] as { args: ExtractionOptions[] };
    expect(second.args[0]).toEqual({ selectionText: "just this" });
  });

  it("reports no_messages_found without creating a draft", async () => {
    stubInjection({ ok: false, reason: "no_messages_found" });
    expect(await captureTab({ id: 7 })).toEqual({ ok: false, reason: "no_messages_found" });
    expect(chromeMock.storage.session.data.size).toBe(0);
  });

  it("reports injection_failed when the browser refuses (restricted page, no access)", async () => {
    chromeMock.scripting.executeScript.mockRejectedValue(new Error("Cannot access contents of the page"));
    expect(await captureTab({ id: 7 })).toEqual({ ok: false, reason: "injection_failed" });
    expect(await captureTab({})).toEqual({ ok: false, reason: "injection_failed" });
  });

  it("reports extractor_missing when nothing comes back", async () => {
    stubInjection(undefined);
    expect(await captureTab({ id: 7 })).toEqual({ ok: false, reason: "extractor_missing" });
  });

  it("the injected function runs the extractor once and removes it from the page", async () => {
    stubInjection(success);
    await captureTab({ id: 7 });
    const { func } = chromeMock.scripting.executeScript.mock.calls[1]?.[0] as { func: (o: unknown) => unknown };
    const g = globalThis as unknown as { __ritmeExtract?: unknown };
    g.__ritmeExtract = vi.fn(() => ({ ok: true, from: "extractor" }));
    expect(func({ maxMessages: 5 })).toEqual({ ok: true, from: "extractor" });
    expect(g.__ritmeExtract).toBeUndefined(); // nothing stays registered in the page
    expect(func({})).toEqual({ ok: false, reason: "extractor_missing" });
  });
});

describe("openOutcome", () => {
  it("opens the preview for a draft, or the explanation page for a failure", async () => {
    await openOutcome({ ok: true, draftId: "abc" });
    await openOutcome({ ok: false, reason: "no_messages_found" });
    expect(chromeMock.tabs.create).toHaveBeenNthCalledWith(1, { url: "chrome-extension://testextensionid/capture.html?draft=abc", active: true });
    expect(chromeMock.tabs.create).toHaveBeenNthCalledWith(2, {
      url: "chrome-extension://testextensionid/capture.html?error=no_messages_found",
      active: true,
    });
  });
});
