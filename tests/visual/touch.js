// Touch/panel helpers shared by the mobile-project specs (mobile.spec.js,
// mobile-panel-touch.spec.js). Generic harness pieces (fake clock, fonts,
// fake Supabase, settle) live in fixtures.js.
import { expect, settle, panelButton } from "./fixtures.js";

// Playwright context options for a touch phone/tablet.
export const TOUCH = { hasTouch: true, isMobile: true };

// Opens the tablet/phone slide-over via its toolbar toggle and waits for it.
export async function openPanelTouch(page) {
  await panelButton(page).click();
  await settle(page, 500);
  await expect(page.locator(".rf-slideover")).toHaveAttribute("data-state", "open");
}

export async function panelScrollTop(page) {
  return page.locator(".rf-slideover").evaluate((el) => el.scrollTop);
}

// ── Real input gestures through Chromium's pipeline (CDP) ──────────────────
// These drive the same input path as a finger, not JS scrollTo or synthetic
// DOM events. Each call gets its own session and always detaches it.
async function withCDP(page, fn) {
  const session = await page.context().newCDPSession(page);
  try {
    return await fn(session);
  } finally {
    await session.detach();
  }
}

// Scrolls via a synthesized touch scroll gesture starting at (x, y). Per this
// CDP call's semantics, a negative yDistance scrolls content down (scrollTop
// increases).
export async function touchSwipeUp(page, x, y, distance = 160) {
  await withCDP(page, (session) => session.send("Input.synthesizeScrollGesture", {
    x, y, xDistance: 0, yDistance: -distance,
    gestureSourceType: "touch", speed: 400, preventFling: true,
  }));
}

// Drags a point sideways via raw touch events, for interactions (like
// grabbing a slider thumb) that must be recognized as a drag, not a scroll
// gesture picked up by the compositor.
export async function touchDragHorizontal(page, x0, y, x1, steps = 6) {
  await withCDP(page, async (session) => {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
    for (let i = 1; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  });
}

// ── Panel hit-box measurement (Task 11) ─────────────────────────────────────
export const PANEL_TOUCH_MIN = 44;
export const PANEL_TOUCH_TOLERANCE = 0.5;
// A slider's effective touch target is its THUMB's hit area (the root is
// pointer-events:none on touch so a swipe over the track scrolls the panel),
// padded out by the transparent ::before in responsive.css's
// .rf-m-slider-thumb rule. Must match that rule's `inset`: (44 - 24) / 2 = 10.
export const SLIDER_THUMB_TOUCH_PAD = 10;
// Half of the thumb's painted size (24px): how far from its center the
// visible circle extends. Used to pick points that are provably off-paint but
// still inside the padded hit area.
export const SLIDER_THUMB_VISIBLE_RADIUS = 12;

const PANEL_INTERACTIVE_SELECTOR = [
  "button",
  '[role="switch"]',
  '[role="slider"]',
  "a[href]",
  'input:not([type="hidden"]):not([type="file"])',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menuitem"]',
].map((part) => `.rf-slideover ${part}`).join(", ");

// Collects the EFFECTIVE hit box for every visible interactive control in the
// panel. A Switch is measured via its whole Toggle row (the row is what
// responds to a tap, see Primitives.jsx). A Slider is measured as its thumb
// plus SLIDER_THUMB_TOUCH_PAD on every side.
export async function collectPanelHitBoxes(page) {
  return page.evaluate(({ sel, pad }) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const role = el.getAttribute("role");
      let box;
      if (role === "switch") {
        box = (el.closest(".rf-m-toggle-row") || el).getBoundingClientRect();
      } else if (role === "slider") {
        const r = el.getBoundingClientRect();
        box = { x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
      } else {
        box = el.getBoundingClientRect();
      }
      if (box.width === 0 && box.height === 0) continue;
      out.push({
        label: el.getAttribute("aria-label") || `${el.tagName}${role ? `[role=${role}]` : ""}`,
        x: box.x, y: box.y, width: box.width, height: box.height,
      });
    }
    return out;
  }, { sel: PANEL_INTERACTIVE_SELECTOR, pad: SLIDER_THUMB_TOUCH_PAD });
}

export function boxesOverlap(a, b, eps = PANEL_TOUCH_TOLERANCE) {
  const ax1 = a.x + eps, ay1 = a.y + eps;
  const ax2 = a.x + a.width - eps, ay2 = a.y + a.height - eps;
  const bx1 = b.x + eps, by1 = b.y + eps;
  const bx2 = b.x + b.width - eps, by2 = b.y + b.height - eps;
  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}
