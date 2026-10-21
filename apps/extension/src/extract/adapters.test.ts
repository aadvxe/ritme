import { describe, expect, it } from "vitest";
import {
  emptyHtml,
  gmailHtml,
  outlookHtml,
  slackFallbackHtml,
  slackHtml,
  slackManyHtml,
  teamsHtml,
  telegramAHtml,
  telegramKHtml,
  whatsappFallbackHtml,
  whatsappHtml,
} from "../test/fixtures";
import { adapterForHost, adapterForUrl, conversationUrlPatterns } from "./registry";
import { extractFromDocument } from "./run";
import type { ExtractionResult, ExtractionSuccess } from "./types";

const parse = (html: string) => new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, "text/html");

function read(html: string, hostname: string, selection: { text: string; anchor: Node | null } = { text: "", anchor: null }, opts = {}) {
  return extractFromDocument(parse(html), { hostname, href: `https://${hostname}/some/path` }, selection, opts);
}

function ok(r: ExtractionResult): ExtractionSuccess {
  expect(r.ok).toBe(true);
  return r as ExtractionSuccess;
}

const TIME_LOCAL = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

describe("registry", () => {
  it("maps hostnames to apps (exact or sub-domain only)", () => {
    expect(adapterForHost("web.whatsapp.com")?.id).toBe("whatsapp");
    expect(adapterForHost("web.telegram.org")?.id).toBe("telegram");
    expect(adapterForHost("teams.microsoft.com")?.id).toBe("teams");
    expect(adapterForHost("teams.live.com")?.id).toBe("teams");
    expect(adapterForHost("app.slack.com")?.id).toBe("slack");
    expect(adapterForHost("mail.google.com")?.id).toBe("gmail");
    expect(adapterForHost("outlook.office.com")?.id).toBe("outlook");
    expect(adapterForHost("outlook.live.com")?.id).toBe("outlook");
    expect(adapterForHost("evilweb.whatsapp.com.attacker.example")).toBeNull();
    expect(adapterForHost("notmail.google.com.example.org")).toBeNull();
    expect(adapterForHost("example.com")).toBeNull();
  });

  it("only recognises https URLs", () => {
    expect(adapterForUrl("https://mail.google.com/mail/u/0/#inbox")?.id).toBe("gmail");
    expect(adapterForUrl("http://mail.google.com/")).toBeNull();
    expect(adapterForUrl("chrome://extensions")).toBeNull();
    expect(adapterForUrl(undefined)).toBeNull();
  });

  it("builds documentUrlPatterns for the supported apps only", () => {
    const patterns = conversationUrlPatterns();
    expect(patterns).toContain("https://web.whatsapp.com/*");
    expect(patterns).toContain("https://app.slack.com/*");
    expect(patterns.every((p) => p.startsWith("https://") && p.endsWith("/*"))).toBe(true);
    expect(patterns.join()).not.toMatch(/\*:\/\/\*|<all_urls>/);
  });
});

describe("WhatsApp Web", () => {
  it("reads sender, time and text of the rendered messages", () => {
    const r = ok(read(whatsappHtml, "web.whatsapp.com"));
    expect(r.app).toBe("WhatsApp");
    expect(r.mode).toBe("conversation");
    expect(r.chatTitle).toBe("Project team");
    expect(r.messages.map((m) => [m.sender, m.time, m.text])).toEqual([
      ["Dewi Anggraini", "10:15, 18/10/2026", "Can you send the report by Friday? 🙂"],
      ["You", "10:20, 18/10/2026", "Sure, I will do it."],
      ["Budi Santoso", "10:30, 18/10/2026", "Noted, thanks."], // media-only row skipped, quoted text ignored
    ]);
    expect(r.messages[0]?.id).toBe("false_1@g.us_A");
    expect(r.truncated).toBe(false);
  });

  it("falls back to the data-id strategy when data-pre-plain-text is gone", () => {
    const r = ok(read(whatsappFallbackHtml, "web.whatsapp.com"));
    expect(r.messages.map((m) => [m.sender, m.text])).toEqual([
      [null, "First fallback message"],
      ["You", "My reply"],
    ]);
  });

  it("attributes a selection to the message that contains it", () => {
    const doc = parse(whatsappHtml);
    const node = doc.querySelectorAll(".selectable-text")[1]!.firstChild!;
    const r = ok(
      extractFromDocument(doc, { hostname: "web.whatsapp.com", href: "https://web.whatsapp.com/" }, { text: "I will do it", anchor: node }),
    );
    expect(r.mode).toBe("selection");
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]).toMatchObject({ sender: "You", text: "I will do it", time: "10:20, 18/10/2026" });
    expect(r.chatTitle).toBe("Project team");
  });

  it("leaves the sender empty when a selection spans several messages", () => {
    const doc = parse(whatsappHtml);
    const r = ok(
      extractFromDocument(doc, { hostname: "web.whatsapp.com", href: "https://web.whatsapp.com/" }, { text: "two messages", anchor: doc.querySelector("#main") }),
    );
    expect(r.messages[0]).toMatchObject({ sender: null, text: "two messages" });
  });
});

describe("Telegram Web", () => {
  it("reads Web A bubbles, carrying the sender over consecutive messages", () => {
    const r = ok(read(telegramAHtml, "web.telegram.org"));
    expect(r.app).toBe("Telegram");
    expect(r.chatTitle).toBe("Design chat");
    expect(r.messages.map((m) => [m.sender, m.time, m.text])).toEqual([
      ["Ayu", "09:00", "Hello team"],
      ["Ayu", "09:01", "Also, the deck is ready"],
      ["You", "09:02", "On it"],
    ]);
  });

  it("reads Web K bubbles", () => {
    const r = ok(read(telegramKHtml, "web.telegram.org"));
    expect(r.chatTitle).toBe("Ops room");
    expect(r.messages.map((m) => [m.sender, m.time, m.text])).toEqual([
      ["Citra", "11:00", "Ship it"],
      ["You", "11:01", "Shipping now"],
    ]);
  });
});

describe("Microsoft Teams", () => {
  it("reads author, datetime and body, carrying the author to follow-up messages", () => {
    const r = ok(read(teamsHtml, "teams.microsoft.com"));
    expect(r.app).toBe("Microsoft Teams");
    expect(r.chatTitle).toBe("Sprint planning");
    expect(r.messages).toHaveLength(2);
    expect(r.messages[0]).toMatchObject({ sender: "Eko Prasetyo", text: "Standup moved to 10:00" });
    expect(r.messages[0]?.time).toMatch(TIME_LOCAL);
    expect(r.messages[1]).toMatchObject({ sender: "Eko Prasetyo", text: "Please confirm", time: null });
  });
});

describe("Slack", () => {
  it("reads sender, timestamp (data-ts) and text", () => {
    const r = ok(read(slackHtml, "app.slack.com"));
    expect(r.app).toBe("Slack");
    expect(r.chatTitle).toBe("launch-plan");
    expect(r.messages[0]).toMatchObject({ sender: "Fajar", text: "Release notes are due Thursday" });
    expect(r.messages[0]?.time).toMatch(TIME_LOCAL);
    expect(r.messages[1]).toMatchObject({ sender: "Fajar", text: "And please tag the build" });
  });

  it("falls back to the c-message_kit strategy", () => {
    const r = ok(read(slackFallbackHtml, "app.slack.com"));
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]).toMatchObject({ sender: "Gita", text: "Fallback strategy message" });
  });

  it("reads only the newest 30 rendered messages and says so", () => {
    const r = ok(read(slackManyHtml(45), "app.slack.com"));
    expect(r.messages).toHaveLength(30);
    expect(r.messages[0]?.text).toBe("message number 16");
    expect(r.messages[29]?.text).toBe("message number 45");
    expect(r.truncated).toBe(true);
  });

  it("honours a custom message limit", () => {
    const r = ok(read(slackManyHtml(10), "app.slack.com", undefined, { maxMessages: 4 }));
    expect(r.messages.map((m) => m.text)).toEqual(["message number 7", "message number 8", "message number 9", "message number 10"]);
    expect(r.truncated).toBe(true);
  });
});

describe("Gmail", () => {
  it("reads the subject and expanded messages, leaving out quoted history", () => {
    const r = ok(read(gmailHtml, "mail.google.com"));
    expect(r.app).toBe("Gmail");
    expect(r.chatTitle).toBe("Budget review");
    expect(r.messages).toHaveLength(1); // the collapsed message has no body in the DOM
    expect(r.messages[0]).toMatchObject({
      sender: "Sari <sari@acme.co>",
      time: "Sat, Oct 18, 2026, 10:15 AM",
      text: "Please review the budget.",
    });
  });
});

describe("Outlook on the web", () => {
  it("reads subject, sender, date and body of the open message", () => {
    const r = ok(read(outlookHtml, "outlook.office.com"));
    expect(r.app).toBe("Outlook");
    expect(r.chatTitle).toBe("Quarterly plan");
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]).toMatchObject({ sender: "Tono Wijaya", time: "Sat 10/18/2026 10:15 AM" });
    expect(r.messages[0]?.text).toBe("Please see the attached plan.\nThanks!");
  });
});

describe("failure and generic fallback", () => {
  it.each([
    ["web.whatsapp.com"],
    ["web.telegram.org"],
    ["teams.microsoft.com"],
    ["app.slack.com"],
    ["mail.google.com"],
    ["outlook.office.com"],
  ])("%s with no recognisable messages returns no_messages_found (never a fake success)", (host) => {
    expect(read(emptyHtml, host)).toEqual({ ok: false, reason: "no_messages_found" });
  });

  it("on any other site captures only the selected text, never the page", () => {
    const r = ok(read("<p>secret page body</p>", "intranet.example.com", { text: "just this bit", anchor: null }));
    expect(r.app).toBeNull();
    expect(r.messages).toEqual([{ id: "selection", sender: null, time: null, text: "just this bit" }]);
    expect(JSON.stringify(r)).not.toContain("secret page body");
  });

  it("on any other site with nothing selected returns no_selection", () => {
    expect(read("<p>page</p>", "intranet.example.com")).toEqual({ ok: false, reason: "no_selection" });
  });

  it("uses the browser-provided selection text if the page selection is empty", () => {
    const r = ok(read("<p>page</p>", "intranet.example.com", undefined, { selectionText: "from the menu" }));
    expect(r.messages[0]?.text).toBe("from the menu");
  });
});
