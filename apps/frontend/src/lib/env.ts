const raw = import.meta.env;

export const env = {
  /** Serve the API from an in-browser fake (no backend, no Firebase). */
  useMock: raw.VITE_USE_MOCK_API === "true",
  mockLatencyMs: Number(raw.VITE_MOCK_LATENCY_MS ?? 150),
  apiBaseUrl: (raw.VITE_API_BASE_URL as string | undefined) || "http://localhost:8080",
  useAuthEmulator: raw.VITE_USE_AUTH_EMULATOR === "true",
  authEmulatorUrl: (raw.VITE_AUTH_EMULATOR_URL as string | undefined) || "http://127.0.0.1:9099",
  firebase: {
    apiKey: (raw.VITE_FIREBASE_API_KEY as string | undefined) || "",
    authDomain: (raw.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) || "",
    projectId: (raw.VITE_FIREBASE_PROJECT_ID as string | undefined) || "",
    appId: (raw.VITE_FIREBASE_APP_ID as string | undefined) || "",
  },
  extensionId: (raw.VITE_EXTENSION_ID as string | undefined) || "",
};

/** True when sign-in can work: mock mode, the emulator, or a real Firebase web config. */
export function authIsConfigured(): boolean {
  return env.useMock || env.useAuthEmulator || Boolean(env.firebase.apiKey && env.firebase.projectId);
}
