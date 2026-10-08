import { defineConfig, devices } from "playwright/test";

// Browser tests run against the production build. Build first: `npm run build`.
// Set E2E_BASE_URL to test a deployed site instead of starting a local server.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  // Every server render waits on Supabase (the root layout checks the signed-in user),
  // so the first paint on a local `next start` can take several seconds.
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
