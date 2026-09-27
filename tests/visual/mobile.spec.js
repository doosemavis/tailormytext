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
// the panel. A Switch's or Slider thumb's own element is usually smaller
// than the area that actually responds to a tap — the Toggle row / Slider
// root do too (see Primitives.jsx) — so those two roles are measured via
// that ancestor instead of their own small box.
async function collectPanelHitBoxes(page) {
  return page.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const role = el.getAttribute("role");
      let target = el;
      if (role === "switch") target = el.closest(".rf-m-toggle-row") || el;
      else if (role === "slider") target = el.closest(".rf-m-slider-root") || el;
      const box = target.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      out.push({
        label: el.getAttribute("aria-label") || `${el.tagName}${role ? `[role=${role}]` : ""}`,
        x: box.x, y: box.y, width: box.width, height: box.height,
      });
    }
    return out;
  }, PANEL_INTERACTIVE_SELECTOR);
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
    });
  });
}

test.describe("panel touch controls actually respond to a tap", () => {
  test.use({ viewport: { width: 390, height: 844 }, ...TOUCH });

  test("tapping a switch flips it and tapping a slider track changes its value", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await openPanelTouch(page);

    await openPanelSection(page, "Enhancements");
    const neuroDivSwitch = page.locator(".rf-slideover [role='switch']").nth(0);
    await expect(neuroDivSwitch).toHaveAttribute("aria-checked", "false");
    await neuroDivSwitch.tap();
    await settle(page, 200);
    await expect(neuroDivSwitch).toHaveAttribute("aria-checked", "true");

    await openPanelSection(page, "Typography");
    const fontSizeThumb = page.locator(".rf-slideover [role='slider']").first();
    const before = await fontSizeThumb.getAttribute("aria-valuenow");
    const sliderRoot = page.locator(".rf-slideover .rf-m-slider-root").first();
    const box = await sliderRoot.boundingBox();
    await sliderRoot.tap({ position: { x: box.width - 4, y: box.height / 2 } });
    await settle(page, 200);
    const after = await fontSizeThumb.getAttribute("aria-valuenow");
    expect(after).not.toBe(before);
  });
});
