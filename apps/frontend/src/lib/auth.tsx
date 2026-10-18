import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { env, authIsConfigured } from "./env";
import { safeStorage } from "./safe-storage";

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
  signOut: () => Promise<void>;
  /** A fresh Firebase ID token (or a placeholder in mock mode). */
  getToken: () => Promise<string | null>;
}

export interface AuthBackend {
  subscribe(cb: (u: AuthUser | null) => void): () => void;
  signIn(): Promise<void>;
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

function createFirebaseBackend(): AuthBackend {
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
    subscribe(cb) {
      let off: (() => void) | undefined;
      let cancelled = false;
      init()
        .then(({ auth, mod }) => {
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
      await mod.signInWithPopup(auth, new mod.GoogleAuthProvider());
    },
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
  if (code === "auth/network-request-failed") return "Could not reach the sign-in service. Check your connection and try again.";
  return "Sign-in did not work this time. Nothing was changed. Please try again.";
}

export function AuthProvider({ children, backend }: { children: ReactNode; backend?: AuthBackend }) {
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
    return be.subscribe((u) => {
      setUser(u);
      setStatus(u ? "signedIn" : "signedOut");
    });
  }, [be, backend]);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      await be.signIn();
    } catch (e) {
      setError(friendlySignInError(e));
    }
  }, [be]);

  const signOut = useCallback(async () => {
    await be.signOut();
  }, [be]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      error,
      configured: Boolean(backend) || authIsConfigured(),
      signIn,
      signOut,
      getToken: () => be.getToken(),
    }),
    [status, user, error, signIn, signOut, be, backend],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
