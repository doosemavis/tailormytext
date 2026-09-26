import { defineConfig, devices } from "@playwright/test";

// Visual-regression + phone/tablet e2e harness for the responsive project
// (docs/superpowers/specs/2026-09-26-responsive-mobile-design.md §9).
// Builds with --mode visual so Supabase points at a fake host that every
// test intercepts; builds into dist-visual/ so the normal dist/ is untouched.
const PORT = 4179;

export default defineConfig({
  testDir: "tests/visual",
  testMatch: "*.spec.js",
  workers: 1,
  reporter: [["list"]],
  expect: {
    toHaveScreenshot: { maxDiffPixels: 0, animations: "disabled", caret: "hide", scale: "css" },
  },
  // Pin timezone + locale: the account page and delete-account dialog format
  // dates in local time, so an unpinned run would bake the host TZ into PNGs.
  use: { baseURL: `http://localhost:${PORT}`, timezoneId: "UTC", locale: "en-US" },
  webServer: {
    command: `npx vite build --mode visual --outDir dist-visual && npx vite preview --outDir dist-visual --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: "desktop", testMatch: "desktop.spec.js", use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1 } },
    { name: "mobile", testMatch: "mobile.spec.js", use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1 } },
  ],
});
