import { describe, expect, it, vi } from "vitest";
import { POPUP_FALLBACK_CODES, localEmailSignIn, signInWithGoogleOrRedirect } from "./sign-in-flows";

const err = (code: string) => Object.assign(new Error(code), { code });

describe("Google sign-in: popup first, redirect when the popup can't work", () => {
  it("uses the popup when it works and never redirects", async () => {
    const popup = vi.fn(async () => undefined);
    const redirect = vi.fn(async () => undefined);
    expect(await signInWithGoogleOrRedirect({ signInWithPopup: popup, signInWithRedirect: redirect })).toBe("popup");
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    "auth/popup-blocked",
    "auth/popup-closed-by-user",
    "auth/cancelled-popup-request",
    "auth/operation-not-supported-in-this-environment",
  ])("falls back to redirect on %s", async (code) => {
    const popup = vi.fn(async () => Promise.reject(err(code)));
    const redirect = vi.fn(async () => undefined);
    expect(await signInWithGoogleOrRedirect({ signInWithPopup: popup, signInWithRedirect: redirect })).toBe("redirect");
    expect(popup).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("covers exactly the four documented codes", () => {
    expect([...POPUP_FALLBACK_CODES].sort()).toEqual([
      "auth/cancelled-popup-request",
      "auth/operation-not-supported-in-this-environment",
      "auth/popup-blocked",
      "auth/popup-closed-by-user",
    ]);
  });

  it("does not redirect for other failures (for example no network)", async () => {
    const redirect = vi.fn(async () => undefined);
    await expect(signInWithGoogleOrRedirect({ signInWithPopup: async () => Promise.reject(err("auth/network-request-failed")), signInWithRedirect: redirect })).rejects.toMatchObject({ code: "auth/network-request-failed" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("surfaces a failure of the redirect itself", async () => {
    await expect(
      signInWithGoogleOrRedirect({ signInWithPopup: async () => Promise.reject(err("auth/popup-blocked")), signInWithRedirect: async () => Promise.reject(err("auth/network-request-failed")) }),
    ).rejects.toMatchObject({ code: "auth/network-request-failed" });
  });
});

describe("local test sign-in (emulator only)", () => {
  it("signs in an existing account without creating one", async () => {
    const create = vi.fn(async () => undefined);
    await localEmailSignIn({ signIn: async () => undefined, create }, "a@b.test", "secret1");
    expect(create).not.toHaveBeenCalled();
  });

  it.each(["auth/user-not-found", "auth/invalid-credential", "auth/invalid-login-credentials"])("creates the test account when sign-in says %s", async (code) => {
    const create = vi.fn(async () => undefined);
    await localEmailSignIn({ signIn: async () => Promise.reject(err(code)), create }, "a@b.test", "secret1");
    expect(create).toHaveBeenCalledWith("a@b.test", "secret1");
  });

  it("reports a wrong password when the address already exists", async () => {
    await expect(
      localEmailSignIn({ signIn: async () => Promise.reject(err("auth/invalid-credential")), create: async () => Promise.reject(err("auth/email-already-in-use")) }, "a@b.test", "nope12"),
    ).rejects.toMatchObject({ code: "auth/wrong-password" });
  });

  it("does not create an account for unrelated errors", async () => {
    const create = vi.fn();
    await expect(localEmailSignIn({ signIn: async () => Promise.reject(err("auth/network-request-failed")), create }, "a@b.test", "secret1")).rejects.toMatchObject({ code: "auth/network-request-failed" });
    expect(create).not.toHaveBeenCalled();
  });
});
