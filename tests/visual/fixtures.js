import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

// Google Fonts is not deterministic. For the same css2 URL it usually serves
// static /s/<family>/vNN/*.woff2 files, but a few percent of responses point
// every variable-axis family (Literata, DM Sans, Fraunces, Newsreader, ...) at
// dynamically built /l/font?kit=... files instead: different binaries, so text
// across the whole page rasterizes slightly differently (the intermittent
// "uniform text ghosting" diffs). Serve a pinned snapshot of the static answer
// (tests/visual/fonts/, refreshed by fetch-google-fonts.mjs) and fail the test
// on any Google Fonts request the snapshot cannot answer.
const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fonts");
const FONT_SOURCE = JSON.parse(fs.readFileSync(path.join(FONT_DIR, "source.json"), "utf8"));
const FONT_CSS = fs.readFileSync(path.join(FONT_DIR, "google-fonts.css"), "utf8");
const REFRESH_HINT = "run `node tests/visual/fonts/fetch-google-fonts.mjs`, then regenerate desktop baselines";

async function pinGoogleFonts(context, errors) {
  await context.route("https://fonts.googleapis.com/**", (route) => {
    const url = route.request().url();
    if (url !== FONT_SOURCE.cssUrl) {
      errors.push(`Unpinned Google Fonts stylesheet ${url}; ${REFRESH_HINT}`);
      return route.abort();
    }
    return route.fulfill({ body: FONT_CSS, contentType: "text/css; charset=utf-8" });
  });
  await context.route("https://fonts.gstatic.com/**", (route) => {
    const url = route.request().url();
    const file = path.join(FONT_DIR, new URL(url).pathname);
    if (!file.startsWith(FONT_DIR + path.sep) || !fs.existsSync(file)) {
      errors.push(`Unpinned font file ${url}; ${REFRESH_HINT}`);
      return route.abort();
    }
    return route.fulfill({ path: file, contentType: "font/woff2", headers: { "Access-Control-Allow-Origin": "*" } });
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

// IntersectionObserver callbacks arrive in *real* time (the browser's rendering
// step), but what they start — DiaTextReveal's gradient sweep — runs on the
// *fake* clock's requestAnimationFrame. clock.runFor() yields a real macrotask
// after every fake timer it fires, so an IO callback could land at any fake
// time inside a runFor and the sweep froze at a run-dependent position (the
// intermittent 0.01-ratio diffs). Hold every page observer's callbacks and
// deliver them only at settle() flush points, so observer-driven work always
// starts at the same fake time. Must be installed before the page's scripts.
function holdIntersectionObservers() {
  const RealIO = window.IntersectionObserver;
  if (!RealIO || window.__visualFlushIO) return;
  const pending = [];
  class HeldIntersectionObserver extends RealIO {
    constructor(callback, options) {
      let self = null;
      super((entries) => pending.push({ observer: self, callback, entries }), options);
      self = this;
      this.__live = true;
    }
    disconnect() { this.__live = false; super.disconnect(); }
    observe(target) { this.__live = true; super.observe(target); }
  }
  window.IntersectionObserver = HeldIntersectionObserver;

  // A fresh *real* observer's first callback fires in the next rendering
  // update, after the app's observers (notified in creation order). rAF is
  // faked by the clock, so this is the real-frame barrier.
  const nextFrame = () => new Promise((resolve) => {
    const io = new RealIO(() => { io.disconnect(); resolve(); });
    io.observe(document.documentElement);
  });
  // React's scheduler (render + passive effects) runs on MessageChannel tasks,
  // which the fake clock does not control.
  const macrotask = () => new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(0);
  });
  const MAX_ROUNDS = 10;
  const DRAIN_TASKS = 5;
  // Each round: let pending React work finish (it may create observers), then
  // wait two real frames — an observer created after the first barrier would
  // be notified after it within the same update, so the second barrier
  // guarantees every observer that exists now has had its callback queued.
  window.__visualFlushIO = async () => {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      for (let i = 0; i < DRAIN_TASKS; i++) await macrotask();
      await nextFrame();
      await nextFrame();
      if (pending.length === 0) return;
      for (const { observer, callback, entries } of pending.splice(0)) {
        if (observer && observer.__live) callback.call(observer, entries, observer);
      }
    }
    throw new Error("IntersectionObserver callbacks did not settle");
  };
}

async function flushObservers(page) {
  await page.evaluate(() => window.__visualFlushIO?.());
}

// CSS transitions/animations run in real time, not on the fake clock. JS that
// measures layout mid-transition (e.g. the reading guide reads the reader's
// left edge on mousemove while the side panel is still widening) would bake
// a run-dependent frame into the page. Jump finite ones to their end state —
// what toHaveScreenshot's animations:"disabled" does, but before the next
// interaction instead of only at capture. Infinite ones are left alone.
async function finishAnimations(page) {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      const end = animation.effect?.getComputedTiming().endTime;
      if (Number.isFinite(end)) animation.finish();
    }
  });
}

// Bring real-time work to a fixed point: finish CSS motion, deliver held
// observer callbacks (letting animationend/transitionend handlers and React
// commit), then finish anything that started as a result.
async function quiesce(page) {
  await finishAnimations(page);
  await flushObservers(page);
  await finishAnimations(page);
}

// Quiesce, advance fake time so setTimeout/rAF-driven UI (loader fade, dialog
// mount, reveal sweeps) completes, quiesce whatever that started, then wait
// for web fonts.
export async function settle(page, ms = 2000) {
  await quiesce(page);
  await page.clock.runFor(ms);
  await quiesce(page);
  await page.evaluate(() => document.fonts.ready);
}

export const test = base.extend({
  context: async ({ context }, use) => {
    const fontErrors = [];
    await pinGoogleFonts(context, fontErrors);
    await use(context);
    if (fontErrors.length) throw new Error(`Font requests outside the pinned snapshot:\n${fontErrors.join("\n")}`);
  },
  app: async ({ page }, use) => {
    await use(async ({ signedIn = false, path = "/" } = {}) => {
      await mockSupabase(page, { signedIn });
      await page.addInitScript(holdIntersectionObservers);
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

// Reader toolbar's panel toggle.
export const panelButton = (page) => page.getByRole("button", { name: "Open panel", exact: true });

export async function openPanelDesktop(page) {
  await panelButton(page).click();
  await settle(page, 500);
}

// The reader side panel at every tier: the fixed sidebar column at desktop,
// the slide-over <aside> below 1024. Both (and only they, while no Edit
// Chapters dialog is open) carry .rf-side-scroll. Scoping matters: at the
// tablet tier and at 1024 the toolbar's "Pacer" toggle has the same
// accessible name as the panel's "Pacer" section header.
export const readerPanel = (page) => page.locator(".rf-side-scroll").first();

export async function openPanelSection(page, title) {
  await readerPanel(page).getByRole("button", { name: title, exact: true }).click();
  await settle(page, 500);
}

export async function openUserMenuItem(page, item) {
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
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
