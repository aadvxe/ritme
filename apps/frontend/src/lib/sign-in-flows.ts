/**
 * Pure sign-in flows, kept apart from the Firebase SDK so they can be tested with stubs.
 * Google stays the only production sign-in method; the email flow is for the local Auth emulator only.
 */

const codeOf = (e: unknown): string => (e as { code?: string } | null)?.code ?? "";

/** Errors that mean "the popup can't work here": embedded browsers, blockers, closed windows. */
export const POPUP_FALLBACK_CODES: ReadonlySet<string> = new Set([
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
]);

export interface GoogleFlowDeps {
  signInWithPopup: () => Promise<unknown>;
  /** Navigates away; the result is picked up with getRedirectResult when the app starts again. */
  signInWithRedirect: () => Promise<unknown>;
}

/** Try the popup first. If it can't work here, fall back to a full-page redirect instead of dead-ending. */
export async function signInWithGoogleOrRedirect(deps: GoogleFlowDeps): Promise<"popup" | "redirect"> {
  try {
    await deps.signInWithPopup();
    return "popup";
  } catch (e) {
    if (!POPUP_FALLBACK_CODES.has(codeOf(e))) throw e;
    await deps.signInWithRedirect();
    return "redirect";
  }
}

export interface EmailFlowDeps {
  signIn: (email: string, password: string) => Promise<unknown>;
  create: (email: string, password: string) => Promise<unknown>;
}

const UNKNOWN_USER_CODES = new Set(["auth/user-not-found", "auth/invalid-credential", "auth/invalid-login-credentials"]);

/**
 * Local test sign-in: sign in, and if that account doesn't exist yet on the emulator, create it.
 * If the address exists but the password is wrong, say so instead of silently failing.
 */
export async function localEmailSignIn(deps: EmailFlowDeps, email: string, password: string): Promise<void> {
  try {
    await deps.signIn(email, password);
  } catch (e) {
    if (!UNKNOWN_USER_CODES.has(codeOf(e))) throw e;
    try {
      await deps.create(email, password);
    } catch (e2) {
      if (codeOf(e2) === "auth/email-already-in-use") throw Object.assign(new Error("wrong password"), { code: "auth/wrong-password" });
      throw e2;
    }
  }
}
