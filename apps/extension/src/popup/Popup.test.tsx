import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeMock, type ChromeMock } from "../test/chrome-mock";
import { connect, type StoredDraft } from "../test/helpers";
import { Popup } from "./Popup";

let chromeMock: ChromeMock;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  chromeMock = installChromeMock();
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  vi.spyOn(window, "close").mockImplementation(() => undefined);
});

const whatsappTab = { id: 3, title: "WhatsApp", url: "https://web.whatsapp.com/" };
const otherTab = { id: 4, title: "Policy", url: "https://intranet.example.com/policy" };

const extraction = {
  ok: true,
  mode: "conversation",
  appId: "whatsapp",
  app: "WhatsApp",
  chatTitle: "Project team",
  domain: "web.whatsapp.com",
  pageUrl: "https://web.whatsapp.com/",
  messages: [{ id: "1", sender: "Dewi", time: "10:15", text: "Please send the report" }],
  truncated: false,
};

function stubInjection(result: unknown) {
  chromeMock.scripting.executeScript.mockImplementation(async (inj: unknown) => ("files" in (inj as object) ? [] : [{ result }]));
}

describe("popup", () => {
  it("has no paste box", async () => {
    chromeMock.tabs.query.mockResolvedValue([whatsappTab]);
    render(<Popup />);
    await screen.findByText(/whatsapp detected/i);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("offers Connect to Ritme when not connected", async () => {
    chromeMock.tabs.query.mockResolvedValue([otherTab]);
    const user = userEvent.setup();
    render(<Popup />);
    const button = await screen.findByRole("button", { name: /connect to ritme/i });
    expect(screen.getByText(/not connected/i, { selector: "span" })).toBeInTheDocument();
    await user.click(button);
    expect(chromeMock.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining("/connect?ext=testextensionid") }),
    );
  });

  it("on a supported app shows '<App> detected' and captures the conversation into a local draft, sending nothing", async () => {
    connect(chromeMock);
    chromeMock.tabs.query.mockResolvedValue([whatsappTab]);
    stubInjection(extraction);
    const user = userEvent.setup();
    render(<Popup />);
    expect(await screen.findByText(/whatsapp detected/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /capture this conversation/i }));

    await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1));
    expect(chromeMock.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining("capture.html?draft=") }));
    const [draft] = [...chromeMock.storage.session.data.values()] as Array<StoredDraft>;
    expect(draft?.conversation?.app).toBe("WhatsApp");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.close).toHaveBeenCalled();
  });

  it("on other sites shows the hint and offers to save only the selection", async () => {
    connect(chromeMock);
    chromeMock.tabs.query.mockResolvedValue([otherTab]);
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
    });
    const user = userEvent.setup();
    render(<Popup />);
    expect(await screen.findByText(/select text on the page, then use the ritme button or right-click/i)).toBeInTheDocument();
    expect(screen.queryByText(/detected/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save selected text/i }));
    await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1));
    const [draft] = [...chromeMock.storage.session.data.values()] as Array<StoredDraft>;
    expect(draft).toMatchObject({ text: "Remote days are Tuesday", conversation: null });
  });

  it("explains plainly when the chat could not be read, creating nothing", async () => {
    connect(chromeMock);
    chromeMock.tabs.query.mockResolvedValue([whatsappTab]);
    stubInjection({ ok: false, reason: "no_messages_found" });
    const user = userEvent.setup();
    render(<Popup />);
    await user.click(await screen.findByRole("button", { name: /capture this conversation/i }));
    expect(await screen.findByText(/ritme couldn't read this chat\. select the text you want and try again/i)).toBeInTheDocument();
    expect(screen.queryByText(/saved to ritme/i)).not.toBeInTheDocument();
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(chromeMock.storage.session.data.size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("can disconnect this browser", async () => {
    connect(chromeMock);
    chromeMock.tabs.query.mockResolvedValue([otherTab]);
    const user = userEvent.setup();
    render(<Popup />);
    await user.click(await screen.findByRole("button", { name: /disconnect this browser/i }));
    expect(await screen.findByRole("button", { name: /connect to ritme/i })).toBeInTheDocument();
  });
});
