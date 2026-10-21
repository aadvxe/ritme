import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { env, authIsConfigured } from "./env";
import { safeStorage } from "./safe-storage";
import { localEmailSignIn, signInWithGoogleOrRedirect } from "./sign-in-flows";

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoUrl: string | null;
}

export type AuthStatus = "loading" | "signedOut" | "signedIn";

export interface AuthValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Last sign-in problem, in plain words. */
  error: string | null;
  configured: boolean;
  signIn: () => Promise<void>;
  /** True only with the local Auth emulator: shows the clearly-labelled "Local test sign-in". */
  localSignInAvailable: boolean;
  signInLocal: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** A fresh Firebase ID token (or a placeholder in mock mode). */
  getToken: () => Promise<string | null>;
}

export interface AuthBackend {
  /** `onError` reports a failed redirect sign-in that was completing when the app started. */
  subscribe(cb: (u: AuthUser | null) => void, onError?: (e: unknown) => void): () => void;
  signIn(): Promise<void>;
  /** Email + password against the local Auth emulator only. Absent everywhere else. */
  signInWithEmail?(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  getToken(): Promise<string | null>;
}

const AuthContext = createContext<AuthValue | null>(null);

/* ---------------------------------------------------------------- mock (no network, no Firebase) */

const MOCK_KEY = "ritme.mock.session";
const MOCK_USER: AuthUser = { uid: "demo-user", displayName: "Demo User", email: "demo@ritme.local", photoUrl: null };

function createMockBackend(): AuthBackend {
  const listeners = new Set<(u: AuthUser | null) => void>();
  const current = () => (safeStorage.get(MOCK_KEY) === "1" ? MOCK_USER : null);
  const emit = () => listeners.forEach((l) => l(current()));
  return {
    subscribe(cb) {
      listeners.add(cb);
      cb(current());
      return () => {
        listeners.delete(cb);
      };
    },
    async signIn() {
      safeStorage.set(MOCK_KEY, "1");
      emit();
    },
    async signOut() {
      safeStorage.remove(MOCK_KEY);
      emit();
    },
    async getToken() {
      return current() ? "mock-token" : null;
    },
  };
}

/* ---------------------------------------------------------------- Firebase (real project or Auth emulator) */

export function createFirebaseBackend(): AuthBackend {
  type FbAuth = import("firebase/auth").Auth;
  let authPromise: Promise<{ auth: FbAuth; mod: typeof import("firebase/auth") }> | null = null;

  const init = () => {
    authPromise ??= (async () => {
      const [{ getApps, initializeApp }, mod] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
      const app =
        getApps()[0] ??
        initializeApp({
          apiKey: env.firebase.apiKey || "demo-api-key",
          authDomain: env.firebase.authDomain || "localhost",
          projectId: env.firebase.projectId || "demo-ritme",
          appId: env.firebase.appId || undefined,
        });
      const auth = mod.getAuth(app);
      if (env.useAuthEmulator) mod.connectAuthEmulator(auth, env.authEmulatorUrl, { disableWarnings: true });
      return { auth, mod };
    })();
    return authPromise;
  };

  const toUser = (u: import("firebase/auth").User | null): AuthUser | null =>
    u ? { uid: u.uid, displayName: u.displayName, email: u.email, photoUrl: u.photoURL } : null;

  return {
    subscribe(cb, onError) {
      let off: (() => void) | undefined;
      let cancelled = false;
      init()
        .then(async ({ auth, mod }) => {
          // Returning from a redirect sign-in: finish it before reporting a state, so the app stays in its
          // normal loading state and then lands signed in.
          try {
            await mod.getRedirectResult(auth);
          } catch (e) {
            onError?.(e);
          }
          if (cancelled) return;
          off = mod.onAuthStateChanged(auth, (u) => cb(toUser(u)));
        })
        .catch(() => cb(null));
      return () => {
        cancelled = true;
        off?.();
      };
    },
    async signIn() {
      const { auth, mod } = await init();
      const provider = new mod.GoogleAuthProvider();
      await signInWithGoogleOrRedirect({
        signInWithPopup: () => mod.signInWithPopup(auth, provider),
        signInWithRedirect: () => mod.signInWithRedirect(auth, provider),
      });
    },
    // Email + password exists only when the Auth emulator is on. Production sign-in is Google only.
    ...(env.useAuthEmulator
      ? {
          async signInWithEmail(email: string, password: string) {
            if (!env.useAuthEmulator) throw new Error("Local test sign-in is only available with the Auth emulator.");
            const { auth, mod } = await init();
            await localEmailSignIn(
              {
                signIn: (e, p) => mod.signInWithEmailAndPassword(auth, e, p),
                create: (e, p) => mod.createUserWithEmailAndPassword(auth, e, p),
              },
              email,
              password,
            );
          },
        }
      : {}),
    async signOut() {
      const { auth, mod } = await init();
      await mod.signOut(auth);
    },
    async getToken() {
      const { auth } = await init();
      return auth.currentUser ? auth.currentUser.getIdToken() : null;
    },
  };
}

/* ---------------------------------------------------------------- provider */

function friendlySignInError(e: unknown): string {
  const code = (e as { code?: string } | null)?.code ?? "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "The sign-in window was closed before it finished. You can try again whenever you like.";
  }
  if (code === "auth/popup-blocked") return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
  if (code === "auth/wrong-password") return "That email already has a local test account with a different password.";
  if (code === "auth/invalid-email") return "That does not look like an email address.";
  if (code === "auth/weak-password") return "Use a password of at least 6 characters.";
  if (code === "auth/network-request-failed") return "Could not reach the sign-in service. Check your connection and try again.";
  return "Sign-in did not work this time. Nothing was changed. Please try again.";
}

export function AuthProvider({ children, backend, localSignIn }: { children: ReactNode; backend?: AuthBackend; localSignIn?: boolean }) {
  const be = useMemo<AuthBackend>(
    () => backend ?? (env.useMock ? createMockBackend() : createFirebaseBackend()),
    [backend],
  );
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!backend && !authIsConfigured()) {
      setStatus("signedOut");
      return;
    }
    return be.subscribe(
      (u) => {
        setUser(u);
        setStatus(u ? "signedIn" : "signedOut");
      },
      (e) => setError(friendlySignInError(e)),
    );
  }, [be, backend]);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      await be.signIn();
    } catch (e) {
      setError(friendlySignInError(e));
    }
  }, [be]);

  const signInLocal = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        await be.signInWithEmail?.(email, password);
      } catch (e) {
        setError(friendlySignInError(e));
      }
    },
    [be],
  );

  const signOut = useCallback(async () => {
    await be.signOut();
  }, [be]);

  const localSignInAvailable = (localSignIn ?? (env.useAuthEmulator && !env.useMock)) && typeof be.signInWithEmail === "function";

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      error,
      configured: Boolean(backend) || authIsConfigured(),
      signIn,
      localSignInAvailable,
      signInLocal,
      signOut,
      getToken: () => be.getToken(),
    }),
    [status, user, error, signIn, localSignInAvailable, signInLocal, signOut, be, backend],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
