import { test, expect, settle, openDemo, openPanelDesktop, openPanelSection, expectNoHorizontalOverflow } from "./fixtures.js";
import {
  TOUCH, openPanelTouch, panelScrollTop, touchSwipeUp, touchDragHorizontal,
  collectPanelHitBoxes, boxesOverlap,
  PANEL_TOUCH_MIN, PANEL_TOUCH_TOLERANCE, SLIDER_THUMB_TOUCH_PAD, SLIDER_THUMB_VISIBLE_RADIUS,
} from "./touch.js";

// ── Task 11: touch-sized controls inside the slide-over panel ──────────────
// Spec: on touch devices below 1024px, every interactive control inside
// .rf-slideover has a hit area >= 44x44 (small rendering tolerance), sliders
// and switches are comfortable to use with a finger, and none of the grown
// hit boxes overlap a neighbor's.

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
        // (and its Pro-lock marker) above the fold in the screenshot just
        // taken. Scroll it explicitly into view and shoot a second,
        // dedicated screenshot so the owner can review it.
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
// through Chromium's input pipeline (CDP, see touch.js), not JS
// scrollTo/synthetic events, so they exercise the same pipeline as the
// reported bug.
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
      const thumbBox = await fontSizeThumb.boundingBox();
      const cx = thumbBox.x + thumbBox.width / 2;
      const cy = thumbBox.y + thumbBox.height / 2;

      // SLIDER_THUMB_VISIBLE_RADIUS (12, half of the 24px painted thumb) +
      // SLIDER_THUMB_TOUCH_PAD (10) = 22, the true edge of the padded hit
      // area (see .rf-m-slider-thumb::before in responsive.css). Sample
      // 1px inside that edge so rounding at the exact boundary can't cause
      // a false negative.
      const offset = SLIDER_THUMB_VISIBLE_RADIUS + SLIDER_THUMB_TOUCH_PAD - 1;
      const thumbHandle = await fontSizeThumb.elementHandle();
      let hits;
      try {
        hits = await page.evaluate(
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
      } finally {
        await thumbHandle.dispose();
      }
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

  async function openTypography(page) {
    await openDemo(page);
    await openPanelDesktop(page);
    await openPanelSection(page, "Typography");
    return page.getByTestId("fontpicker-trigger");
  }

  test("pressing the mouse down opens the menu before mouse-up", async ({ app }) => {
    const page = await app();
    const trigger = await openTypography(page);
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

  for (const [name, key] of [["Enter", "Enter"], ["Space", " "], ["ArrowDown", "ArrowDown"]]) {
    test(`${name} opens the menu`, async ({ app }) => {
      const page = await app();
      const trigger = await openTypography(page);
      await trigger.focus();
      await page.keyboard.press(key);
      await settle(page, 200);
      await expect(page.getByRole("menu")).toBeVisible();
    });
  }

  test("Escape closes the menu and returns focus to the trigger", async ({ app }) => {
    const page = await app();
    const trigger = await openTypography(page);
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
    const trigger = await openTypography(page);
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
