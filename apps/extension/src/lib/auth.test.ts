import { beforeEach, describe, expect, it, vi } from "vitest";
import { WEB_ORIGIN, WEB_URL } from "../config";
import { connectUrl, getValidAccessToken, handleExternalMessage, openConnectPage } from "./auth";
import { TOKEN_KEY, getTokens } from "./storage";
import { installChromeMock, type ChromeMock } from "../test/chrome-mock";
import { connect, errorResponse, jsonResponse, stubFetch, validTokens } from "../test/helpers";

let chromeMock: ChromeMock;
beforeEach(() => {
  chromeMock = installChromeMock("abcdefghijklmnopabcdefghijklmnop");
});

const payload = {
  accessToken: "a",
  refreshToken: "r",
  expiresAt: new Date(Date.now() + 900_000).toISOString(),
  deviceId: "d",
  scopes: ["captures:write"],
};

describe("connect flow", () => {
  it("opens {WEB_URL}/connect?ext=<id>", async () => {
    expect(connectUrl()).toBe(`${WEB_URL}/connect?ext=abcdefghijklmnopabcdefghijklmnop`);
    await openConnectPage();
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: connectUrl(), active: true });
  });

  it("stores tokens delivered by the web origin", async () => {
    const reply = await handleExternalMessage({ type: "ritme.connect", payload }, { origin: WEB_ORIGIN });
    expect(reply).toEqual({ ok: true });
    expect(await getTokens()).toMatchObject({ accessToken: "a", refreshToken: "r", deviceId: "d" });
  });

  it("rejects messages from any other origin", async () => {
    const reply = await handleExternalMessage({ type: "ritme.connect", payload }, { origin: "https://evil.example" });
    expect(reply.ok).toBe(false);
    expect(chromeMock.storage.local.data.has(TOKEN_KEY)).toBe(false);
  });

  it.each([
    ["wrong type", { type: "other", payload }],
    ["no payload", { type: "ritme.connect" }],
    ["missing scope", { type: "ritme.connect", payload: { ...payload, scopes: [] } }],
    ["empty token", { type: "ritme.connect", payload: { ...payload, accessToken: "" } }],
    ["bad expiry", { type: "ritme.connect", payload: { ...payload, expiresAt: "nope" } }],
  ])("rejects a malformed message (%s)", async (_name, message) => {
    const reply = await handleExternalMessage(message, { origin: WEB_ORIGIN });
    expect(reply.ok).toBe(false);
    expect(chromeMock.storage.local.data.has(TOKEN_KEY)).toBe(false);
  });
});

describe("access token", () => {
  it("returns null when not connected", async () => {
    expect(await getValidAccessToken()).toBeNull();
  });

  it("returns the stored token while it is fresh, without calling the API", async () => {
    connect(chromeMock);
    const fetchMock = stubFetch(() => jsonResponse({}));
    expect(await getValidAccessToken()).toBe("access-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token through /api/extension/refresh and stores the rotated pair", async () => {
    connect(chromeMock, validTokens({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
    const fetchMock = stubFetch(() => jsonResponse({ ...payload, accessToken: "a2", refreshToken: "r2" }));
    expect(await getValidAccessToken()).toBe("a2");
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/api\/extension\/refresh$/);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ refreshToken: "refresh-1" });
    expect(await getTokens()).toMatchObject({ accessToken: "a2", refreshToken: "r2" });
  });

  it("disconnects when the refresh token is rejected", async () => {
    connect(chromeMock, validTokens({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
    stubFetch(() => errorResponse(401, "unauthorized", "Refresh token revoked"));
    expect(await getValidAccessToken()).toBeNull();
    expect(await getTokens()).toBeNull();
  });

  it("keeps the connection when refresh fails only because the network is down", async () => {
    connect(chromeMock, validTokens({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(getValidAccessToken()).rejects.toMatchObject({ status: 0 });
    expect(await getTokens()).not.toBeNull();
  });
});
