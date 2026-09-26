# Responsive Phone & Tablet Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every existing TailorMyText screen usable on phones and tablets and installable to the home screen, without changing any feature's behavior or the desktop rendering.

**Architecture:** A `useBreakpoint` hook (matchMedia) picks a tier (phone < 768, tablet 768–1023, desktop ≥ 1024) for the three structural swaps in the reader: phone toolbar, slide-over side panel, and screen-fit. Everything else is phone/tablet-only CSS in a new `responsive.css`, attached through new `className` hooks and using `!important` inside media queries to beat existing inline styles, so desktop code paths keep their exact inline styles. A Playwright screenshot suite captured before any change proves desktop stays pixel-identical.

**Tech Stack:** React 18 + Vite 5, Radix UI (Popover added), vitest + @testing-library/react + happy-dom (unit), @playwright/test (visual + phone/tablet e2e), Supabase (mocked in e2e).

**Spec:** `docs/superpowers/specs/2026-09-26-responsive-mobile-design.md`

## Global Constraints

- Work only on branch `feat/responsive-mobile` in worktree `~/dev/tailormytext-responsive`; never commit to `production` or `main`.
- Tiers: phone `< 768px` (`PHONE_MAX = 767`), tablet `768–1023px` (`TABLET_MAX = 1023`), desktop `≥ 1024px`. Touch = `(pointer: coarse)`.
- No behavior change to existing features (pacer, NeuroDiv, HueGuide, focus mode, reading guide, themes, typography, uploads/parsers, library, auth, subscriptions). Do not edit `src/hooks/usePacer.js`, `src/components/ReadingGuideOverlay.jsx`, parsers, or `src/utils/**`. Any unavoidable logic-file change: stop and ask the owner.
- Do not edit any existing inline style value. Add `className` hooks only; phone/tablet rules live in `src/styles/responsive.css` inside media queries.
- Desktop (1024, 1280, 1440) must match the Task 1 baseline with `maxDiffPixels: 0`. Run `npm run test:visual -- --project=desktop` at the end of every task.
- Existing test files are never edited. `npm test` must pass at the end of every task.
- New dependencies allowed: `@radix-ui/react-popover` (runtime), `@playwright/test` (dev). Nothing else.
- No pacer step buttons on touch (spec §11, option B).
- Commit format: `<type>: <description>` + trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The final PR targets `production` (not `main`), and only after the owner completes the device checklist.

## Review Focus

1. **Pickers inside the slide-over.** The font picker is a Radix DropdownMenu portaled to `<body>` at `zIndex: 200`; choosing a font from the phone/tablet panel must open above the panel and must not close it. Pinned in Task 4 (panel `z-index` 160; e2e picks a font).
2. **Upload from the phone empty state.** The panel starts closed on phone, and the hidden `<input type="file">` that `fileRef` points at lives inside the panel contents; "Upload a file" must still reach it. Pinned in Task 4 (panel contents stay mounted when closed; e2e asserts the input exists inside the closed panel).
3. **Crossing a tier boundary with the panel open** (rotating a tablet, resizing a window): no crash, panel state kept, no horizontal overflow. Pinned in Task 4 (1280 → 820 → 390 → 1280 e2e).
4. **iPad landscape (1024×768, touch) with the panel open:** the desktop toolbar already needs ~1011px, so bigger touch targets must not push controls off-screen. Pinned in Task 6 (44px targets only below 1024px; e2e checks every top-bar control is on-screen at 1024 touch).
5. **Long chapter titles on the phone toolbar** must truncate; Tools and the account button must stay on-screen at 360px. Pinned in Task 5 (e2e at 360/390/430 with the demo's long title).

---

## File Structure

| Path | Status | Responsibility |
| --- | --- | --- |
| `src/config/breakpoints.js` | new | Tier constants and media-query strings |
| `src/hooks/useBreakpoint.js` | new | `useBreakpoint()` → `{ tier, isTouch }`; `readBreakpoint()` for initial state |
| `src/styles/responsive.css` | new | All phone/tablet/touch CSS |
| `src/components/mobile/SlideOverPanel.jsx` | new | Overlay side panel + backdrop for tablet/phone |
| `src/components/mobile/ReaderToolsPopover.jsx` | new | Tools button + popover with the four feature toggles |
| `src/components/mobile/PhoneReaderToolbar.jsx` | new | Phone top-bar layout (slots) |
| `src/components/mobile/index.js` | new | Barrel export |
| `src/App.jsx` | modify | Hook call, `panelOpen` initializer, hoisted JSX variables, tier branches, className hooks |
| `src/components/UserMenu.jsx` | modify | Optional `compact` prop (icon-only Sign in) |
| `src/components/LibraryTeaseSection.jsx`, `LibrarySection.jsx`, `LegalLayout.jsx`, `Toast.jsx`, 10 dialog components, `src/pages/Account.jsx` | modify | `className` hooks only |
| `src/main.jsx`, `index.html`, `public/manifest.webmanifest` | modify | CSS import, viewport/iOS meta, icons |
| `scripts/generate-icons.mjs`, `public/icons/*.png` | new | Home-screen icons |
| `playwright.config.js`, `.env.visual`, `.env.test`, `tests/visual/*` | new | Visual + phone/tablet e2e harness |
| `tests/config/breakpoints.test.js`, `tests/hooks/useBreakpoint.test.jsx`, `tests/components/mobile/*.test.jsx`, `tests/components/UserMenuCompact.test.jsx`, `tests/components/mobileHooks.test.jsx`, `tests/config/installability.test.js` | new | Unit tests |

---

### Task 1: Visual-regression harness and desktop baseline

Spec step 0. **No file under `src/` changes in this task.** The baseline must be captured from untouched code (`775b234` + docs).

**Files:**
- Modify: `package.json` (devDependency + scripts), `.gitignore`
- Create: `playwright.config.js`, `.env.visual`, `.env.test`, `tests/visual/fixtures.js`, `tests/visual/desktop.spec.js`
- Create (generated): `tests/visual/desktop.spec.js-snapshots/*.png`

**Interfaces:**
- Produces (used by every later task), all from `tests/visual/fixtures.js`: `test` (with an `app({ signedIn?, path? }) => Promise<Page>` fixture), `expect`, `settle(page, ms?)`, `openDemo(page)`, `openPanelDesktop(page)`, `openSidebarSection(page, title)`, `openUserMenuItem(page, item)`, `expectNoHorizontalOverflow(page)`, `expectInViewport(page, locator)`.

- [ ] **Step 1: Install dependencies in the worktree**

```bash
cd ~/dev/tailormytext-responsive
npm install
npm install --save-dev @playwright/test
npx playwright install chromium
```

Expected: `node_modules/` exists; `package.json` devDependencies gains `@playwright/test`.

- [ ] **Step 2: Add test env files**

The worktree has no `.env` (gitignored), which makes existing tests that import `src/utils/supabase.js` fail with "supabaseUrl is required". Add committed, fake-valued env files. Vite loads `.env.test` for vitest and `.env.visual` for `--mode visual`. The host uses the reserved `.test` TLD, so it can never resolve.

`.env.test`:
```
VITE_SUPABASE_URL=http://supabase.visual.test
VITE_SUPABASE_ANON_KEY=test-anon-key
```

`.env.visual`:
```
VITE_SUPABASE_URL=http://supabase.visual.test
VITE_SUPABASE_ANON_KEY=visual-anon-key
```

- [ ] **Step 3: Run the existing unit suite as the "before" record**

Run: `npm test`
Expected: all test files load and pass. Record the pass count in the task notes; every later task must match or exceed it.

- [ ] **Step 4: Scripts and ignores**

In `package.json` `"scripts"`, add:
```json
"test:visual": "playwright test",
"icons": "node scripts/generate-icons.mjs"
```

Append to `.gitignore`:
```
dist-visual/
test-results/
playwright-report/
```

- [ ] **Step 5: Playwright config**

`playwright.config.js`:
```js
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
  use: { baseURL: `http://localhost:${PORT}` },
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
```

- [ ] **Step 6: Shared fixtures**

`tests/visual/fixtures.js`:
```js
import { test as base, expect } from "@playwright/test";

// Fixed fake clock: timers (landing carousel, loader fades) advance only in
// fake time, so every run lands on the same frame.
export const FROZEN_START = new Date("2026-09-26T12:00:00Z");
export const SETTLE_AT = new Date("2026-09-26T12:01:00Z");

const SUPABASE_ORIGIN = "http://supabase.visual.test";
// supabase-js default key: sb-<first label of the host>-auth-token
const STORAGE_KEY = "sb-supabase-auth-token";

export const FAKE_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "reader@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

export const LIBRARY_BOOKS = [
  { id: "b1", gutenberg_id: 1342, title: "Pride and Prejudice", author: "Jane Austen", publication_date: "1813", edition: null, chapter_count: 61, word_count: 121000, reading_time_min: 480, tier_required: "free", popularity_rank: 1, blob_path: "b1.epub", byte_size: 500000 },
  { id: "b2", gutenberg_id: 84, title: "Frankenstein", author: "Mary Shelley", publication_date: "1818", edition: null, chapter_count: 24, word_count: 75000, reading_time_min: 300, tier_required: "pro", popularity_rank: 2, blob_path: "b2.epub", byte_size: 400000 },
];

async function mockSupabase(page, { signedIn }) {
  await page.routeWebSocket(/supabase\.visual\.test/, (ws) => ws.close());
  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    if (pathname.startsWith("/auth/v1/user")) {
      return signedIn ? route.fulfill({ json: FAKE_USER }) : route.fulfill({ status: 401, json: { message: "no session" } });
    }
    if (pathname.startsWith("/auth/v1/")) return route.fulfill({ json: {} });
    if (pathname.startsWith("/rest/v1/library_books")) return route.fulfill({ json: LIBRARY_BOOKS });
    if (pathname.startsWith("/rest/v1/rpc/")) return route.fulfill({ json: null });
    if (pathname.startsWith("/rest/v1/")) {
      const wantsObject = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      return wantsObject
        ? route.fulfill({ status: 406, json: { code: "PGRST116", message: "no rows" } })
        : route.fulfill({ json: [] });
    }
    if (pathname.startsWith("/functions/v1/")) return route.fulfill({ json: {} });
    return route.fulfill({ status: 404, json: {} });
  });
}

async function seedSession(page) {
  const now = Math.floor(FROZEN_START.getTime() / 1000);
  const session = {
    access_token: "visual-access-token",
    refresh_token: "visual-refresh-token",
    token_type: "bearer",
    expires_in: 31536000,
    expires_at: now + 31536000,
    user: FAKE_USER,
  };
  await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(session)]);
}

// Advance fake time so setTimeout-driven UI (loader fade, dialog mount)
// completes, then wait for web fonts.
export async function settle(page, ms = 2000) {
  await page.clock.runFor(ms);
  await page.evaluate(() => document.fonts.ready);
}

export const test = base.extend({
  app: async ({ page }, use) => {
    await use(async ({ signedIn = false, path = "/" } = {}) => {
      await mockSupabase(page, { signedIn });
      if (signedIn) await seedSession(page);
      await page.clock.install({ time: FROZEN_START });
      await page.goto(path);
      await page.clock.pauseAt(SETTLE_AT);
      await settle(page);
      return page;
    });
  },
});

export { expect };

export async function openDemo(page) {
  await page.getByRole("button", { name: /try demo article/i }).click();
  await settle(page);
  await expect(page.locator(".rf-reader-scroll")).toBeVisible();
}

// Top-bar "Open panel" button (lucide PanelLeft icon, no aria-label).
export async function openPanelDesktop(page) {
  await page.locator("button:has(svg.lucide-panel-left)").first().click();
  await settle(page, 500);
}

export async function openSidebarSection(page, title) {
  await page.getByRole("button", { name: title, exact: true }).click();
  await settle(page, 500);
}

// UserMenu is the last Radix DropdownMenu trigger on the page.
export async function openUserMenuItem(page, item) {
  await page.locator('button[aria-haspopup="menu"]').last().click();
  await settle(page, 300);
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await settle(page, 300);
  await page.getByRole("menuitem", { name: item }).click();
  await settle(page);
}

export async function expectNoHorizontalOverflow(page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

export async function expectInViewport(page, locator) {
  const box = await locator.boundingBox();
  const { width } = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
}
```

- [ ] **Step 7: Desktop baseline spec**

`tests/visual/desktop.spec.js`:
```js
import { test, expect, settle, openDemo, openPanelDesktop, openSidebarSection, openUserMenuItem } from "./fixtures.js";

// Desktop must stay pixel-identical through the whole responsive project
// (spec §3.2, §9.1). Baselines were captured from untouched code in Task 1.
const WIDTHS = [1024, 1280, 1440];
const GUIDE_MODES = [["highlight", 1], ["underline", 2], ["dim", 3]]; // Segment radio index (0 = Off)

for (const width of WIDTHS) {
  test.describe(`desktop ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("landing signed out", async ({ app }) => {
      const page = await app();
      await expect(page).toHaveScreenshot(`landing-out-${width}.png`, { fullPage: true });
    });

    test("landing signed in", async ({ app }) => {
      const page = await app({ signedIn: true });
      await expect(page).toHaveScreenshot(`landing-in-${width}.png`, { fullPage: true });
    });

    test("auth dialog", async ({ app }) => {
      const page = await app();
      await page.getByRole("button", { name: "Sign in" }).click();
      await settle(page);
      await expect(page).toHaveScreenshot(`dialog-auth-${width}.png`);
    });

    test("pricing dialog", async ({ app }) => {
      const page = await app();
      await page.getByRole("button", { name: /see pro plans/i }).click();
      await settle(page);
      await expect(page).toHaveScreenshot(`dialog-pricing-${width}.png`);
    });

    test("contact dialog", async ({ app }) => {
      const page = await app();
      await page.getByText("Contact", { exact: true }).click();
      await settle(page);
      await expect(page).toHaveScreenshot(`dialog-contact-${width}.png`);
    });

    for (const item of ["Manage subscription", "Change avatar", "Delete account"]) {
      test(`user menu: ${item}`, async ({ app }) => {
        const page = await app({ signedIn: true });
        await openUserMenuItem(page, item);
        await expect(page).toHaveScreenshot(`dialog-${item.replace(/\s+/g, "-").toLowerCase()}-${width}.png`);
      });
    }

    test("reader default", async ({ app }) => {
      const page = await app();
      await openDemo(page);
      await expect(page).toHaveScreenshot(`reader-default-${width}.png`);
    });

    test("reader panel open", async ({ app }) => {
      const page = await app();
      await openDemo(page);
      await openPanelDesktop(page);
      await expect(page).toHaveScreenshot(`reader-panel-${width}.png`);
    });

    for (const label of ["NeuroDiv", "HueGuide", "Focus", "Pacer"]) {
      test(`reader ${label} on`, async ({ app }) => {
        const page = await app();
        await openDemo(page);
        await page.getByRole("button", { name: label, exact: true }).click();
        await settle(page, 500);
        await expect(page).toHaveScreenshot(`reader-${label.toLowerCase()}-${width}.png`);
      });
    }

    for (const [mode, index] of GUIDE_MODES) {
      test(`reader guide ${mode}`, async ({ app }) => {
        const page = await app();
        await openDemo(page);
        await openPanelDesktop(page);
        await openSidebarSection(page, "Reading Guide");
        await page.getByRole("radio").nth(index).click();
        await page.mouse.move(width - 300, 420);
        await settle(page, 200);
        await expect(page).toHaveScreenshot(`reader-guide-${mode}-${width}.png`);
      });
    }

    test("reader chapter menu open", async ({ app }) => {
      const page = await app();
      await openDemo(page);
      await page.getByRole("button", { name: /chapter 1/i }).click();
      await settle(page, 500);
      await expect(page).toHaveScreenshot(`reader-chapters-${width}.png`);
    });

    test("library drawer", async ({ app }) => {
      const page = await app({ signedIn: true });
      await openDemo(page);
      await openPanelDesktop(page);
      await page.getByRole("button", { name: /browse the library/i }).click();
      await settle(page);
      await expect(page).toHaveScreenshot(`library-drawer-${width}.png`);
    });

    for (const path of ["/privacy", "/terms"]) {
      test(`page ${path}`, async ({ app }) => {
        const page = await app({ path });
        await expect(page).toHaveScreenshot(`page${path.replace("/", "-")}-${width}.png`, { fullPage: true });
      });
    }

    test("page /account", async ({ app }) => {
      const page = await app({ signedIn: true, path: "/account" });
      await expect(page).toHaveScreenshot(`page-account-${width}.png`, { fullPage: true });
    });
  });
}
```

- [ ] **Step 8: Capture the baseline**

Run: `npm run test:visual -- --project=desktop --update-snapshots`
Expected: all tests pass and PNGs are written under `tests/visual/desktop.spec.js-snapshots/`.

If a selector doesn't match the UI (for example the Contact link is a `<button>` rather than `<a>`), fix the **spec file's selector**, never app code, and re-run. If a signed-in state renders an error toast from an unmocked Supabase call, extend `mockSupabase` for that endpoint and re-run. Open 3–4 of the PNGs and confirm they show the intended state.

- [ ] **Step 9: Prove the baseline is deterministic**

Run: `npm run test:visual -- --project=desktop` twice.
Expected: both runs PASS with 0 differing pixels. If a test flakes, add a `mask: [locator]` for the moving region in that test only, comment why, and recapture that one test with `--update-snapshots -g "<test name>"`.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json .gitignore playwright.config.js .env.visual .env.test tests/visual
git commit -m "test: add Playwright desktop visual baseline for responsive work

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Breakpoint foundation

**Files:**
- Create: `src/config/breakpoints.js`, `src/hooks/useBreakpoint.js`, `src/styles/responsive.css`
- Modify: `src/main.jsx` (CSS import), `index.html` (viewport meta)
- Test: `tests/config/breakpoints.test.js`, `tests/hooks/useBreakpoint.test.jsx`

**Interfaces:**
- Produces: `PHONE_MAX`, `TABLET_MAX`, `MQ_PHONE`, `MQ_TABLET_DOWN`, `MQ_TOUCH`; `useBreakpoint(): { tier: "phone" | "tablet" | "desktop", isTouch: boolean }`; `readBreakpoint(): same shape` (synchronous; returns desktop when `window.matchMedia` is missing).

- [ ] **Step 1: Failing tests**

`tests/config/breakpoints.test.js`:
```js
import { describe, it, expect } from "vitest";
import { PHONE_MAX, TABLET_MAX, MQ_PHONE, MQ_TABLET_DOWN, MQ_TOUCH } from "../../src/config/breakpoints";

describe("breakpoints", () => {
  it("uses the spec's tier boundaries", () => {
    expect(PHONE_MAX).toBe(767);
    expect(TABLET_MAX).toBe(1023);
  });
  it("builds media queries from the constants", () => {
    expect(MQ_PHONE).toBe("(max-width: 767px)");
    expect(MQ_TABLET_DOWN).toBe("(max-width: 1023px)");
    expect(MQ_TOUCH).toBe("(pointer: coarse)");
  });
});
```

`tests/hooks/useBreakpoint.test.jsx`:
```jsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBreakpoint, readBreakpoint } from "../../src/hooks/useBreakpoint";

const original = window.matchMedia;

function evaluate(query, { width, coarse }) {
  const max = query.match(/max-width: (\d+)px/);
  if (max) return width <= Number(max[1]);
  if (query.includes("pointer: coarse")) return coarse;
  return false;
}

// Fake matchMedia whose state can change; fires "change" listeners like a browser.
function installMatchMedia(initial) {
  const state = { ...initial };
  const listeners = new Set();
  window.matchMedia = vi.fn((query) => ({
    media: query,
    get matches() { return evaluate(query, state); },
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  }));
  return {
    set(next) {
      Object.assign(state, next);
      listeners.forEach((fn) => fn());
    },
  };
}

afterEach(() => { window.matchMedia = original; });

describe("readBreakpoint", () => {
  it.each([
    [360, "phone"], [767, "phone"], [768, "tablet"], [1023, "tablet"], [1024, "desktop"], [1440, "desktop"],
  ])("width %i is %s", (width, tier) => {
    installMatchMedia({ width, coarse: false });
    expect(readBreakpoint().tier).toBe(tier);
  });

  it("reports touch from pointer: coarse", () => {
    installMatchMedia({ width: 1024, coarse: true });
    expect(readBreakpoint()).toEqual({ tier: "desktop", isTouch: true });
  });

  it("falls back to desktop without matchMedia", () => {
    window.matchMedia = undefined;
    expect(readBreakpoint()).toEqual({ tier: "desktop", isTouch: false });
  });
});

describe("useBreakpoint", () => {
  it("updates when a tier boundary is crossed", () => {
    const mm = installMatchMedia({ width: 1280, coarse: false });
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.tier).toBe("desktop");
    act(() => mm.set({ width: 820 }));
    expect(result.current.tier).toBe("tablet");
    act(() => mm.set({ width: 390 }));
    expect(result.current.tier).toBe("phone");
  });

  it("keeps the same object when a change stays inside a tier", () => {
    const mm = installMatchMedia({ width: 1280, coarse: false });
    const { result } = renderHook(() => useBreakpoint());
    const first = result.current;
    act(() => mm.set({ width: 1100 }));
    expect(result.current).toBe(first);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/config/breakpoints.test.js tests/hooks/useBreakpoint.test.jsx`
Expected: FAIL (cannot resolve `src/config/breakpoints` / `src/hooks/useBreakpoint`).

- [ ] **Step 3: Implement**

`src/config/breakpoints.js`:
```js
// Screen tiers for the responsive layout (spec §4). responsive.css uses the
// same numbers; this file is the source of truth.
export const PHONE_MAX = 767;   // < 768 is phone
export const TABLET_MAX = 1023; // 768–1023 is tablet; ≥ 1024 is desktop
export const MQ_PHONE = `(max-width: ${PHONE_MAX}px)`;
export const MQ_TABLET_DOWN = `(max-width: ${TABLET_MAX}px)`;
export const MQ_TOUCH = "(pointer: coarse)";
```

`src/hooks/useBreakpoint.js`:
```js
import { useEffect, useState } from "react";
import { MQ_PHONE, MQ_TABLET_DOWN, MQ_TOUCH } from "../config/breakpoints";

const DESKTOP = { tier: "desktop", isTouch: false };

// Synchronous read so initial state (first paint, panelOpen default) already
// uses the right tier.
export function readBreakpoint() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return DESKTOP;
  const phone = window.matchMedia(MQ_PHONE).matches;
  const tabletDown = window.matchMedia(MQ_TABLET_DOWN).matches;
  return {
    tier: phone ? "phone" : tabletDown ? "tablet" : "desktop",
    isTouch: window.matchMedia(MQ_TOUCH).matches,
  };
}

// Re-renders only when a tier or touch boundary is crossed, never on every
// resize: an App render costs ~25ms on a 420K-word book.
export function useBreakpoint() {
  const [bp, setBp] = useState(readBreakpoint);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const queries = [MQ_PHONE, MQ_TABLET_DOWN, MQ_TOUCH].map((q) => window.matchMedia(q));
    const onChange = () => setBp((prev) => {
      const next = readBreakpoint();
      return next.tier === prev.tier && next.isTouch === prev.isTouch ? prev : next;
    });
    queries.forEach((mql) => mql.addEventListener("change", onChange));
    onChange();
    return () => queries.forEach((mql) => mql.removeEventListener("change", onChange));
  }, []);
  return bp;
}
```

`src/styles/responsive.css`:
```css
/* Responsive phone/tablet/touch rules.
 *
 * Breakpoints mirror src/config/breakpoints.js (source of truth):
 *   phone   (max-width: 767px)
 *   tablet  (min-width: 768px) and (max-width: 1023px)
 *   touch   (pointer: coarse)
 *
 * Rule for this file: desktop (>= 1024px, fine pointer) must render exactly
 * as before, so every rule that targets an existing element lives inside a
 * phone/tablet/touch media query. !important is used only to beat an
 * existing inline style. See docs/superpowers/specs/2026-09-26-responsive-mobile-design.md.
 */

.rf-visually-hidden {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

/* Landscape iPhones: keep content out of the notch. env() is 0 everywhere else. */
@media (max-width: 1023px) {
  #root {
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
    box-sizing: border-box;
  }
}
```

In `src/main.jsx`, after `import "./styles/global.css";` add:
```js
import "./styles/responsive.css";
```

In `index.html`, change the viewport meta to:
```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/config/breakpoints.test.js tests/hooks/useBreakpoint.test.jsx`
Expected: PASS.

- [ ] **Step 5: Full checks**

Run: `npm test && npm run test:visual -- --project=desktop`
Expected: unit suite passes (count ≥ Task 1 record); desktop visual 0-pixel diffs.

- [ ] **Step 6: Commit**

```bash
git add src/config/breakpoints.js src/hooks/useBreakpoint.js src/styles/responsive.css src/main.jsx index.html tests/config/breakpoints.test.js tests/hooks/useBreakpoint.test.jsx
git commit -m "feat: add screen-tier breakpoints, useBreakpoint hook, responsive.css

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Hoist reader chrome into shared JSX variables (pure refactor)

Spec §5.4. Output must be identical DOM on desktop. No behavior or style edits.

**Files:**
- Modify: `src/App.jsx` (reader view, currently lines ~1195–1590)

**Interfaces:**
- Produces (used by Tasks 4–6; all defined inside `App` just before the reader-view `return (`): `panelToggleButton` (JSX), `sidebarContent` (JSX), `chapterMenu` (JSX or `false`), `uncertaintyBadge` (JSX), `featureItems` (`Array<{ label: string, on: boolean, Icon: Component, onToggle: () => void }>`), `featureToggles` (JSX array), `renderUserMenu(extraProps?: object) => JSX`.

- [ ] **Step 1: Define the variables**

Immediately above the reader-view block:
```jsx
  // ═══════════════════════════════════════════
  // READER VIEW
  // ═══════════════════════════════════════════
  return (
```
insert the block below. The three `<<CUT …>>` markers are cut-and-paste instructions for Step 2, not code: replace each with the exact element text cut from its current location. Keep inner comments and whitespace. JSX comments (`{/* … */}`) that sat directly above a moved expression become `//` comments above the variable, because they are no longer inside JSX.

```jsx
  // Reader chrome pieces shared by the desktop layout and the phone/tablet
  // layouts (docs/superpowers/specs/2026-09-26-responsive-mobile-design.md §5.4).
  // Same pattern as `modals` / `loaderOverlay`: JSX built once, placed per tier.
  const panelToggleButton = (
    <<CUT the <Tip label="Open panel" …>…</Tip> element from inside `{!panelOpen && ( … )}` in the top bar>>
  );

  const sidebarContent = (
    <<CUT the <div style={{ width: SIDEBAR_CONTENT_WIDTH }}> … </div> element from inside `{panelOpen && ( … )}` in the SIDEBAR column (back-to-home row through <SidebarBookshelf … />)>>
  );

  // Chapter dropdown is non-modal: Radix's modal mode sets pointer-events:none
  // on <body> while open, and that property inherits, so every word span in
  // the book got its style recomputed on open AND close (~1.2s each on Don
  // Quixote). Non-modal still closes on outside click and Escape.
  const chapterMenu = <<CUT the `hasSections && displaySections.length > 1 && ( <DropdownMenu.Root …> … </DropdownMenu.Root> )` expression>>;

  // Uncertainty badge — surfaces when text-parser confidence < 0.70.
  const uncertaintyBadge = (
    <UncertaintyBadge
      score={confidence?.score}
      onClick={() => setEditChaptersOpen(true)}
    />
  );

  // Reader feature toggles. Tooltips use the short product name only; longer
  // descriptions live in the sidebar Toggle labels + settings, so the reader
  // chrome stays scannable on hover. aria-label mirrors the tip for screen
  // readers, which never see the tooltip.
  const featureItems = [
    { label: "NeuroDiv", on: neuroDiv, Icon: Baseline, onToggle: toggleNeuroDiv },
    { label: "HueGuide", on: hueGuide, Icon: Palette, onToggle: toggleHueGuide },
    { label: "Focus", on: focusMode, Icon: Focus, onToggle: toggleFocusMode },
    { label: "Pacer", on: pacer.enabled, Icon: Gauge, onToggle: pacer.toggle },
  ];
  const featureToggles = featureItems.map(({ label, on, Icon, onToggle }) => (
    <FeatureToggleButton key={label} on={on} label={label} Icon={Icon} accent={t.accent} iconColor={t.icon} onToggle={onToggle} t={t} />
  ));

  const renderUserMenu = (extraProps = {}) => (
    <UserMenu t={t} onShowAuth={() => setShowAuth(true)} onShowAvatarSettings={() => setShowAvatarSettings(true)} onShowSubscription={() => setShowSubscription(true)} onShowPaymentReceipts={handleShowPaymentReceipts} showPaymentReceipts={sub.hasStripeHistory} onShowDeleteAccount={() => setShowDeleteAccount(true)} avatar={avatar} themePersistEnabled={themePref.persistEnabled} onToggleThemePersist={onToggleThemePersist} mockFreeMode={sub.mockFreeMode} onToggleMockFreeMode={sub.toggleMockFreeMode} isProGrantActive={sub.isProGrantActive} {...extraProps} />
  );
```

- [ ] **Step 2: Replace the original locations**

In the reader JSX:
- SIDEBAR column: `{panelOpen && ( <div style={{ width: SIDEBAR_CONTENT_WIDTH }}>…</div> )}` becomes `{panelOpen && sidebarContent}`.
- Top bar: `{!panelOpen && ( <Tip label="Open panel" …>…</Tip> )}` becomes `{!panelOpen && panelToggleButton}`.
- Top bar: the chapter-navigator comments + expression become `{chapterMenu}`.
- Top bar: the uncertainty-badge comment + `<UncertaintyBadge … />` become `{uncertaintyBadge}`.
- Top bar: the four `<FeatureToggleButton … />` lines (and their comment) inside `<div style={{ display: "flex", alignItems: "center", gap: 16 }}>` become `{featureToggles}`. The wrapping `<div>` stays.
- Top bar: `<UserMenu … />` becomes `{renderUserMenu()}`. The landing page's separate `<UserMenu>` (top-right fixed container) is **not** changed.

- [ ] **Step 3: Verify the move is text-preserving**

Run: `git diff --color-moved=zebra --color-moved-ws=allow-indentation-change src/App.jsx`
Expected: the sidebar, panel button, and chapter-menu blocks show as moved (not plain red/green). Only the new declarations, the placeholder references (`{sidebarContent}` etc.), the `featureItems` map, and the comment conversions appear as plain additions/removals. Read the diff once end to end.

- [ ] **Step 4: Build and check**

Run: `npx vite build && npm test && npm run test:visual -- --project=desktop`
Expected: build succeeds; unit suite passes; desktop visual 0-pixel diffs on every state (the proof that the refactor is output-identical).

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "refactor: hoist reader chrome into shared JSX variables

No output change: desktop visual suite matches the baseline pixel-for-pixel.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Slide-over side panel for tablet and phone

Spec §6.2, §6.3.

**Files:**
- Create: `src/components/mobile/SlideOverPanel.jsx`, `src/components/mobile/index.js`, `tests/components/mobile/SlideOverPanel.test.jsx`, `tests/visual/mobile.spec.js`
- Modify: `src/App.jsx`, `src/styles/responsive.css`

**Interfaces:**
- Consumes: `useBreakpoint`, `readBreakpoint` (Task 2); `sidebarContent`, `panelToggleButton` (Task 3).
- Produces: `SlideOverPanel({ open: boolean, onOpenChange: (open: boolean) => void, width: string | number, background: string, borderColor: string, label?: string, children })`; `tier` and `isTouch` constants in `App`; CSS classes `rf-reader-root`, `rf-slideover`, `rf-slideover-backdrop`.

- [ ] **Step 1: Failing unit test**

`tests/components/mobile/SlideOverPanel.test.jsx`:
```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlideOverPanel } from "../../../src/components/mobile";

const renderPanel = (props = {}) => {
  const onOpenChange = vi.fn();
  render(
    <SlideOverPanel open onOpenChange={onOpenChange} width={296} background="#fff" borderColor="#ccc" {...props}>
      <button>Inside</button>
    </SlideOverPanel>
  );
  return onOpenChange;
};

describe("SlideOverPanel", () => {
  it("shows its children and a backdrop when open", () => {
    renderPanel();
    expect(screen.getByRole("dialog", { name: "Reader panel" })).toBeTruthy();
    expect(screen.getByTestId("slideover-backdrop")).toBeTruthy();
    expect(screen.getByText("Inside")).toBeTruthy();
  });

  it("keeps children mounted but hidden when closed", () => {
    renderPanel({ open: false });
    const panel = document.querySelector(".rf-slideover");
    expect(panel.getAttribute("data-state")).toBe("closed");
    expect(panel.getAttribute("aria-hidden")).toBe("true");
    expect(panel.textContent).toContain("Inside");
    expect(screen.queryByTestId("slideover-backdrop")).toBeNull();
  });

  it("closes on backdrop click", () => {
    const onOpenChange = renderPanel();
    fireEvent.click(screen.getByTestId("slideover-backdrop"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ignores Escape while closed", () => {
    const onOpenChange = renderPanel({ open: false });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes on Escape when open", () => {
    const onOpenChange = renderPanel();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/components/mobile/SlideOverPanel.test.jsx`
Expected: FAIL (cannot resolve `src/components/mobile`).

- [ ] **Step 3: Implement the component**

`src/components/mobile/SlideOverPanel.jsx`:
```jsx
import { useEffect } from "react";

// Tablet/phone side panel: slides over the reader instead of pushing it
// (spec §6.2). Deliberately NOT a Radix modal Dialog: modal mode sets
// pointer-events:none on <body>, which restyles every word span in a large
// book (~1.2s on Don Quixote), the same reason the chapter menu is
// non-modal. Contents stay mounted while closed so the hidden file <input>
// inside the panel keeps working for the reader's "Upload a file" button.
// z-index (responsive.css) sits below the font picker menu (zIndex 200) so
// pickers opened from the panel render above it.
export default function SlideOverPanel({ open, onOpenChange, width, background, borderColor, label = "Reader panel", children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onOpenChange(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <>
      {open && (
        <div className="rf-slideover-backdrop" data-testid="slideover-backdrop" aria-hidden="true" onClick={() => onOpenChange(false)} />
      )}
      <aside
        role="dialog"
        aria-label={label}
        aria-hidden={!open}
        data-state={open ? "open" : "closed"}
        className="rf-slideover rf-no-select rf-side-scroll"
        style={{ width, background, borderRight: `1px solid ${borderColor}` }}
      >
        {children}
      </aside>
    </>
  );
}
```

`src/components/mobile/index.js`:
```js
export { default as SlideOverPanel } from "./SlideOverPanel";
```

Append to `src/styles/responsive.css`:
```css
/* ── Slide-over side panel (rendered only when tier !== desktop) ── */
.rf-slideover-backdrop {
  position: fixed; inset: 0; z-index: 150;
  background: rgba(20, 16, 12, 0.38);
}
.rf-slideover {
  position: fixed; top: 0; left: 0; bottom: 0; z-index: 160;
  height: 100vh; height: 100dvh;
  overflow-y: auto; overflow-x: hidden; box-sizing: border-box;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.22);
}
.rf-slideover[data-state="closed"] { display: none; }

@media (max-width: 1023px) {
  /* Reader root: dvh so the phone address bar doesn't hide the bottom. */
  .rf-reader-root { height: 100vh !important; height: 100dvh !important; }
}
```

- [ ] **Step 4: Run unit test to verify pass**

Run: `npx vitest run tests/components/mobile/SlideOverPanel.test.jsx`
Expected: PASS.

- [ ] **Step 5: Wire into App**

In `src/App.jsx`:

1. Imports (next to the other hook/component imports):
```js
import { useBreakpoint, readBreakpoint } from "./hooks/useBreakpoint";
import { SlideOverPanel } from "./components/mobile";
```
2. Replace `const [panelOpen, setPanelOpen] = useState(true);` with:
```js
  // Desktop starts with the panel open (unchanged). Tablet/phone start closed
  // so the slide-over doesn't cover the text on first load (spec §5.4).
  const [panelOpen, setPanelOpen] = useState(() => readBreakpoint().tier === "desktop");
  const { tier, isTouch } = useBreakpoint();
```
3. Reader root `<div style={{ height: "100vh", overflow: "hidden", … }}>` gets `className="rf-reader-root"` (style unchanged).
4. Replace the SIDEBAR column element with a tier branch. Keep the existing `<div>`'s className and style object byte-for-byte; only the wrapping ternary and the `SlideOverPanel` branch are new:
```jsx
      {/* ── SIDEBAR ── */}
      {tier === "desktop" ? (
        <div className="rf-no-select rf-side-scroll" style={/* existing style object, unchanged */}>
          {panelOpen && sidebarContent}
        </div>
      ) : (
        <SlideOverPanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          width={`min(calc(100vw - 48px), ${SIDEBAR_WIDTH}px)`}
          background={t.bg}
          borderColor={t.border}
        >
          {sidebarContent}
        </SlideOverPanel>
      )}
```

`isTouch` is first used in Task 6 (and only if Task 6 Step 4 is needed). Vite does not fail on unused variables; leave it.

- [ ] **Step 6: Mobile e2e spec (Review Focus 1–3)**

`tests/visual/mobile.spec.js`:
```js
import { test, expect, settle, openDemo, openSidebarSection, expectNoHorizontalOverflow, expectInViewport } from "./fixtures.js";

const TOUCH = { hasTouch: true, isMobile: true };
const panelButton = (page) => page.locator("button:has(svg.lucide-panel-left)").first();

async function openPanelTouch(page) {
  await panelButton(page).click();
  await settle(page, 500);
  await expect(page.locator(".rf-slideover")).toHaveAttribute("data-state", "open");
}

test.describe("tablet 820 slide-over", () => {
  test.use({ viewport: { width: 820, height: 1180 }, ...TOUCH });

  test("panel slides over the text and keeps the toolbar on-screen", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await expect(page.locator(".rf-slideover")).toHaveAttribute("data-state", "closed");
    await openPanelTouch(page);
    await page.getByTestId("slideover-backdrop").click({ position: { x: 800, y: 600 } });
    await settle(page, 300);
    await expect(page.locator(".rf-slideover")).toHaveAttribute("data-state", "closed");
    for (const name of ["NeuroDiv", "HueGuide", "Focus", "Pacer"]) {
      await expectInViewport(page, page.getByRole("button", { name, exact: true }));
    }
    await expectNoHorizontalOverflow(page);
  });

  test("font picker opens above the panel and does not close it", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await openPanelTouch(page);
    await openSidebarSection(page, "Typography");
    await page.locator(".rf-slideover button[aria-haspopup='menu']").first().click();
    await settle(page, 300);
    const option = page.getByRole("menuitem").nth(1);
    await expect(option).toBeVisible();
    await option.click();
    await settle(page, 300);
    await expect(page.locator(".rf-slideover")).toHaveAttribute("data-state", "open");
  });
});

test.describe("phone 390 slide-over", () => {
  test.use({ viewport: { width: 390, height: 844 }, ...TOUCH });

  test("panel starts closed but keeps the upload input mounted", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await expect(page.locator(".rf-slideover")).toHaveAttribute("data-state", "closed");
    await expect(page.locator('.rf-slideover input[type="file"]')).toHaveCount(1);
  });
});

test.describe("tier crossing", () => {
  test("panel state survives 1280 → 820 → 390 → 1280", async ({ app }) => {
    const page = await app();
    await page.setViewportSize({ width: 1280, height: 900 });
    await openDemo(page);
    await panelButton(page).click();
    await settle(page, 500);
    await page.setViewportSize({ width: 820, height: 1180 });
    await settle(page, 300);
    await expect(page.locator(".rf-slideover")).toHaveAttribute("data-state", "open");
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page, 300);
    await expect(page.locator(".rf-slideover")).toHaveAttribute("data-state", "open");
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await settle(page, 300);
    await expect(page.locator(".rf-slideover")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Back to home" })).toBeVisible();
  });
});
```

- [ ] **Step 7: Run e2e and checks**

Run: `npm run test:visual -- --project=mobile && npm test && npm run test:visual -- --project=desktop`
Expected: mobile specs PASS; unit suite passes; desktop 0-pixel diffs.

If the font-picker test fails because the menu renders under the panel, lower the `.rf-slideover`/backdrop z-index further. Never change the picker's inline `zIndex`.

- [ ] **Step 8: Commit**

```bash
git add src/components/mobile src/App.jsx src/styles/responsive.css tests/components/mobile tests/visual/mobile.spec.js
git commit -m "feat: slide-over side panel for tablet and phone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Phone toolbar, Tools popover, compact account button

Spec §6.1.

**Files:**
- Create: `src/components/mobile/ReaderToolsPopover.jsx`, `src/components/mobile/PhoneReaderToolbar.jsx`, `tests/components/mobile/ReaderToolsPopover.test.jsx`, `tests/components/mobile/PhoneReaderToolbar.test.jsx`, `tests/components/UserMenuCompact.test.jsx`
- Modify: `src/components/mobile/index.js`, `src/components/UserMenu.jsx`, `src/App.jsx`, `package.json`, `tests/visual/mobile.spec.js`

**Interfaces:**
- Consumes: `featureItems`, `chapterMenu`, `uncertaintyBadge`, `panelToggleButton`, `renderUserMenu` (Task 3); `tier` (Task 4).
- Produces: `ReaderToolsPopover({ items, t })` where `items` has the `featureItems` shape; `PhoneReaderToolbar({ panelButton, chapterMenu, uncertaintyBadge, tools, userMenu, t })`; `UserMenu` prop `compact?: boolean` (default `false`).

- [ ] **Step 1: Add the dependency**

Run: `npm install @radix-ui/react-popover`
Expected: `package.json` dependencies gains `@radix-ui/react-popover`.

- [ ] **Step 2: Failing tests**

`tests/components/mobile/ReaderToolsPopover.test.jsx`:
```jsx
import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Baseline, Palette, Focus, Gauge } from "lucide-react";
import { ReaderToolsPopover } from "../../../src/components/mobile";
import { THEMES } from "../../../src/config/constants";

const t = THEMES.warm;
const render = (ui) => rtlRender(<Tooltip.Provider>{ui}</Tooltip.Provider>);

const makeItems = () => [
  { label: "NeuroDiv", on: false, Icon: Baseline, onToggle: vi.fn() },
  { label: "HueGuide", on: true, Icon: Palette, onToggle: vi.fn() },
  { label: "Focus", on: false, Icon: Focus, onToggle: vi.fn() },
  { label: "Pacer", on: false, Icon: Gauge, onToggle: vi.fn() },
];

describe("ReaderToolsPopover", () => {
  it("shows the four toggles with labels when opened", () => {
    render(<ReaderToolsPopover items={makeItems()} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "Reader tools" }));
    for (const name of ["NeuroDiv", "HueGuide", "Focus", "Pacer"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
      expect(screen.getByText(name, { selector: "span" })).toBeTruthy();
    }
  });

  it("reflects on/off state", () => {
    render(<ReaderToolsPopover items={makeItems()} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "Reader tools" }));
    expect(screen.getByRole("button", { name: "HueGuide" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Focus" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("calls the same handler it was given", () => {
    const items = makeItems();
    render(<ReaderToolsPopover items={items} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "Reader tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Focus" }));
    expect(items[2].onToggle).toHaveBeenCalledTimes(1);
    expect(items[0].onToggle).not.toHaveBeenCalled();
  });
});
```

`tests/components/mobile/PhoneReaderToolbar.test.jsx`:
```jsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PhoneReaderToolbar } from "../../../src/components/mobile";
import { THEMES } from "../../../src/config/constants";

describe("PhoneReaderToolbar", () => {
  it("renders slots in order: panel, chapter, badge, tools, account", () => {
    const { container } = render(
      <PhoneReaderToolbar
        panelButton={<button>panel</button>}
        chapterMenu={<button>chapter</button>}
        uncertaintyBadge={<span>badge</span>}
        tools={<button>tools</button>}
        userMenu={<button>account</button>}
        t={THEMES.warm}
      />
    );
    const text = [...container.querySelectorAll("button, span")].map((el) => el.textContent);
    expect(text).toEqual(["panel", "chapter", "badge", "tools", "account"]);
    expect(container.firstElementChild.className).toContain("rf-reader-chrome");
  });

  it("tolerates a missing chapter menu (single-section docs)", () => {
    const { container } = render(
      <PhoneReaderToolbar panelButton={<button>panel</button>} chapterMenu={false} uncertaintyBadge={null} tools={<button>tools</button>} userMenu={<button>account</button>} t={THEMES.warm} />
    );
    expect(container.textContent).toBe("paneltoolsaccount");
  });
});
```

`tests/components/UserMenuCompact.test.jsx`:
```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { THEMES } from "../../src/config/constants";

vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, role: null, isOwner: false, signOut: vi.fn() }),
}));
vi.mock("../../src/utils/supabase", () => ({ supabase: {} }));

const { default: UserMenu } = await import("../../src/components/UserMenu");
const renderMenu = (props) => render(<MemoryRouter><UserMenu t={THEMES.warm} onShowAuth={vi.fn()} {...props} /></MemoryRouter>);

describe("UserMenu compact", () => {
  it("default signed-out button shows the Sign in text", () => {
    renderMenu();
    const btn = screen.getByRole("button", { name: "Sign in" });
    expect(btn.textContent).toContain("Sign in");
  });

  it("compact signed-out button is icon-only but still named Sign in", () => {
    renderMenu({ compact: true });
    const btn = screen.getByRole("button", { name: "Sign in" });
    expect(btn.textContent).not.toContain("Sign in");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/components/mobile tests/components/UserMenuCompact.test.jsx`
Expected: FAIL (missing exports; the compact test fails because the text always renders).

- [ ] **Step 4: Implement**

`src/components/mobile/ReaderToolsPopover.jsx`:
```jsx
import * as Popover from "@radix-ui/react-popover";
import { SlidersHorizontal } from "lucide-react";
import FeatureToggleButton from "../FeatureToggleButton";

// Phone-only home for the four reader feature toggles (spec §6.1). Renders
// the same FeatureToggleButton components with the same handlers as the
// desktop top bar; only placement differs. Radix Popover is non-modal by
// default (no <body> pointer-events cost).
export default function ReaderToolsPopover({ items, t }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label="Reader tools"
          className="rf-static"
          style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.icon, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <SlidersHorizontal size={16} strokeWidth={2} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: "0 12px 36px rgba(0,0,0,0.18)", padding: 10, zIndex: 999, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
        >
          {items.map(({ label, on, Icon, onToggle }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FeatureToggleButton on={on} label={label} Icon={Icon} accent={t.accent} iconColor={t.icon} onToggle={onToggle} t={t} />
              <span style={{ fontSize: 13, color: t.fg, fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
            </div>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

`src/components/mobile/PhoneReaderToolbar.jsx`:
```jsx
// Phone (< 768px) reader top bar (spec §6.1):
// [panel] [chapter menu + badge] [tools] [account]. Pure layout: every slot
// is an element built in App and shared with the desktop top bar.
export default function PhoneReaderToolbar({ panelButton, chapterMenu, uncertaintyBadge, tools, userMenu, t }) {
  return (
    <div
      className="rf-reader-chrome rf-phone-toolbar"
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: `1px solid ${t.borderSoft}`, minHeight: 44, background: t.bg }}
    >
      {panelButton}
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
        {chapterMenu}
        {uncertaintyBadge}
      </div>
      {tools}
      {userMenu}
    </div>
  );
}
```

`src/components/mobile/index.js` becomes:
```js
export { default as SlideOverPanel } from "./SlideOverPanel";
export { default as ReaderToolsPopover } from "./ReaderToolsPopover";
export { default as PhoneReaderToolbar } from "./PhoneReaderToolbar";
```

`src/components/UserMenu.jsx`: add `compact = false` to the destructured props (`… isProGrantActive, compact = false }`). In the signed-out branch, add one attribute and change one child; the style object stays exactly as it is:
```jsx
      <button
        onClick={onShowAuth}
        aria-label={compact ? "Sign in" : undefined}
        style={/* existing style object, unchanged */}
      >
        <User size={13} />{!compact && " Sign in"}
      </button>
```
The original children are `<User size={13} /> Sign in`, which produces the text node `" Sign in"` (leading space included). `{!compact && " Sign in"}` renders the identical text node when `compact` is false; the desktop visual suite confirms it.

- [ ] **Step 5: Run unit tests to verify pass**

Run: `npx vitest run tests/components/mobile tests/components/UserMenuCompact.test.jsx`
Expected: PASS.

- [ ] **Step 6: Wire into App**

In `src/App.jsx`:
1. Extend the mobile import: `import { SlideOverPanel, ReaderToolsPopover, PhoneReaderToolbar } from "./components/mobile";`
2. Wrap the existing top bar in a tier branch. The desktop branch is the existing element unchanged except for a new `className="rf-reader-chrome"`:
```jsx
        {/* Top bar */}
        {tier === "phone" ? (
          <PhoneReaderToolbar
            panelButton={panelToggleButton}
            chapterMenu={chapterMenu}
            uncertaintyBadge={uncertaintyBadge}
            tools={<ReaderToolsPopover items={featureItems} t={t} />}
            userMenu={renderUserMenu({ compact: true })}
            t={t}
          />
        ) : (
          <div className="rf-reader-chrome" style={/* existing top-bar style, unchanged */}>
            {/* existing children, unchanged */}
          </div>
        )}
```
On phone the panel button is always shown (the panel overlays; the backdrop covers the button while open).

- [ ] **Step 7: Extend the mobile e2e (Review Focus 5)**

Append to `tests/visual/mobile.spec.js`:
```js
for (const width of [360, 390, 430]) {
  test.describe(`phone ${width} toolbar`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });

    test("every control is on-screen and the chapter title truncates", async ({ app }) => {
      const page = await app();
      await openDemo(page);
      await expect(page.locator(".rf-phone-toolbar")).toBeVisible();
      await expectInViewport(page, page.getByRole("button", { name: "Reader tools" }));
      await expectInViewport(page, page.getByRole("button", { name: "Sign in" }));
      await expectInViewport(page, page.getByRole("button", { name: /chapter 1/i }));
      await expectNoHorizontalOverflow(page);
    });

    test("tools popover toggles a feature", async ({ app }) => {
      const page = await app();
      await openDemo(page);
      await page.getByRole("button", { name: "Reader tools" }).click();
      await settle(page, 300);
      const focus = page.getByRole("button", { name: "Focus", exact: true });
      await expect(focus).toHaveAttribute("aria-pressed", "false");
      await focus.click();
      await settle(page, 300);
      await expect(focus).toHaveAttribute("aria-pressed", "true");
    });
  });
}
```

- [ ] **Step 8: Full checks**

Run: `npm test && npm run test:visual`
Expected: unit tests and both Playwright projects pass; desktop 0-pixel diffs.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/components/mobile src/components/UserMenu.jsx src/App.jsx tests/components/mobile tests/components/UserMenuCompact.test.jsx tests/visual/mobile.spec.js
git commit -m "feat: phone reader toolbar with tools popover and compact account button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Touch additions: tap targets, pacer bar, reading guide by tap

Spec §6.3–§6.5. No edits to `usePacer.js`, the reading-guide hook, or `ReadingGuideOverlay.jsx`.

**Files:**
- Modify: `src/styles/responsive.css`, `tests/visual/mobile.spec.js`
- Modify only if Step 3's guide test fails: `src/App.jsx`

**Interfaces:**
- Consumes: `.rf-reader-chrome` (Task 5), `isTouch` (Task 4), the existing `guide` object, `guideMode`, `setShowGuide`, `readerRef`.

- [ ] **Step 1: Write the e2e tests (Review Focus 4 + guide by tap)**

Append to `tests/visual/mobile.spec.js`:
```js
test.describe("touch targets", () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });

  test("tablet touch controls are at least 44px", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    const box = await page.getByRole("button", { name: "Focus", exact: true }).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("iPad landscape 1024 touch", () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });

  test("desktop toolbar keeps every control on-screen with the panel open", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await page.locator("button:has(svg.lucide-panel-left)").first().click();
    await settle(page, 500);
    for (const name of ["NeuroDiv", "HueGuide", "Focus", "Pacer"]) {
      await expectInViewport(page, page.getByRole("button", { name, exact: true }));
    }
    await expectInViewport(page, page.getByRole("button", { name: "Sign in" }));
  });
});

test.describe("reading guide by tap (phone)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("tapping a line places the highlight guide there", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await page.locator("button:has(svg.lucide-panel-left)").first().click();
    await settle(page, 500);
    await openSidebarSection(page, "Reading Guide");
    await page.locator(".rf-slideover").getByRole("radio").nth(1).click();
    await page.getByTestId("slideover-backdrop").click({ position: { x: 380, y: 400 } });
    await settle(page, 300);
    await page.locator(".rf-reader-scroll").tap({ position: { x: 150, y: 300 } });
    await settle(page, 200);
    const guide = await page.evaluate(() => {
      const el = document.querySelector(".rf-reader-scroll")?.firstElementChild;
      return el ? { pe: el.style.pointerEvents, transform: el.style.transform } : null;
    });
    expect(guide?.pe).toBe("none");
    expect(guide?.transform).toContain("translateY");
  });

  test("pacer bar sits fully on-screen", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await page.getByRole("button", { name: "Reader tools" }).click();
    await settle(page, 300);
    await page.getByRole("button", { name: "Pacer", exact: true }).click();
    await page.keyboard.press("Escape");
    await settle(page, 300);
    const bar = page.getByRole("toolbar", { name: "Pacer controls" });
    const box = await bar.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await expectInViewport(page, bar);
  });
});
```

- [ ] **Step 2: Add the CSS**

Append to `src/styles/responsive.css`:
```css
/* ── Touch targets (spec §6.5). Only below 1024px: at iPad-landscape width the
   desktop toolbar already needs ~1011px with the panel open, so bigger
   targets there would push controls off-screen. ── */
@media (pointer: coarse) and (max-width: 1023px) {
  .rf-reader-chrome button,
  [aria-label="Pacer controls"] button {
    min-width: 44px;
    min-height: 44px;
  }
}

/* ── Notch / home indicator (tablet + phone). env() is 0 outside notched,
   installed contexts, so these are no-ops in a normal browser tab. ── */
@media (max-width: 1023px) {
  .rf-reader-chrome {
    padding-top: calc(8px + env(safe-area-inset-top)) !important;
  }
  .rf-phone-toolbar {
    padding-top: calc(6px + env(safe-area-inset-top)) !important;
  }
  [aria-label="Pacer controls"] {
    padding-bottom: calc(6px + env(safe-area-inset-bottom)) !important;
  }
}
```

- [ ] **Step 3: Run the e2e**

Run: `npm run test:visual -- --project=mobile`
Expected: the touch-target, iPad, and pacer-bar tests PASS.

For the guide-by-tap test, **either outcome is informative**:
- **PASS:** mobile browsers already send a compatibility `mousemove` on tap, so the existing `onMouseMove` handler places the guide. No App change is needed. Say so in the commit body and skip to Step 5.
- **FAIL:** do Step 4.

- [ ] **Step 4 (only if Step 3's guide test failed): touch branch in the reader click handler**

In `src/App.jsx`, directly after the line that creates the reading guide (`const guide = useReadingGuide(…)`), add:
```jsx
  // Touch: tapping a line places the reading guide there (spec §6.5). Mouse
  // clicks skip the branch, so desktop behavior is unchanged; the pacer's
  // click handling runs for every click exactly as before.
  const handleReaderClick = useCallback((e) => {
    pacer.handleReaderClick(e);
    if (guideMode === "none") return;
    const pointerType = e.nativeEvent?.pointerType;
    const fromTouch = pointerType ? pointerType === "touch" : isTouch;
    if (!fromTouch) return;
    guide.handleMouseMove({ clientY: e.clientY }, readerRef.current);
    setShowGuide(true);
  }, [pacer.handleReaderClick, guideMode, isTouch, guide.handleMouseMove]);
```
Hooks must run before every early `return` in `App`; `guide` is created above them, so placing this directly after it satisfies the rule (confirm with the build). Then change the reader scroll area's `onClick={pacer.handleReaderClick}` to `onClick={handleReaderClick}`.

Re-run: `npm run test:visual -- --project=mobile`
Expected: PASS.

- [ ] **Step 5: Full checks**

Run: `npm test && npm run test:visual`
Expected: all pass; desktop 0-pixel diffs.

- [ ] **Step 6: Commit**

```bash
git add src/styles/responsive.css tests/visual/mobile.spec.js src/App.jsx
git commit -m "feat: touch targets, safe-area insets, reading guide by tap

<one line: guide worked via compat mousemove (no App change), or touch click branch added>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Landing page phone layout

Spec §7.1. className hooks only; no inline style edits.

**Files:**
- Modify: `src/App.jsx` (landing view), `src/components/LibraryTeaseSection.jsx`, `src/components/LibrarySection.jsx`, `src/styles/responsive.css`, `tests/visual/mobile.spec.js`

- [ ] **Step 1: Failing e2e**

Append to `tests/visual/mobile.spec.js`:
```js
for (const width of [360, 390, 430]) {
  test.describe(`landing phone ${width}`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });

    for (const signedIn of [false, true]) {
      test(`no sideways scroll (${signedIn ? "signed in" : "signed out"})`, async ({ app }) => {
        const page = await app({ signedIn });
        await expectNoHorizontalOverflow(page);
        const cards = page.locator(".tmt-m-cards");
        await expect(cards).toHaveCount(1);
        const columns = await cards.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
        expect(columns).toBe(1);
      });
    }
  });
}
```

Run: `npm run test:visual -- --project=mobile -g "landing phone"`
Expected: FAIL (no `.tmt-m-cards` yet; overflow at 360).

- [ ] **Step 2: Add className hooks**

In `src/App.jsx` landing view (attribute additions only):
- Landing root `<div className="tmt-marketing" …>` → `className="tmt-marketing tmt-m-landing"`.
- Top-right `<div style={{ position: "fixed", top: 14, right: 16, zIndex: 100 }}>` → add `className="tmt-m-topright"`.
- Signed-in library `<section style={{ … padding: "100px 24px 60px" … }}>` → add `className="tmt-m-section"`.
- Conditions `<section style={{ … padding: "100px 24px 60px" … }}>` → add `className="tmt-m-section"`.
- Conditions header `<div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", … }}>` → add `className="tmt-m-stack"`.
- Conditions cards `<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", … }}>` → add `className="tmt-m-cards"`.
- Quote/CTA `<section style={{ … padding: "120px 24px 100px" … }}>` → add `className="tmt-m-section"`.

In `src/components/LibraryTeaseSection.jsx`:
- Outer `<section aria-labelledby="tmt-tease-heading" …>` → add `className="tmt-m-section"`.
- Header `<div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", … }}>` → add `className="tmt-m-stack"`.
- Spine row `<div style={{ position: "relative", display: "flex", alignItems: "flex-end", … minHeight: 220 … }}>` → add `className="tmt-m-shelf"`.

In `src/components/LibrarySection.jsx`:
- The element whose style has `gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)"` → add `className="tmt-m-stack"`.

- [ ] **Step 3: Phone CSS**

Append to `src/styles/responsive.css`:
```css
/* ── Landing page, phone (spec §7.1). Tablet already renders correctly. ── */
@media (max-width: 767px) {
  .tmt-m-section { padding: 64px 16px 40px !important; }
  .tmt-m-stack {
    grid-template-columns: 1fr !important;
    gap: 20px !important;
    margin-bottom: 32px !important;
  }
  .tmt-m-cards { grid-template-columns: 1fr !important; }
  .tmt-m-shelf { gap: 2px !important; padding: 0 !important; }
  .tmt-m-shelf > * { flex-shrink: 1 !important; min-width: 0 !important; }
}

/* Installed (standalone) mode: keep the landing and its sign-in button out
   from under the status bar. env() is 0 in a normal tab. */
@media (max-width: 1023px) {
  .tmt-m-landing { padding-top: env(safe-area-inset-top); }
  .tmt-m-topright { top: calc(14px + env(safe-area-inset-top)) !important; }
}
```

- [ ] **Step 4: Run e2e to verify pass**

Run: `npm run test:visual -- --project=mobile -g "landing phone"`
Expected: PASS. If a section still overflows at 360, find the offender with
`page.evaluate(() => [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > innerWidth).map(e => e.className || e.tagName))`,
give it a hook plus a phone rule, and re-run.

- [ ] **Step 5: Full checks**

Run: `npm test && npm run test:visual`
Expected: all pass; desktop 0-pixel diffs (the new classes have no base rules).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/components/LibraryTeaseSection.jsx src/components/LibrarySection.jsx src/styles/responsive.css tests/visual/mobile.spec.js
git commit -m "feat: phone layout for the landing page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Dialogs, library drawer, toasts, pages

Spec §7.2, §7.3. className hooks only.

**Files:**
- Modify (all in `src/components/`): `AuthModal.jsx`, `PricingModal.jsx`, `PaywallModal.jsx`, `SubscriptionModal.jsx`, `CheckoutModal.jsx`, `ContactModal.jsx`, `DeleteAccountModal.jsx`, `AvatarSettingsModal.jsx`, `EditChaptersModal.jsx`, `LibraryDrawer.jsx`, `Toast.jsx`, `LegalLayout.jsx`
- Modify: `src/pages/Account.jsx`, `src/styles/responsive.css`, `tests/visual/mobile.spec.js`
- Create: `tests/components/mobileHooks.test.jsx`

- [ ] **Step 1: Failing component test (pins hooks on dialogs the e2e can't reach)**

`tests/components/mobileHooks.test.jsx`:
```jsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { THEMES } from "../../src/config/constants";

vi.mock("../../src/utils/supabase", () => ({
  supabase: { auth: { getSession: () => new Promise(() => {}) }, from: () => ({}) },
}));
vi.mock("../../src/utils/track", () => ({ track: vi.fn() }));

const t = THEMES.warm;
const dialog = () => document.querySelector('[role="dialog"]');

describe("phone className hooks on dialogs", () => {
  it("PaywallModal", async () => {
    const { default: PaywallModal } = await import("../../src/components/PaywallModal");
    render(<PaywallModal uploadsUsed={3} onUpgrade={vi.fn()} onClose={vi.fn()} t={t} />);
    expect(dialog().className).toContain("tmt-m-dialog");
  });

  it("CheckoutModal", async () => {
    const { default: CheckoutModal } = await import("../../src/components/CheckoutModal");
    render(<CheckoutModal billing="monthly" onClose={vi.fn()} t={t} />);
    expect(dialog().className).toContain("tmt-m-dialog");
  });

  it("EditChaptersModal is full-screen on phone", async () => {
    const { default: EditChaptersModal } = await import("../../src/components/EditChaptersModal");
    render(
      <EditChaptersModal open onClose={vi.fn()} t={t} userId="u" docId="d"
        docSections={[{ type: "chapter", title: "One", number: 1, content: "Para one.\n\nPara two." }]}
        initialBreaks={null} initialTitles={null} onSaved={vi.fn()} />
    );
    expect(dialog().className).toContain("tmt-m-dialog-full");
  });
});
```

Run: `npx vitest run tests/components/mobileHooks.test.jsx`
Expected: FAIL (classes missing).

- [ ] **Step 2: Add className hooks**

Change each `Dialog.Content`'s `className="tmt-marketing"` (attribute only; apply to every `Dialog.Content` in the file):

| File | New className |
| --- | --- |
| `AuthModal.jsx`, `PricingModal.jsx`, `PaywallModal.jsx`, `SubscriptionModal.jsx`, `CheckoutModal.jsx`, `ContactModal.jsx`, `DeleteAccountModal.jsx`, `AvatarSettingsModal.jsx` | `"tmt-marketing tmt-m-dialog"` |
| `EditChaptersModal.jsx`, `LibraryDrawer.jsx` | `"tmt-marketing tmt-m-dialog-full"` |

Also:
- `PricingModal.jsx`: the plan-cards `<div style={{ padding: "18px 36px 22px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>` → add `className="tmt-m-plans"`.
- `Toast.jsx`: `<RadixToast.Viewport style={…}>` → add `className="tmt-m-toasts"`.
- `LegalLayout.jsx`: the top `<header style={{ … padding: "16px 28px" … }}>` → add `className="tmt-m-page-header"`.
- `src/pages/Account.jsx`: the top `<header style={{ … padding: "16px 24px" … }}>` → add `className="tmt-m-page-header"`.

- [ ] **Step 3: Phone/tablet CSS**

Append to `src/styles/responsive.css`:
```css
/* ── Dialogs (spec §7.2) ── */
@media (max-width: 767px) {
  .tmt-m-dialog {
    max-height: calc(100dvh - 32px) !important;
    overflow-y: auto !important;
  }
  .tmt-m-dialog-full {
    top: 0 !important; left: 0 !important; transform: none !important;
    width: 100vw !important; max-width: none !important;
    height: 100dvh !important; max-height: none !important;
    border-radius: 0 !important;
    padding-top: env(safe-area-inset-top) !important;
    padding-bottom: env(safe-area-inset-bottom) !important;
    box-sizing: border-box !important;
  }
  .tmt-m-plans {
    grid-template-columns: 1fr !important;
    padding-left: 16px !important;
    padding-right: 16px !important;
  }
}

/* ── Toasts and page headers: clear the notch when installed (spec §7.3) ── */
@media (max-width: 1023px) {
  .tmt-m-toasts { top: calc(24px + env(safe-area-inset-top)) !important; }
  .tmt-m-page-header { padding-top: calc(16px + env(safe-area-inset-top)) !important; }
}
```

- [ ] **Step 4: Phone e2e for reachable dialogs and pages**

Append to `tests/visual/mobile.spec.js`:
```js
test.describe("phone 360 dialogs and pages", () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  test("pricing plans stack and fit", async ({ app }) => {
    const page = await app();
    await page.getByRole("button", { name: /see pro plans/i }).click();
    await settle(page);
    const cols = await page.locator(".tmt-m-plans").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(cols).toBe(1);
    await expectInViewport(page, page.locator(".tmt-m-dialog"));
  });

  for (const [name, open] of [
    ["auth", (p) => p.getByRole("button", { name: "Sign in" }).click()],
    ["contact", (p) => p.getByText("Contact", { exact: true }).click()],
  ]) {
    test(`${name} dialog fits`, async ({ app }) => {
      const page = await app();
      await open(page);
      await settle(page);
      const dialog = page.locator(".tmt-m-dialog");
      await expectInViewport(page, dialog);
      const box = await dialog.boundingBox();
      expect(box.height).toBeLessThanOrEqual(780);
    });
  }

  test("library drawer is full-screen", async ({ app }) => {
    const page = await app({ signedIn: true });
    await openDemo(page);
    await page.locator("button:has(svg.lucide-panel-left)").first().click();
    await settle(page, 500);
    await page.getByRole("button", { name: /browse the library/i }).click();
    await settle(page);
    const box = await page.locator(".tmt-m-dialog-full").boundingBox();
    expect(box.x).toBe(0);
    expect(box.width).toBe(360);
  });

  for (const path of ["/privacy", "/terms"]) {
    test(`page ${path} has no sideways scroll`, async ({ app }) => {
      const page = await app({ path });
      await expectNoHorizontalOverflow(page);
    });
  }

  test("page /account has no sideways scroll", async ({ app }) => {
    const page = await app({ signedIn: true, path: "/account" });
    await expectNoHorizontalOverflow(page);
  });
});
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/components/mobileHooks.test.jsx && npm run test:visual -- --project=mobile`
Expected: PASS.

- [ ] **Step 6: Full checks**

Run: `npm test && npm run test:visual`
Expected: all pass; desktop 0-pixel diffs.

- [ ] **Step 7: Commit**

```bash
git add src/components src/pages/Account.jsx src/styles/responsive.css tests/components/mobileHooks.test.jsx tests/visual/mobile.spec.js
git commit -m "feat: phone layout for dialogs, library drawer, toasts, and pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Home-screen install

Spec §8.

**Files:**
- Create: `scripts/generate-icons.mjs`, `public/icons/apple-touch-icon-180.png`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `tests/config/installability.test.js`
- Modify: `public/manifest.webmanifest`, `index.html`

- [ ] **Step 1: Failing test**

`tests/config/installability.test.js`:
```js
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
const html = readFileSync("index.html", "utf8");
const icon = (purpose, size) => manifest.icons.find((i) => i.purpose === purpose && i.sizes === size);

describe("home-screen install", () => {
  it("manifest lists PNG icons with separate any/maskable purposes", () => {
    expect(icon("any", "192x192")?.src).toBe("/icons/icon-192.png");
    expect(icon("any", "512x512")?.src).toBe("/icons/icon-512.png");
    expect(icon("maskable", "512x512")?.src).toBe("/icons/icon-maskable-512.png");
    expect(manifest.icons.some((i) => i.purpose === "any maskable")).toBe(false);
  });

  it("every manifest icon file exists", () => {
    for (const { src } of manifest.icons) expect(existsSync(`public${src}`)).toBe(true);
  });

  it("manifest keeps standalone display and adds id/scope", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.id).toBe("/");
    expect(manifest.scope).toBe("/");
  });

  it("index.html has the iOS install tags and viewport-fit", () => {
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />');
    expect(html).toContain('name="apple-mobile-web-app-title" content="TailorMyText"');
    expect(html).toContain('name="apple-mobile-web-app-status-bar-style" content="default"');
    expect(html).toContain('name="mobile-web-app-capable" content="yes"');
    expect(html).toContain("viewport-fit=cover");
    expect(existsSync("public/icons/apple-touch-icon-180.png")).toBe(true);
  });
});
```

Run: `npx vitest run tests/config/installability.test.js`
Expected: FAIL.

- [ ] **Step 2: Icon script**

`scripts/generate-icons.mjs`:
```js
// One-time rasterizer: public/favicon.svg → public/icons/*.png for
// home-screen install (spec §8). Re-run with `npm run icons` if the logo
// changes. Uses Playwright's Chromium (already a dev dependency).
import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const svg = await readFile(new URL("public/favicon.svg", root), "utf8");
const outDir = new URL("public/icons/", root);
const BG = "#FDFAF5";

// pad = fraction of the side left empty on each edge. Maskable icons keep the
// logo inside the central safe circle (radius 40%): pad 0.22. iOS fills
// transparency with black, so its icon gets the paper background.
const ICONS = [
  { file: "apple-touch-icon-180.png", size: 180, pad: 0.1, bg: BG },
  { file: "icon-192.png", size: 192, pad: 0, bg: null },
  { file: "icon-512.png", size: 512, pad: 0, bg: null },
  { file: "icon-maskable-512.png", size: 512, pad: 0.22, bg: BG },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

for (const { file, size, pad, bg } of ICONS) {
  const inner = Math.round(size * (1 - pad * 2));
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${bg ?? "transparent"}">` +
    `<img src="${dataUrl}" width="${inner}" height="${inner}"></body></html>`
  );
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({ path: fileURLToPath(new URL(file, outDir)), omitBackground: !bg });
  console.log(`wrote public/icons/${file}`);
}
await browser.close();
```

Run: `npm run icons`
Expected: four `wrote public/icons/…` lines. Open each PNG and confirm the logo is centered and uncropped; the maskable one has visible padding.

- [ ] **Step 3: Manifest and meta tags**

`public/manifest.webmanifest`:
```json
{
  "id": "/",
  "name": "TailorMyText — Adaptive Reading Enhancement",
  "short_name": "TailorMyText",
  "description": "A reader for documents that adapts to the way you read — typography, themes, and visual aids that make long-form text easier on every kind of brain.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#FDFAF5",
  "theme_color": "#A85E14",
  "icons": [
    { "src": "/icons/icon-192.png", "type": "image/png", "sizes": "192x192", "purpose": "any" },
    { "src": "/icons/icon-512.png", "type": "image/png", "sizes": "512x512", "purpose": "any" },
    { "src": "/icons/icon-maskable-512.png", "type": "image/png", "sizes": "512x512", "purpose": "maskable" }
  ]
}
```

In `index.html`, replace `<link rel="apple-touch-icon" href="/favicon.svg" />` with:
```html
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />
```
and directly under `<!-- PWA install -->` (above the manifest link) add:
```html
    <meta name="apple-mobile-web-app-title" content="TailorMyText" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="mobile-web-app-capable" content="yes" />
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/config/installability.test.js`
Expected: PASS.

- [ ] **Step 5: Full checks**

Run: `npm test && npm run test:visual`
Expected: all pass; desktop 0-pixel diffs (head tags don't render).

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-icons.mjs public/icons public/manifest.webmanifest index.html tests/config/installability.test.js
git commit -m "feat: home-screen install icons, manifest, and iOS meta tags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Full phone/tablet sweep, docs, preview, device checklist, PR

Spec §9.5, §9.6, §10 step 7.

**Files:**
- Modify: `tests/visual/mobile.spec.js`, `CLAUDE.md`

- [ ] **Step 1: Sweep test with owner screenshots**

Append to `tests/visual/mobile.spec.js`:
```js
// Spec §9.5 viewport sweep. Assertion: no sideways scroll on each surface.
// Screenshots go to test-results/owner-review/ for the owner to eyeball;
// they are not compared.
const SWEEP = [[360, 780], [390, 844], [430, 932], [844, 390], [744, 1133], [820, 1180], [1024, 768]];
const SURFACES = [
  ["landing", async () => {}],
  ["reader", async (page) => { await openDemo(page); }],
  ["pricing", async (page) => { await page.getByRole("button", { name: /see pro plans/i }).click(); await settle(page); }],
];

for (const [w, h] of SWEEP) {
  test.describe(`sweep ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    for (const [name, open] of SURFACES) {
      test(name, async ({ app }) => {
        const page = await app();
        await open(page);
        await expectNoHorizontalOverflow(page);
        await page.screenshot({ path: `test-results/owner-review/${name}-${w}x${h}.png`, fullPage: name === "landing" });
      });
    }
  });
}
```

Run: `npm run test:visual -- --project=mobile -g sweep`
Expected: all PASS; 21 PNGs in `test-results/owner-review/`. Look at every one and fix any visual problem (hook + phone rule), re-running the full checks after each fix.

- [ ] **Step 2: Document the responsive layer in CLAUDE.md**

Add a section after "### Component Exports" in `CLAUDE.md`:
```markdown
### Responsive layout (phone / tablet)

- Tiers live in `src/config/breakpoints.js`: phone < 768, tablet 768–1023, desktop ≥ 1024; touch = `(pointer: coarse)`. `useBreakpoint()` returns `{ tier, isTouch }` and only re-renders when a boundary is crossed.
- Desktop must render identically: phone/tablet CSS lives only in media queries in `src/styles/responsive.css`, attached via `tmt-m-*` / `rf-*` className hooks (no base rules). `!important` there only beats existing inline styles.
- Reader: `sidebarContent`, `chapterMenu`, `featureItems`/`featureToggles`, `renderUserMenu` are JSX variables in `App` shared by the desktop layout, `SlideOverPanel` (tablet/phone), and `PhoneReaderToolbar` (phone). The slide-over is intentionally not a Radix modal (body pointer-events cost on big books) and stays mounted when closed (the file input lives inside it).
- Verify with `npm run test:visual`: the `desktop` project compares against committed baselines with zero pixel tolerance; the `mobile` project runs phone/tablet e2e. Supabase is faked (`.env.visual`, `tests/visual/fixtures.js`).
```

Commit:
```bash
git add tests/visual/mobile.spec.js CLAUDE.md
git commit -m "test: phone/tablet viewport sweep; docs: responsive layer in CLAUDE.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Final verification**

Run: `npx vite build && npm test && npm run test:visual`
Expected: build OK; unit suite passes (count ≥ Task 1 record + the new tests); desktop 0-pixel diffs; mobile all PASS.

- [ ] **Step 4: Push the branch for the preview**

Ask the owner before pushing. On approval:
```bash
git push -u origin feat/responsive-mobile
```
Then confirm the Cloudflare check run on the pushed commit succeeded and serves `https://feat-responsive-mobile.tailormytext.pages.dev`:
```bash
gh api repos/doosemavis/tailormytext/commits/$(git rev-parse HEAD)/check-runs --jq '.check_runs[] | select(.name == "Cloudflare Pages") | .conclusion'
```
Expected: `success`.

- [ ] **Step 5: Hand the owner the device checklist (spec §9.6)**

Send the preview URL plus the checklist from spec §9.6, and remind them: sign-in on the preview needs `https://*.tailormytext.pages.dev/*` in Supabase → Authentication → URL Configuration → Redirect URLs, and never complete a purchase on a preview. **Stop and wait** for their results. Fix anything they report (each fix: failing test first, then the fix, full checks, commit, push).

- [ ] **Step 6: Open the PR to production (only after the owner signs off on the checklist)**

```bash
gh pr create --base production --head feat/responsive-mobile \
  --title "feat: responsive phone & tablet layout + home-screen install" \
  --body "$(cat <<'EOF'
## Summary
Phase 1 of the mobile path (spec: docs/superpowers/specs/2026-09-26-responsive-mobile-design.md).
- Phone (< 768px): compact reader toolbar with a Tools popover, slide-over side panel, one-column landing, fitted dialogs.
- Tablet (768–1023px): desktop toolbar; side panel slides over the text (fixes controls clipping when the panel was open).
- Touch: 44px targets below 1024px, tap-to-place reading guide, safe-area insets.
- Home-screen install: PNG icons (incl. maskable), manifest id/scope, iOS meta tags.
- No feature behavior changes; desktop is pixel-identical to the pre-change baseline.

## Test plan
- [x] `npm test`: unit suite passes (existing tests untouched)
- [x] `npm run test:visual -- --project=desktop`: 0-pixel diffs at 1024/1280/1440 across landing, reader states, dialogs, pages
- [x] `npm run test:visual -- --project=mobile`: phone/tablet e2e + viewport sweep
- [x] Owner device checklist on iPhone Safari + Android Chrome (spec §9.6)
- [ ] After deploy: tailormytext.com on a phone shows the phone toolbar; Add to Home Screen shows the new icon

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Give the owner the PR link. Do not merge; the owner merges.
