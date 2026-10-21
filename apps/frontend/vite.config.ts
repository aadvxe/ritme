import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // Dates are stored as UTC and shown in local time; tests run in a fixed zone away from UTC.
    // Tests are hermetic: a developer's .env.local (emulator, mock API, extension id) must not leak in.
    env: {
      TZ: "Asia/Jakarta",
      VITE_USE_MOCK_API: "false",
      VITE_USE_AUTH_EMULATOR: "false",
      VITE_EXTENSION_ID: "",
      VITE_API_BASE_URL: "http://localhost:8080",
      VITE_FIREBASE_API_KEY: "",
      VITE_FIREBASE_PROJECT_ID: "",
    },
    restoreMocks: true,
  },
});
