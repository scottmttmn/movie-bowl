import { defineConfig, devices } from "@playwright/test";

// The staging smoke suite: the real app, database and TMDB at
// staging.moviebowl.app, signed in as a test account made in the staging
// dashboard. Kept apart from playwright.config.js, whose suite runs against
// fakes in every pull request; this one needs a deploy and credentials, and
// runs from .github/workflows/staging-smoke.yml after each deploy of main.
export default defineConfig({
  testDir: "./e2e/staging",
  testMatch: /.*\.staging\.js/,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: process.env.STAGING_URL || "https://staging.moviebowl.app",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
      },
    },
  ],
});
