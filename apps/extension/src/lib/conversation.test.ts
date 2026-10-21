import { describe, expect, it } from "vitest";
import { buildPayload, createDraft, updateConversation } from "./capture";
import { buildTranscript, fitToLimit, senderLabels, type DraftConversation } from "./conversation";

const msgs = [
  { id: "1", sender: "Dewi", time: "10:15", text: "Can you send the report?" },
  { id: "2", sender: "You", time: "10:20", text: "Yes, today." },
  { id: "3", sender: "Budi", time: null, text: "Me too please" },
  { id: "4", sender: "Dewi", time: "10:30", text: "Thanks" },
];

function conv(over: Partial<DraftConversation> = {}): DraftConversation {
  return {
    app: "WhatsApp",
    chatTitle: "Project team",
    messages: msgs.map((m) => ({ ...m, included: true })),
    hideNames: false,
    capped: false,
    autoExcluded: 0,
    textEdited: false,
    ...over,
  };
}

describe("transcript", () => {
  it("starts with 'Chat: <title> (<App>)' then '[time] Sender: text' lines", () => {
    expect(buildTranscript(conv())).toBe(
      [
        "Chat: Project team (WhatsApp)",
        "[10:15] Dewi: Can you send the report?",
        "[10:20] You: Yes, today.",
        "Budi: Me too please",
        "[10:30] Dewi: Thanks",
      ].join("\n"),
    );
  });

  it("leaves out unchecked messages", () => {
    const c = conv();
    c.messages[1]!.included = false;
    expect(buildTranscript(c)).not.toContain("Yes, today.");
  });

  it("hides other people's names consistently (A, B...), keeps You, and withholds the chat title", () => {
    const t = buildTranscript(conv({ hideNames: true }));
    expect(t).toBe(
      ["Chat (WhatsApp)", "[10:15] Person A: Can you send the report?", "[10:20] You: Yes, today.", "Person B: Me too please", "[10:30] Person A: Thanks"].join("\n"),
    );
    expect(t).not.toMatch(/Dewi|Budi|Project team/);
  });

  it("keeps labels stable when an earlier message is unchecked", () => {
    const c = conv({ hideNames: true });
    c.messages[0]!.included = false;
    expect(senderLabels(c.messages).get("Dewi")).toBe("Person A");
    expect(buildTranscript(c)).toContain("Person A: Thanks");
  });
});

describe("fitToLimit", () => {
  it("keeps the newest messages that fit and unchecks the older ones, never cutting a message", () => {
    const full = buildTranscript(conv());
    const fitted = fitToLimit(conv(), full.length - 1);
    expect(fitted.autoExcluded).toBe(1);
    expect(fitted.messages.map((m) => m.included)).toEqual([false, true, true, true]);
    expect(buildTranscript(fitted).length).toBeLessThanOrEqual(full.length - 1);
  });

  it("includes everything when it fits", () => {
    const fitted = fitToLimit(conv(), 10_000);
    expect(fitted.autoExcluded).toBe(0);
    expect(fitted.messages.every((m) => m.included)).toBe(true);
  });

  it("keeps a single over-long message included so the user must shorten it (no silent cut)", () => {
    const only = conv({ messages: [{ id: "1", sender: "A", time: null, text: "x".repeat(500), included: true }] });
    const fitted = fitToLimit(only, 100);
    expect(fitted.messages[0]?.included).toBe(true);
    expect(buildTranscript(fitted).length).toBeGreaterThan(100);
  });
});

describe("conversation drafts", () => {
  const draft = () =>
    createDraft({
      text: "",
      sourceType: "browser_selection",
      pageTitle: "Project team",
      url: "https://web.whatsapp.com/",
      conversation: { app: "WhatsApp", chatTitle: "Project team", messages: msgs, capped: false },
    });

  it("builds the transcript as the draft text and attaches app/title/domain attribution", () => {
    const d = draft();
    expect(d.text.split("\n")[0]).toBe("Chat: Project team (WhatsApp)");
    expect(buildPayload(d)).toMatchObject({
      sourceType: "browser_selection",
      sourceDomain: "web.whatsapp.com",
      sourcePageTitle: "Project team",
      contentText: d.text,
    });
  });

  it("unchecking a message changes the payload", () => {
    const d = draft();
    const next = updateConversation(d, { messages: d.conversation!.messages.map((m) => (m.id === "2" ? { ...m, included: false } : m)) });
    expect(buildPayload(next).contentText).not.toContain("Yes, today.");
    expect(buildPayload(d).contentText).toContain("Yes, today.");
  });

  it("hiding names changes the payload and withholds the title", () => {
    const next = updateConversation(draft(), { hideNames: true });
    const payload = buildPayload(next);
    expect(payload.contentText).not.toMatch(/Dewi|Budi/);
    expect(payload.contentText).toContain("Person A");
    expect(payload.sourcePageTitle).toBeNull();
  });

  it("does not overwrite hand-edited text when the selection changes", () => {
    const d = { ...draft(), text: "my own words" };
    const edited = { ...d, conversation: { ...d.conversation!, textEdited: true } };
    expect(updateConversation(edited, { hideNames: true }).text).toBe("my own words");
  });
});
