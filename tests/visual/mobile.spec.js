import { test, expect, settle, openDemo, openSidebarSection, openPanelDesktop, expectNoHorizontalOverflow, expectInViewport } from "./fixtures.js";

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
    // Scoped to .rf-reader-chrome: with the sidebar open at this width it's a
    // fixed panel (not a slide-over), and its "Pacer" accordion section header
    // has the same accessible name as the toolbar's "Pacer" toggle button.
    const chrome = page.locator(".rf-reader-chrome");
    for (const name of ["NeuroDiv", "HueGuide", "Focus", "Pacer"]) {
      await expectInViewport(page, chrome.getByRole("button", { name, exact: true }));
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

test.describe("phone 360 pricing card fit", () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  // Regression for a CSS grid blowout: the Pro card's CTA (a single-line
  // flex row) reported an oversized automatic-minimum-size to the ancestor
  // grid, stretching both cards past the dialog's right edge.
  test("every plan card stays horizontally inside the dialog", async ({ app }) => {
    const page = await app();
    await page.getByRole("button", { name: /see pro plans/i }).click();
    await settle(page);
    const dialogBox = await page.locator(".tmt-m-dialog").boundingBox();
    const cards = page.locator(".tmt-m-plans > div");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await cards.nth(i).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(dialogBox.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width + 1);
    }
  });
});

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

// ── Task 11: touch-sized controls inside the slide-over panel ──────────────
// Spec: on touch devices below 1024px, every interactive control inside
// .rf-slideover has a hit area >= 44x44 (small rendering tolerance), sliders
// and switches are comfortable to use with a finger, and none of the grown
// hit boxes overlap a neighbor's.
const PANEL_TOUCH_MIN = 44;
const PANEL_TOUCH_TOLERANCE = 0.5;
// Amendment: a slider's effective touch target is now the THUMB's hit area
// (the root is pointer-events:none on touch so a swipe over the track
// scrolls the panel — see the "panel swipe-to-scroll" tests below), padded
// out by the transparent ::before in responsive.css's .rf-m-slider-thumb
// rule. Must match that rule's `inset` value: (44 - 24) / 2 = 10.
const SLIDER_THUMB_TOUCH_PAD = 10;
// Half of the thumb's own painted size (24px), i.e. how far from its
// center the visible circle actually extends. Used to pick test points
// that are provably off-paint but still inside the padded hit area.
const SLIDER_THUMB_VISIBLE_RADIUS = 12;

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

// Like `openSidebarSection`, but scoped to .rf-slideover: at the tablet
// tier the reader toolbar renders its NeuroDiv/HueGuide/Focus/Pacer
// feature-toggle buttons inline (not behind the phone's popover), and
// "Pacer" is also a Section title — an unscoped name match is ambiguous
// there. Scoping to the panel is unambiguous at every tier.
async function openPanelSection(page, title) {
  await page.locator(".rf-slideover").getByRole("button", { name: title, exact: true }).click();
  await settle(page, 500);
}

// Opens every panel Section and turns on the features that reveal
// conditional controls (NeuroDiv, HueGuide, Pacer, reading guide =
// Highlight) — task-11-brief.md's test scope, item 1. Each Section is
// expanded (and, where relevant, its own switch/radio flipped) BEFORE the
// next Section opens: the trigger button is matched by exact accessible
// name, and a Section grows an "active" indicator dot into that name once
// its own setting goes non-default, which would collide with an
// exact-name match made afterwards. This ordering also keeps the
// switch/radio `nth()` indices below stable and predictable.
async function revealAllPanelControls(page) {
  await openPanelSection(page, "Enhancements");
  await page.locator(".rf-slideover [role='switch']").nth(0).click(); // NeuroDiv
  await settle(page, 200);
  await page.locator(".rf-slideover [role='switch']").nth(1).click(); // HueGuide
  await settle(page, 200);
  await openPanelSection(page, "Pacer");
  await page.locator(".rf-slideover [role='switch']").nth(3).click(); // WPM Pacer (after NeuroDiv, HueGuide, Focus)
  await settle(page, 200);
  await openPanelSection(page, "Reading Guide");
  await page.locator(".rf-slideover [role='radio']").nth(1).click(); // Highlight
  await settle(page, 200);
  await openPanelSection(page, "Typography");
  await openPanelSection(page, "Theme");
  await settle(page, 300);
}

// Collects the EFFECTIVE hit box for every visible interactive control in
// the panel. A Switch's own element is usually smaller than the area that
// actually responds to a tap — the whole Toggle row does too (see
// Primitives.jsx) — so it's measured via that ancestor instead of its own
// small box. A Slider's effective touch target is its THUMB's hit area
// (root's box no longer applies: the root is pointer-events:none on touch,
// see the "panel swipe-to-scroll" tests below), padded by
// SLIDER_THUMB_TOUCH_PAD to match the transparent ::before in
// responsive.css's .rf-m-slider-thumb rule.
async function collectPanelHitBoxes(page) {
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

function boxesOverlap(a, b, eps = PANEL_TOUCH_TOLERANCE) {
  const ax1 = a.x + eps, ay1 = a.y + eps;
  const ax2 = a.x + a.width - eps, ay2 = a.y + a.height - eps;
  const bx1 = b.x + eps, by1 = b.y + eps;
  const bx2 = b.x + b.width - eps, by2 = b.y + b.height - eps;
  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}

for (const [w, h] of [[360, 780], [390, 844], [820, 1180]]) {
  test.describe(`panel touch targets ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, ...TOUCH });

    test("every control in the slide-over panel has a >=44x44 hit area and none overlap", async ({ app }) => {
      const page = await app();
      await openDemo(page);
      await openPanelTouch(page);
      await revealAllPanelControls(page);

      const boxes = await collectPanelHitBoxes(page);
      // Sanity: the sweep should have found the panel's ~50 controls, not
      // an empty or still-closed panel.
      expect(boxes.length).toBeGreaterThan(30);

      const tooSmall = boxes.filter(
        (b) => b.width < PANEL_TOUCH_MIN - PANEL_TOUCH_TOLERANCE || b.height < PANEL_TOUCH_MIN - PANEL_TOUCH_TOLERANCE
      );
      expect(tooSmall, `undersized hit boxes:\n${JSON.stringify(tooSmall, null, 2)}`).toEqual([]);

      const overlapping = [];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (boxesOverlap(boxes[i], boxes[j])) overlapping.push([boxes[i].label, boxes[j].label]);
        }
      }
      expect(overlapping, `overlapping hit boxes:\n${JSON.stringify(overlapping, null, 2)}`).toEqual([]);

      await expectNoHorizontalOverflow(page);

      if (w === 390 || w === 820) {
        await page.screenshot({ path: `test-results/owner-review/panel-${w}x${h}.png` });
      }
      if (w === 390) {
        // revealAllPanelControls's last openPanelSection("Theme") call
        // scrolls the panel to Theme, which can leave the Pacer section
        // (and its Pro-lock marker, fixed above) above the fold in the
        // screenshot just taken. Scroll it explicitly into view and shoot
        // a second, dedicated screenshot so the owner can review it.
        const capMarker = page.locator('.rf-slideover [aria-label*="wpm is Pro"]');
        await capMarker.scrollIntoViewIfNeeded();
        await settle(page, 200);
        await page.screenshot({ path: `test-results/owner-review/panel-pacer-${w}x${h}.png` });
      }
    });
  });
}

test.describe("panel touch controls actually respond to a tap", () => {
  test.use({ viewport: { width: 390, height: 844 }, ...TOUCH });

  // Amendment: this test originally also tapped the slider TRACK and
  // asserted the value changed. That behavior is now intentionally removed
  // (a swipe starting on the track must scroll the panel instead — see the
  // "panel swipe-to-scroll" tests below), so that assertion was replaced by
  // the dedicated thumb-drag / track-swipe tests rather than kept here.
  test("tapping a switch flips it", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await openPanelTouch(page);

    await openPanelSection(page, "Enhancements");
    const neuroDivSwitch = page.locator(".rf-slideover [role='switch']").nth(0);
    await expect(neuroDivSwitch).toHaveAttribute("aria-checked", "false");
    await neuroDivSwitch.tap();
    await settle(page, 200);
    await expect(neuroDivSwitch).toHaveAttribute("aria-checked", "true");
  });
});

// ── Task 11 amendment: swipe-to-scroll over sliders & the font picker ──────
// Bug (controller repro on 390x844 touch emulation via CDP
// Input.synthesizeScrollGesture, gestureSourceType:"touch"): a vertical
// swipe starting on any panel slider changed its value instead of
// scrolling the panel (Radix Slider grabs pointerdown on its root and
// jumps the value — node_modules/@radix-ui/react-slider SliderImpl); a
// swipe starting on the FontPicker trigger opened the menu instead of
// scrolling (Radix DropdownMenu Trigger opens on pointerdown for every
// pointer type). Fixed via touch-only CSS (sliders: only the thumb reacts
// to touch, root passes swipes through) and a touch-aware open-on-click
// override in Primitives.jsx's FontPicker. These tests drive REAL gestures
// through Chromium's input pipeline (CDP), not JS scrollTo/synthetic
// events, so they exercise the same pipeline as the reported bug.

async function cdp(page) {
  return page.context().newCDPSession(page);
}

// Scrolls .rf-slideover via a synthesized touch scroll gesture starting at
// (x, y) — not a JS scrollTo — so it exercises the actual browser gesture
// pipeline. Per this CDP call's semantics, a negative yDistance scrolls the
// panel content down (scrollTop increases).
async function touchSwipeUp(page, x, y, distance = 160) {
  const session = await cdp(page);
  await session.send("Input.synthesizeScrollGesture", {
    x, y, xDistance: 0, yDistance: -distance,
    gestureSourceType: "touch", speed: 400, preventFling: true,
  });
}

// Drags a point sideways via raw touch events, for interactions (like
// grabbing a slider thumb) that must be recognized as a drag, not a scroll
// gesture picked up by the compositor.
async function touchDragHorizontal(page, x0, y, x1, steps = 6) {
  const session = await cdp(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function panelScrollTop(page) {
  return page.locator(".rf-slideover").evaluate((el) => el.scrollTop);
}

for (const [w, h] of [[390, 844], [820, 1180]]) {
  test.describe(`panel swipe-to-scroll over controls ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, ...TOUCH });

    test("a swipe starting on a slider track scrolls the panel and leaves its value unchanged", async ({ app }) => {
      const page = await app();
      await openDemo(page);
      await openPanelTouch(page);
      await openPanelSection(page, "Typography");
      await openPanelSection(page, "Theme"); // scroll room

      const fontSizeThumb = page.locator(".rf-slideover [role='slider']").first();
      const before = await fontSizeThumb.getAttribute("aria-valuenow");
      const sliderRoot = page.locator(".rf-slideover .rf-m-slider-root").first();
      const box = await sliderRoot.boundingBox();
      const startTop = await panelScrollTop(page);

      // Far side of the track from the default-value (18, range 12-36,
      // so the thumb starts left-of-center) thumb position, so this can
      // only land on bare track, never the thumb.
      await touchSwipeUp(page, box.x + box.width - 15, box.y + box.height / 2);
      await settle(page, 300);

      const endTop = await panelScrollTop(page);
      expect(endTop).toBeGreaterThan(startTop);
      const after = await fontSizeThumb.getAttribute("aria-valuenow");
      expect(after).toBe(before);
    });

    test("dragging the slider thumb sideways changes its value", async ({ app }) => {
      const page = await app();
      await openDemo(page);
      await openPanelTouch(page);
      await openPanelSection(page, "Typography");

      const fontSizeThumb = page.locator(".rf-slideover [role='slider']").first();
      const before = await fontSizeThumb.getAttribute("aria-valuenow");
      const thumbBox = await fontSizeThumb.boundingBox();
      const cx = thumbBox.x + thumbBox.width / 2;
      const cy = thumbBox.y + thumbBox.height / 2;

      await touchDragHorizontal(page, cx, cy, cx + 80);
      await settle(page, 300);

      const after = await fontSizeThumb.getAttribute("aria-valuenow");
      expect(after).not.toBe(before);
    });

    // Review fix: the >=44x44 slider assertion in "panel touch targets"
    // above is arithmetic on a computed rectangle (thumb box + PAD) — it
    // never confirms the browser's real hit-test agrees, so it stayed
    // green even with the ::before rule (or its pointer-events:auto)
    // deleted entirely. This test hit-tests REAL points with
    // elementFromPoint and starts a REAL drag from inside the pad but off
    // the painted thumb, so it can only pass if the padded area actually
    // works as a touch target.
    test("the slider thumb's padded touch hit area actually resolves to the thumb", async ({ app }) => {
      const page = await app();
      await openDemo(page);
      await openPanelTouch(page);
      await openPanelSection(page, "Typography");

      const fontSizeThumb = page.locator(".rf-slideover [role='slider']").first();
      const thumbHandle = await fontSizeThumb.elementHandle();
      const thumbBox = await fontSizeThumb.boundingBox();
      const cx = thumbBox.x + thumbBox.width / 2;
      const cy = thumbBox.y + thumbBox.height / 2;

      // SLIDER_THUMB_VISIBLE_RADIUS (12, half of the 24px painted thumb) +
      // SLIDER_THUMB_TOUCH_PAD (10) = 22, the true edge of the padded hit
      // area (see .rf-m-slider-thumb::before in responsive.css). Sample
      // 1px inside that edge so rounding at the exact boundary can't cause
      // a false negative.
      const offset = SLIDER_THUMB_VISIBLE_RADIUS + SLIDER_THUMB_TOUCH_PAD - 1;
      const hits = await page.evaluate(
        ({ cx, cy, offset, thumbEl }) => {
          const points = [
            [cx - offset, cy], [cx + offset, cy],
            [cx, cy - offset], [cx, cy + offset],
          ];
          return points.map(([x, y]) => {
            const el = document.elementFromPoint(x, y);
            // elementFromPoint reports the real (pseudo-element) HOST node
            // for a hit inside a ::before/::after, so a correct hit is
            // always exact identity with the thumb itself.
            return { x, y, isThumb: el === thumbEl };
          });
        },
        { cx, cy, offset, thumbEl: thumbHandle },
      );
      for (const hit of hits) {
        expect(hit.isThumb, `expected (${hit.x}, ${hit.y}) to hit-test to the slider thumb`).toBe(true);
      }

      // And it isn't just a hit-test artifact: a real drag starting inside
      // the pad (off the painted thumb) must move Radix's own value.
      const before = await fontSizeThumb.getAttribute("aria-valuenow");
      // 20px off-center: past the painted thumb's own 12px radius (so this
      // can only work if the padded hit area is real), and inside the
      // padded area's true 22px edge (radius 12 + pad 10).
      const padX = cx + 20;
      await touchDragHorizontal(page, padX, cy, padX + 80);
      await settle(page, 300);
      const after = await fontSizeThumb.getAttribute("aria-valuenow");
      expect(after).not.toBe(before);
    });

    test("a swipe starting on the FontPicker trigger scrolls the panel without opening the menu", async ({ app }) => {
      const page = await app();
      await openDemo(page);
      await openPanelTouch(page);
      await openPanelSection(page, "Typography");
      await openPanelSection(page, "Theme"); // scroll room

      const trigger = page.locator(".rf-slideover").getByTestId("fontpicker-trigger");
      const box = await trigger.boundingBox();
      const startTop = await panelScrollTop(page);

      await touchSwipeUp(page, box.x + box.width / 2, box.y + box.height / 2);
      await settle(page, 300);

      const endTop = await panelScrollTop(page);
      expect(endTop).toBeGreaterThan(startTop);
      await expect(page.locator('[role="menu"]')).toHaveCount(0);
    });

    test("a plain touch tap on the FontPicker opens the menu and picking a font applies it", async ({ app }) => {
      const page = await app();
      await openDemo(page);
      await openPanelTouch(page);
      await openPanelSection(page, "Typography");

      const trigger = page.locator(".rf-slideover").getByTestId("fontpicker-trigger");
      await trigger.tap();
      await settle(page, 300);
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();

      const option = page.getByRole("menuitem").nth(1);
      const optionName = await option.textContent();
      await option.tap();
      await settle(page, 300);
      await expect(trigger).toContainText(optionName);
    });
  });
}

// Owner's hard rule: the touch-only changes in Primitives.jsx's FontPicker
// (onPointerDown/onClick, controlled `open` state) must not regress mouse or
// keyboard behavior. Every test here runs at desktop size with no touch
// emulation, and scopes to the trigger via a stable data-testid instead of
// `button[aria-haspopup='menu']` + `.first()`, which was never guaranteed to
// be THIS trigger specifically.
test.describe("FontPicker mouse & keyboard behavior (desktop, no touch)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("pressing the mouse down opens the menu before mouse-up", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await openPanelDesktop(page);
    await openSidebarSection(page, "Typography");
    const trigger = page.getByTestId("fontpicker-trigger");
    const box = await trigger.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await settle(page, 200);
    // Proves it opens on PRESS, not on the eventual click/release — this is
    // the exact desktop behavior the touch fix (onPointerDown preventDefault
    // for touch only) must leave alone.
    await expect(page.getByRole("menu")).toBeVisible();
    await page.mouse.up();
  });

  test("Enter opens the menu", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await openPanelDesktop(page);
    await openSidebarSection(page, "Typography");
    const trigger = page.getByTestId("fontpicker-trigger");
    await trigger.focus();
    await page.keyboard.press("Enter");
    await settle(page, 200);
    await expect(page.getByRole("menu")).toBeVisible();
  });

  test("Space opens the menu", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await openPanelDesktop(page);
    await openSidebarSection(page, "Typography");
    const trigger = page.getByTestId("fontpicker-trigger");
    await trigger.focus();
    await page.keyboard.press(" ");
    await settle(page, 200);
    await expect(page.getByRole("menu")).toBeVisible();
  });

  test("ArrowDown opens the menu", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await openPanelDesktop(page);
    await openSidebarSection(page, "Typography");
    const trigger = page.getByTestId("fontpicker-trigger");
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await settle(page, 200);
    await expect(page.getByRole("menu")).toBeVisible();
  });

  test("Escape closes the menu and returns focus to the trigger", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await openPanelDesktop(page);
    await openSidebarSection(page, "Typography");
    const trigger = page.getByTestId("fontpicker-trigger");
    await trigger.focus();
    await page.keyboard.press("Enter");
    await settle(page, 200);
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("Escape");
    await settle(page, 200);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("selecting an item applies the font and closes the menu", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await openPanelDesktop(page);
    await openSidebarSection(page, "Typography");
    const trigger = page.getByTestId("fontpicker-trigger");
    await trigger.focus();
    await page.keyboard.press("Enter");
    await settle(page, 200);

    const option = page.getByRole("menuitem").nth(1);
    const optionName = await option.textContent();
    await option.click();
    await settle(page, 300);

    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toContainText(optionName);
  });
});
