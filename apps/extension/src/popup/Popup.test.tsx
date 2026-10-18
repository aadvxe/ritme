import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeMock, type ChromeMock } from "../test/chrome-mock";
import { connect } from "../test/helpers";
import { Popup } from "./Popup";

let chromeMock: ChromeMock;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  chromeMock = installChromeMock();
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  vi.spyOn(window, "close").mockImplementation(() => undefined);
});

describe("popup", () => {
  it("offers Connect to Ritme when not connected", async () => {
    const user = userEvent.setup();
    render(<Popup />);
    const button = await screen.findByRole("button", { name: /connect to ritme/i });
    expect(screen.getByText(/not connected/i, { selector: "span" })).toBeInTheDocument();
    await user.click(button);
    expect(chromeMock.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining("/connect?ext=testextensionid") }),
    );
  });

  it("makes a local draft from pasted text and opens the preview, sending nothing", async () => {
    connect(chromeMock);
    const user = userEvent.setup();
    render(<Popup />);
    await screen.findByText(/connected/i, { selector: "span" });
    const review = screen.getByRole("button", { name: /review before saving/i });
    expect(review).toBeDisabled();
    await user.type(screen.getByLabelText(/^text$/i), "Pasted request from my manager");
    await user.click(review);

    await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1));
    const [draft] = [...chromeMock.storage.session.data.values()] as Array<Record<string, unknown>>;
    expect(draft).toMatchObject({ text: "Pasted request from my manager", sourceType: "manual_text", url: null, pageTitle: null });
    expect(chromeMock.tabs.query).not.toHaveBeenCalled(); // never reads the tab unless asked
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("attaches the active tab's title and address only when the user ticks the box", async () => {
    connect(chromeMock);
    chromeMock.tabs.query.mockResolvedValue([{ title: "Policy page", url: "https://intranet.example.com/policy?id=3#top" }]);
    const user = userEvent.setup();
    render(<Popup />);
    await user.type(await screen.findByLabelText(/^text$/i), "Remote work policy");
    await user.click(screen.getByRole("checkbox", { name: /attach this tab/i }));
    await user.click(screen.getByRole("button", { name: /review before saving/i }));
    await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalled());
    const [draft] = [...chromeMock.storage.session.data.values()] as Array<Record<string, unknown>>;
    expect(draft).toMatchObject({ pageTitle: "Policy page", url: "https://intranet.example.com/policy?id=3", domain: "intranet.example.com" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("can disconnect this browser", async () => {
    connect(chromeMock);
    const user = userEvent.setup();
    render(<Popup />);
    await user.click(await screen.findByRole("button", { name: /disconnect this browser/i }));
    expect(await screen.findByRole("button", { name: /connect to ritme/i })).toBeInTheDocument();
  });
});
