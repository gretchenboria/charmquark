import { defineConfig, devices } from "@playwright/test";

// End-to-end config for the Gala frontend. Boots the FastAPI backend (on a dedicated
// e2e SQLite file so it never touches gala_dev.db) and the Next dev server, then drives
// Chromium against the proxied app. The frontend rewrites /api/* to the backend, so tests
// hit the same seam a real browser does.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_NO_SERVER
    ? []
    : [
        {
          // API: the Worker on local D1. Migrate + seed first:
          //   npm --prefix ../api run db:reset:local
          command: "npm --prefix ../api run dev",
          url: "http://127.0.0.1:8787/health",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
        {
          command: "npm run dev",
          url: "http://127.0.0.1:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      ],
});
