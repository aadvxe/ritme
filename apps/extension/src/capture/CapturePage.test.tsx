import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WEB_URL } from "../config";
import { createDraft, type CaptureDraft } from "../lib/capture";
import { getDraft, saveDraft } from "../lib/storage";
import { installChromeMock, type ChromeMock } from "../test/chrome-mock";
import { captureResponse, connect, errorResponse, jsonResponse, sentBodies, stubFetch, validTokens } from "../test/helpers";
import { CapturePage } from "./CapturePage";

let chromeMock: ChromeMock;

beforeEach(() => {
  chromeMock = installChromeMock();
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

async function open(overrides: Partial<CaptureDraft> = {}) {
  const draft = { ...createDraft({
    text: "Original selection",
    sourceType: "browser_selection",
    pageTitle: "Onboarding doc",
    url: "https://docs.example.com/onboarding",
  }), ...overrides };
  await saveDraft(draft);
  const user = userEvent.setup();
  render(<CapturePage draftId={draft.draftId} />);
  await screen.findByRole("heading", { name: /review before saving/i });
  return { draft, user };
}

const save = () => screen.getByRole("button", { name: /^save to ritme$/i });

describe("preview", () => {
  it("shows the editable text, removable source details, note field and privacy statement", async () => {
    await open();
    expect(screen.getByLabelText(/text to save/i)).toHaveValue("Original selection");
    expect(screen.getByText("Onboarding doc")).toBeInTheDocument();
    expect(screen.getByText("https://docs.example.com/onboarding")).toBeInTheDocument();
    expect(screen.getByText("docs.example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove page title/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove page address/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove website/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/what do i need to do with this/i)).toBeInTheDocument();
    expect(screen.getByText(/sent to ritme/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("explains a missing draft instead of showing an empty form", async () => {
    render(<CapturePage draftId="nope" />);
    expect(await screen.findByText(/this draft isn't here anymore/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save to ritme/i })).not.toBeInTheDocument();
  });
});

describe("cancel", () => {
  it("sends no request, discards the draft and closes the tab", async () => {
    connect(chromeMock);
    const fetchMock = stubFetch(() => jsonResponse(captureResponse(), 201));
    const { draft, user } = await open();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(await screen.findByText(/nothing was sent to ritme/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getDraft(draft.draftId)).toBeNull();
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith(99);
  });
});

describe("what is sent", () => {
  it("sends the edited text, not the original selection, plus the note", async () => {
    connect(chromeMock);
    const fetchMock = stubFetch(() => jsonResponse(captureResponse(), 201));
    const { user } = await open();
    const box = screen.getByLabelText(/text to save/i);
    await user.clear(box);
    await user.type(box, "Edited: send the plan by Friday");
    await user.type(screen.getByLabelText(/what do i need to do with this/i), "Make a plan");
    await user.click(save());
    await screen.findByText(/saved to ritme/i);
    const [body] = sentBodies(fetchMock);
    expect(body).toMatchObject({
      contentText: "Edited: send the plan by Friday",
      userNote: "Make a plan",
      sourceType: "browser_selection",
    });
    expect(JSON.stringify(body)).not.toContain("Original selection");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: "Bearer access-1" });
  });

  it("sends sourceUrl: null once the URL is removed (and likewise for title and domain)", async () => {
    connect(chromeMock);
    const fetchMock = stubFetch(() => jsonResponse(captureResponse(), 201));
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: /remove page address/i }));
    await user.click(screen.getByRole("button", { name: /remove page title/i }));
    await user.click(save());
    await screen.findByText(/saved to ritme/i);
    const [body] = sentBodies(fetchMock);
    expect(body).toHaveProperty("sourceUrl", null);
    expect(body).toHaveProperty("sourcePageTitle", null);
    expect(body).toHaveProperty("sourceDomain", "docs.example.com"); // still included until removed
    expect(JSON.stringify(body)).not.toContain("docs.example.com/onboarding");
  });

  it("lets a removed detail be added back", async () => {
    connect(chromeMock);
    const fetchMock = stubFetch(() => jsonResponse(captureResponse(), 201));
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: /remove page address/i }));
    await user.click(screen.getByRole("button", { name: /add back page address/i }));
    await user.click(save());
    await screen.findByText(/saved to ritme/i);
    expect(sentBodies(fetchMock)[0]).toHaveProperty("sourceUrl", "https://docs.example.com/onboarding");
  });

  it("refuses to save over-limit text (never truncates)", async () => {
    connect(chromeMock);
    const fetchMock = stubFetch(() => jsonResponse(captureResponse(), 201));
    await open({ text: "x".repeat(20001) });
    expect(save()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/shorten it/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("success", () => {
  it("shows saved only after a 2xx, links to the workflow on the web origin, and clears the draft", async () => {
    connect(chromeMock);
    stubFetch(() => jsonResponse(captureResponse({ nextUrl: "/workflows/wf-42" }), 201));
    const { draft, user } = await open();
    expect(screen.queryByText(/saved to ritme/i)).not.toBeInTheDocument();
    await user.click(save());
    expect(await screen.findByText(/saved to ritme/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open workflow/i })).toHaveAttribute("href", `${WEB_URL}/workflows/wf-42`);
    await waitFor(async () => expect(await getDraft(draft.draftId)).toBeNull());
  });

  it("never follows a workflow link that points off the Ritme origin", async () => {
    connect(chromeMock);
    stubFetch(() => jsonResponse(captureResponse({ nextUrl: "https://evil.example/phish" }), 201));
    const { user } = await open();
    await user.click(save());
    const link = await screen.findByRole("link", { name: /open workflow/i });
    expect(link.getAttribute("href")).toBe(WEB_URL);
  });
});

describe("failure keeps the draft and never claims success", () => {
  it("offline: shows a clear state, keeps the draft, offers Retry and Copy", async () => {
    connect(chromeMock);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { draft, user } = await open();
    await user.click(save());
    expect(await screen.findByText(/couldn't reach ritme/i)).toBeInTheDocument();
    expect(screen.queryByText(/saved to ritme/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open workflow/i })).not.toBeInTheDocument();
    expect(await getDraft(draft.draftId)).not.toBeNull();
    expect(screen.getByRole("button", { name: /retry/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /copy text/i })).toBeInTheDocument();
  });

  it("server error: shows not saved, keeps the draft", async () => {
    connect(chromeMock);
    stubFetch(() => errorResponse(500));
    const { draft, user } = await open();
    await user.click(save());
    expect(await screen.findByText(/^not saved$/i)).toBeInTheDocument();
    expect(screen.queryByText(/saved to ritme/i)).not.toBeInTheDocument();
    expect(await getDraft(draft.draftId)).not.toBeNull();
  });

  it("not connected: shows Connect to Ritme, sends nothing, claims nothing", async () => {
    const fetchMock = stubFetch(() => jsonResponse(captureResponse(), 201));
    const { draft, user } = await open();
    expect(screen.queryByRole("button", { name: /^save to ritme$/i })).not.toBeInTheDocument();
    const connectButton = screen.getByRole("button", { name: /connect to ritme/i });
    await user.click(connectButton);
    expect(chromeMock.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining("/connect?ext=testextensionid") }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/saved to ritme/i)).not.toBeInTheDocument();
    expect(await getDraft(draft.draftId)).not.toBeNull();
  });

  it("rejected token: refresh fails, so the user is asked to reconnect and nothing is claimed saved", async () => {
    connect(chromeMock);
    stubFetch(
      () => errorResponse(401, "unauthorized", "Token expired"), // POST /captures
      () => errorResponse(401, "unauthorized", "Refresh revoked"), // refresh
    );
    const { draft, user } = await open();
    await user.click(save());
    expect(await screen.findByText(/not connected to ritme/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect to ritme/i })).toBeInTheDocument();
    expect(screen.queryByText(/saved to ritme/i)).not.toBeInTheDocument();
    expect(await getDraft(draft.draftId)).not.toBeNull();
  });

  it("expired token: refreshes, then saves", async () => {
    connect(chromeMock, validTokens({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
    const fetchMock = stubFetch(
      () =>
        jsonResponse({
          accessToken: "access-2",
          refreshToken: "refresh-2",
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
          deviceId: "dev-1",
          scopes: ["captures:write"],
        }),
      () => jsonResponse(captureResponse(), 201),
    );
    const { user } = await open();
    await user.click(save());
    await screen.findByText(/saved to ritme/i);
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ Authorization: "Bearer access-2" });
  });

  it("a 2xx without a capture is not reported as saved", async () => {
    connect(chromeMock);
    stubFetch(() => jsonResponse({}, 200));
    const { user } = await open();
    await user.click(save());
    expect(await screen.findByText(/couldn't confirm the save/i)).toBeInTheDocument();
    expect(screen.queryByText(/saved to ritme/i)).not.toBeInTheDocument();
  });

  it("Copy text puts the text on the clipboard", async () => {
    connect(chromeMock);
    stubFetch(() => errorResponse(500));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { user } = await open();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.click(save());
    await user.click(await screen.findByRole("button", { name: /copy text/i }));
    expect(writeText).toHaveBeenCalledWith("Original selection");
    expect(await screen.findByText(/copied to your clipboard/i)).toBeInTheDocument();
  });
});

describe("idempotency", () => {
  it("retries with the same idempotency key", async () => {
    connect(chromeMock);
    const fetchMock = stubFetch(() => errorResponse(503), () => errorResponse(503), () => jsonResponse(captureResponse({ created: false }), 200));
    const { user } = await open();
    await user.click(save());
    await user.click(await screen.findByRole("button", { name: /retry/i }));
    await user.click(await screen.findByRole("button", { name: /retry/i }));
    await screen.findByText(/saved to ritme/i);
    const keys = sentBodies(fetchMock).map((b) => b.idempotencyKey);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toEqual(expect.any(String));
  });

  it("uses a new key only if the user changed what would be sent", async () => {
    connect(chromeMock);
    const fetchMock = stubFetch(() => errorResponse(503), () => jsonResponse(captureResponse(), 201));
    const { user } = await open();
    await user.click(save());
    await user.type(await screen.findByLabelText(/text to save/i), " (edited)");
    await user.click(screen.getByRole("button", { name: /retry/i }));
    await screen.findByText(/saved to ritme/i);
    const [first, second] = sentBodies(fetchMock);
    expect(second?.idempotencyKey).not.toBe(first?.idempotencyKey);
    expect(second?.contentText).toBe("Original selection (edited)");
  });

  it("ignores a second click while a save is in flight", async () => {
    connect(chromeMock);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetchMock = stubFetch(async () => {
      await gate;
      return jsonResponse(captureResponse(), 201);
    });
    const { user } = await open();
    await user.click(save());
    const busy = screen.getByRole("button", { name: /save to ritme/i });
    await user.click(busy).catch(() => undefined);
    release();
    await screen.findByText(/saved to ritme/i);
    expect(sentBodies(fetchMock)).toHaveLength(1);
  });
});

describe("sensitive domains", () => {
  it("requires a per-capture confirmation before Save is possible", async () => {
    connect(chromeMock);
    const fetchMock = stubFetch(() => jsonResponse(captureResponse(), 201));
    const { user } = await open({ url: "https://online.mybank.com/statements", domain: "online.mybank.com", pageTitle: "Statements" });
    const warning = screen.getByText(/banking or finance/i).closest("[role=status]") as HTMLElement;
    expect(warning).toBeInTheDocument();
    expect(save()).toBeDisabled();
    await user.click(within(warning).getByRole("checkbox", { name: /i've checked this text/i }));
    expect(save()).toBeEnabled();
    await user.click(save());
    await screen.findByText(/saved to ritme/i);
    expect(sentBodies(fetchMock)).toHaveLength(1);
  });

  it("still warns after the user removes the address and website from the capture", async () => {
    connect(chromeMock);
    const { user } = await open({ url: "https://online.mybank.com/x", domain: "online.mybank.com" });
    await user.click(screen.getByRole("button", { name: /remove page address/i }));
    await user.click(screen.getByRole("button", { name: /remove website/i }));
    expect(save()).toBeDisabled();
  });

  it("does not warn for ordinary pages", async () => {
    connect(chromeMock);
    await open();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });
});
