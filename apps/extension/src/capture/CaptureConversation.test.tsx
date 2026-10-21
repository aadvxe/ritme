import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { createDraft } from "../lib/capture";
import { getDraft, saveDraft } from "../lib/storage";
import { installChromeMock, type ChromeMock } from "../test/chrome-mock";
import { captureResponse, connect, jsonResponse, sentBodies, stubFetch } from "../test/helpers";
import { CaptureError } from "./CaptureError";
import { CapturePage } from "./CapturePage";

let chromeMock: ChromeMock;

beforeEach(() => {
  chromeMock = installChromeMock();
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

const messages: Array<{ id: string; sender: string; time: string | null; text: string }> = [
  { id: "1", sender: "Dewi Anggraini", time: "10:15", text: "Can you send the report by Friday?" },
  { id: "2", sender: "You", time: "10:20", text: "Yes, I will send it today." },
  { id: "3", sender: "Budi Santoso", time: "10:30", text: "Please also copy the finance team." },
];

async function open(opts: { messages?: typeof messages; url?: string; chatTitle?: string } = {}) {
  const draft = createDraft({
    text: "",
    sourceType: "browser_selection",
    pageTitle: opts.chatTitle ?? "Project team",
    url: opts.url ?? "https://web.whatsapp.com/",
    conversation: { app: "WhatsApp", chatTitle: opts.chatTitle ?? "Project team", messages: opts.messages ?? messages, capped: false },
  });
  await saveDraft(draft);
  const user = userEvent.setup();
  render(<CapturePage draftId={draft.draftId} />);
  await screen.findByRole("heading", { name: /messages from whatsapp/i });
  return { draft, user };
}

const save = () => screen.getByRole("button", { name: /^save to ritme$/i });
const box = () => screen.getByLabelText(/text to save/i) as HTMLTextAreaElement;

describe("conversation preview", () => {
  it("lists every message with a checkbox (all included), shows the transcript and the other-people notice", async () => {
    await open();
    expect(screen.getByText(/this includes messages written by other people/i)).toBeInTheDocument();
    expect(screen.getByText(/send only what you need/i)).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox").filter((c) => !/hide other people/i.test(c.parentElement?.textContent ?? ""));
    expect(boxes).toHaveLength(3);
    boxes.forEach((b) => expect(b).toBeChecked());
    expect(screen.getByText("3 of 3 messages included")).toBeInTheDocument();
    expect(box().value.split("\n")[0]).toBe("Chat: Project team (WhatsApp)");
    expect(box().value).toContain("[10:15] Dewi Anggraini: Can you send the report by Friday?");
    expect(screen.getByRole("checkbox", { name: /hide other people's names/i })).not.toBeChecked();
    // title / address / website remain individually removable
    expect(screen.getByRole("button", { name: /remove page title/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove page address/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove website/i })).toBeInTheDocument();
  });

  it("only the checked messages are sent", async () => {
    connect(chromeMock);
    const fetchMock = stubFetch(() => jsonResponse(captureResponse(), 201));
    const { user } = await open();
    await user.click(screen.getByRole("checkbox", { name: /yes, i will send it today/i }));
    expect(screen.getByText("2 of 3 messages included")).toBeInTheDocument();
    expect(box().value).not.toContain("Yes, I will send it today.");
    await user.click(save());
    await screen.findByText(/saved to ritme/i);
    const [body] = sentBodies(fetchMock);
    expect(body?.contentText).toContain("Please also copy the finance team.");
    expect(body?.contentText).not.toContain("Yes, I will send it today.");
    expect(body).toMatchObject({ sourceType: "browser_selection", sourceDomain: "web.whatsapp.com", sourcePageTitle: "Project team" });
  });

  it("cannot save with every message unchecked", async () => {
    connect(chromeMock);
    const fetchMock = stubFetch(() => jsonResponse(captureResponse(), 201));
    const { user } = await open();
    for (const m of messages) await user.click(screen.getByRole("checkbox", { name: new RegExp(m.text.slice(0, 14), "i") }));
    expect(save()).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("'Hide other people's names' sends Person A/B instead of names (and withholds the chat title)", async () => {
    connect(chromeMock);
    const fetchMock = stubFetch(() => jsonResponse(captureResponse(), 201));
    const { user } = await open();
    await user.click(screen.getByRole("checkbox", { name: /hide other people's names/i }));
    expect(box().value).toContain("Person A: Can you send the report by Friday?");
    expect(box().value).toContain("You: Yes, I will send it today.");
    expect(box().value).toContain("Person B: Please also copy the finance team.");
    expect(box().value).not.toMatch(/Dewi|Budi|Project team/);
    expect(screen.getByText(/withheld while names are hidden/i)).toBeInTheDocument();
    await user.click(save());
    await screen.findByText(/saved to ritme/i);
    const [body] = sentBodies(fetchMock);
    expect(JSON.stringify(body)).not.toMatch(/Dewi|Budi/);
    expect(body).toHaveProperty("sourcePageTitle", null);
  });

  it("removing the URL still sends sourceUrl: null", async () => {
    connect(chromeMock);
    const fetchMock = stubFetch(() => jsonResponse(captureResponse(), 201));
    const { user } = await open({ url: "https://app.slack.com/client/T1/C1" });
    await user.click(screen.getByRole("button", { name: /remove page address/i }));
    await user.click(save());
    await screen.findByText(/saved to ritme/i);
    expect(sentBodies(fetchMock)[0]).toHaveProperty("sourceUrl", null);
  });

  it("hand edits are what is sent, and the checkboxes lock until the user chooses to rebuild", async () => {
    connect(chromeMock);
    const fetchMock = stubFetch(() => jsonResponse(captureResponse(), 201));
    const { user } = await open();
    await user.type(box(), "\nMy own note line");
    expect(screen.getByText(/you edited the text by hand/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /yes, i will send it today/i })).toBeDisabled();
    await user.click(save());
    await screen.findByText(/saved to ritme/i);
    expect(sentBodies(fetchMock)[0]?.contentText).toMatch(/My own note line$/);
  });

  it("rebuilding replaces hand edits with the checked messages", async () => {
    await open();
    const { user } = { user: userEvent.setup() };
    await user.type(box(), " extra");
    await user.click(screen.getByRole("button", { name: /rebuild text from the checked messages/i }));
    expect(box().value).not.toContain("extra");
    expect(screen.getByRole("checkbox", { name: /yes, i will send it today/i })).toBeEnabled();
  });

  it("says when only the latest messages fit, and nothing is cut", async () => {
    const long = Array.from({ length: 4 }, (_, i) => ({ id: String(i), sender: "Dewi", time: null, text: `m${i} ` + "x".repeat(7000) }));
    connect(chromeMock);
    await open({ messages: long });
    expect(screen.getByText(/only the latest 2 messages fit/i)).toBeInTheDocument();
    expect(screen.getByText("2 of 4 messages included")).toBeInTheDocument();
    expect(box().value).toContain("m3 ");
    expect(box().value).not.toContain("m0 ");
    expect(save()).toBeEnabled();
  });

  it("cancel sends nothing and discards the draft", async () => {
    connect(chromeMock);
    const fetchMock = stubFetch(() => jsonResponse(captureResponse(), 201));
    const { draft, user } = await open();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(await screen.findByText(/nothing was sent to ritme/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getDraft(draft.draftId)).toBeNull();
  });

  it("keeps the sensitive-domain confirmation for conversations on sensitive sites", async () => {
    connect(chromeMock);
    const { user } = await open({ url: "https://portal.myhospital.example/chat" });
    expect(save()).toBeDisabled();
    await user.click(within(screen.getByText(/health or medical/i).closest("[role=status]") as HTMLElement).getByRole("checkbox"));
    expect(save()).toBeEnabled();
  });
});

describe("capture error page", () => {
  it.each([
    ["no_messages_found", /ritme couldn't read this chat\. select the text you want and try again/i],
    ["no_selection", /select the text you want to save on the page/i],
    ["injection_failed", /ritme couldn't read this page/i],
    ["something_unexpected", /ritme couldn't read this page/i],
  ])("%s explains plainly and never claims anything was saved", (reason, message) => {
    render(<CaptureError reason={reason} />);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("alert")).toHaveTextContent(/nothing was sent to ritme/i);
    expect(screen.queryByText(/saved to ritme/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });
});
