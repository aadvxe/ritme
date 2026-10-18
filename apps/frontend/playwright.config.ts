import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests run against the in-browser mock API (no backend, no Firebase).
 *
 * - E2E_PORT: dev-server port (default 5173).
 * - PW_CHANNEL: "chrome" (default, uses the installed Chrome), "msedge", or "bundled" to use Playwright's own
 *   Chromium (run `pnpm exec playwright install chromium` first, as CI does).
 */
const port = Number(process.env.E2E_PORT ?? 5173);
const channel = process.env.PW_CHANNEL === "bundled" ? undefined : (process.env.PW_CHANNEL ?? "chrome");

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], ...(channel ? { channel } : {}) } }],
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: { VITE_USE_MOCK_API: "true", VITE_MOCK_LATENCY_MS: "0" },
    timeout: 60_000,
  },
});
