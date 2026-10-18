import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeEnv, renderApp } from "@/test/utils";

type Cb = (r?: unknown) => void;
const g = globalThis as { chrome?: unknown };
afterEach(() => {
  delete g.chrome;
});

describe("extension connect page (F4)", () => {
  it("shows exactly what is granted and sends nothing before Allow", async () => {
    const env = makeEnv();
    renderApp("/connect?ext=abcdefghijklmnop", env);
    const grants = await screen.findByTestId("grants-list");
    expect(within(grants).getByText(/Save text you choose to Ritme/)).toBeInTheDocument();
    expect(within(grants).getByText(/Nothing else/)).toBeInTheDocument();
    expect(screen.getByText("abcdefghijklmnop")).toBeInTheDocument();
    expect(env.calls.filter((c) => c.path.startsWith("/api/extension"))).toHaveLength(0);
  });

  it("on Allow, creates the device and hands the token to the extension with the documented message", async () => {
    const sendMessage = vi.fn((_id: string, _msg: unknown, cb: Cb) => cb());
    g.chrome = { runtime: { sendMessage } };
    const env = makeEnv();
    renderApp("/connect?ext=abcdefghijklmnop", env);
    await userEvent.type(await screen.findByLabelText(/Name for this device/), "Work laptop");
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(await screen.findByTestId("connect-success")).toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [id, msg] = sendMessage.mock.calls[0]!;
    expect(id).toBe("abcdefghijklmnop");
    expect(msg).toMatchObject({ type: "ritme.connect", payload: { scopes: ["captures:write"] } });
    expect((msg as { payload: { accessToken: string; refreshToken: string } }).payload.accessToken).toBeTruthy();
    expect(env.mock.store.db.devices[0]).toMatchObject({ label: "Work laptop", revokedAt: null });
    // The granted scope is described in words.
    expect(within(screen.getByTestId("connect-success")).getByText(/Save text you choose to Ritme/)).toBeInTheDocument();
  });

  it("'Not now' connects nothing", async () => {
    const env = makeEnv();
    renderApp("/connect?ext=abcdefghijklmnop", env);
    await userEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(await screen.findByText("Nothing was connected.")).toBeInTheDocument();
    expect(env.mock.store.db.devices).toHaveLength(0);
  });

  it("removes the connection again if the extension can't be reached", async () => {
    g.chrome = { runtime: { sendMessage: (_i: string, _m: unknown, cb: Cb) => { (g.chrome as { runtime: { lastError?: unknown } }).runtime.lastError = { message: "Could not establish connection" }; cb(); } } };
    const env = makeEnv();
    renderApp("/connect?ext=abcdefghijklmnop", env);
    await userEvent.click(await screen.findByRole("button", { name: "Allow" }));
    expect(await screen.findByText("The extension did not answer")).toBeInTheDocument();
    await waitFor(() => expect(env.mock.store.db.devices[0]?.revokedAt).toBeTruthy());
  });

  it("explains when the browser can't talk to an extension", async () => {
    const env = makeEnv();
    renderApp("/connect?ext=abcdefghijklmnop", env);
    await userEvent.click(await screen.findByRole("button", { name: "Allow" }));
    expect(await screen.findByText("This browser can't talk to the extension")).toBeInTheDocument();
    await waitFor(() => expect(env.mock.store.db.devices[0]?.revokedAt).toBeTruthy());
  });

  it("asks to be opened from the extension when the id is missing", async () => {
    renderApp("/connect");
    expect(await screen.findByText("This link is missing the extension id")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
  });
});
