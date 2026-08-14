import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests — docs/PLAN.md §20.2.
 *
 * Run against the *built* static site rather than the dev server: the privacy
 * test asserts that nothing but the app's own static assets is ever requested,
 * and a dev server's HMR socket would make that assertion meaningless.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
    // The app opens in Danish regardless of the browser's own language, and a
    // dedicated test asserts exactly that (§9.2, §24.2.1).
    locale: "en-US",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["clipboard-read", "clipboard-write"],
      },
    },
  ],
  webServer: {
    // `astro preview` manages a background daemon, which leaves "has the server
    // started" ambiguous for a test runner. `scripts/serve-dist.ts` serves the
    // same `dist/` in the foreground and exits with the run.
    command: "bun run build && bun run scripts/serve-dist.ts",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
