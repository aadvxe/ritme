import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A mutable stand-in for env so one file can test the emulator flag both on and off.
const h = vi.hoisted(() => ({
  env: { useMock: false, useAuthEmulator: true, authEmulatorUrl: "http://127.0.0.1:9099", mockLatencyMs: 0, apiBaseUrl: "", extensionId: "", firebase: { apiKey: "", authDomain: "", projectId: "demo-ritme", appId: "" } },
  order: [] as string[],
  fb: {
    getRedirectResult: vi.fn(),
    onAuthStateChanged: vi.fn(),
    signInWithPopup: vi.fn(),
    signInWithRedirect: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    connectAuthEmulator: vi.fn(),
  },
}));

vi.mock("./env", () => ({ env: h.env, authIsConfigured: () => true }));
vi.mock("firebase/app", () => ({ getApps: () => [], initializeApp: () => ({}) }));
vi.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: null }),
  GoogleAuthProvider: class {},
  signOut: vi.fn(),
  ...h.fb,
}));

import { AuthProvider, createFirebaseBackend, useAuth } from "./auth";
import { LoginPage } from "@/pages/LoginPage";

const popupErr = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  h.env.useAuthEmulator = true;
  h.order.length = 0;
  for (const f of Object.values(h.fb)) f.mockReset();
  h.fb.getRedirectResult.mockImplementation(async () => {
    h.order.push("redirect-result");
    return null;
  });
  h.fb.onAuthStateChanged.mockImplementation((_a: unknown, cb: (u: null) => void) => {
    h.order.push("auth-state");
    cb(null);
    return () => undefined;
  });
});

describe("Firebase backend", () => {
  it("opens the popup first and falls back to a redirect when the popup is blocked", async () => {
    h.fb.signInWithPopup.mockRejectedValue(popupErr("auth/operation-not-supported-in-this-environment"));
    h.fb.signInWithRedirect.mockResolvedValue(undefined);
    await createFirebaseBackend().signIn();
    expect(h.fb.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(h.fb.signInWithRedirect).toHaveBeenCalledTimes(1);
  });

  it("does not redirect when the popup works", async () => {
    h.fb.signInWithPopup.mockResolvedValue({});
    await createFirebaseBackend().signIn();
    expect(h.fb.signInWithRedirect).not.toHaveBeenCalled();
  });

  it("finishes a pending redirect sign-in before it reports any auth state", async () => {
    const cb = vi.fn();
    createFirebaseBackend().subscribe(cb);
    await waitFor(() => expect(cb).toHaveBeenCalled());
    expect(h.order).toEqual(["redirect-result", "auth-state"]);
  });

  it("reports a failed redirect sign-in instead of swallowing it", async () => {
    h.fb.getRedirectResult.mockRejectedValue(popupErr("auth/network-request-failed"));
    const onError = vi.fn();
    createFirebaseBackend().subscribe(() => undefined, onError);
    await waitFor(() => expect(onError).toHaveBeenCalled());
  });

  it("has email + password sign-in only when the emulator flag is on", async () => {
    expect(typeof createFirebaseBackend().signInWithEmail).toBe("function");
    h.env.useAuthEmulator = false;
    expect(createFirebaseBackend().signInWithEmail).toBeUndefined();
  });

  it("local test sign-in signs in, and creates the account on the emulator when it is new", async () => {
    h.fb.signInWithEmailAndPassword.mockRejectedValue(popupErr("auth/invalid-credential"));
    h.fb.createUserWithEmailAndPassword.mockResolvedValue({});
    await createFirebaseBackend().signInWithEmail!("dev@example.test", "secret1");
    expect(h.fb.createUserWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), "dev@example.test", "secret1");
  });
});

function Probe() {
  const a = useAuth();
  return <p data-testid="probe">{a.status}</p>;
}

describe("Login page: Local test sign-in visibility", () => {
  const renderLogin = (opts: { emulator: boolean; backendHasEmail?: boolean }) => {
    h.env.useAuthEmulator = opts.emulator;
    const signInWithEmail = vi.fn(async () => undefined);
    const backend = {
      subscribe: (cb: (u: null) => void) => {
        cb(null);
        return () => undefined;
      },
      signIn: async () => undefined,
      signOut: async () => undefined,
      getToken: async () => null,
      ...(opts.backendHasEmail === false ? {} : { signInWithEmail }),
    };
    render(
      <MemoryRouter>
        <AuthProvider backend={backend}>
          <LoginPage />
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );
    return signInWithEmail;
  };

  it("is shown, clearly labelled, when the emulator flag is on", async () => {
    renderLogin({ emulator: true });
    const section = await screen.findByRole("region", { name: "Local test sign-in" });
    expect(section).toHaveTextContent(/Firebase Auth emulator/);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument(); // Google is still the main method
  });

  it("is hidden entirely when the emulator flag is off", async () => {
    renderLogin({ emulator: false });
    await screen.findByRole("button", { name: "Continue with Google" });
    expect(screen.queryByRole("region", { name: "Local test sign-in" })).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByText(/Local test/)).toBeNull();
  });

  it("is hidden when the backend can't do it, even if the flag is on", async () => {
    renderLogin({ emulator: true, backendHasEmail: false });
    await screen.findByRole("button", { name: "Continue with Google" });
    expect(screen.queryByRole("region", { name: "Local test sign-in" })).toBeNull();
  });

  it("submits the typed email and password to the emulator backend", async () => {
    const signInWithEmail = renderLogin({ emulator: true });
    await userEvent.type(await screen.findByLabelText("Email"), "dev@example.test");
    await userEvent.type(screen.getByLabelText("Password"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in (local test)" }));
    await waitFor(() => expect(signInWithEmail).toHaveBeenCalledWith("dev@example.test", "secret1"));
  });
});
