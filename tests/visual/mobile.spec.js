import { test, expect, settle, openDemo, openPanelSection, openPanelDesktop, panelButton, expectNoHorizontalOverflow, expectInViewport } from "./fixtures.js";
import { TOUCH, openPanelTouch } from "./touch.js";

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
    await openPanelSection(page, "Typography");
    await page.locator(".rf-slideover").getByTestId("fontpicker-trigger").click();
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
    await openPanelDesktop(page);
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
    test.use({ viewport: { width, height: 844 }, ...TOUCH });

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
  test.use({ viewport: { width: 820, height: 1180 }, ...TOUCH });

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
  test.use({ viewport: { width: 1024, height: 768 }, ...TOUCH });

  test("desktop toolbar keeps every control on-screen with the panel open", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await openPanelDesktop(page);
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
  test.use({ viewport: { width: 390, height: 844 }, ...TOUCH });

  test("tapping a line places the highlight guide there", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await openPanelTouch(page);
    await openPanelSection(page, "Reading Guide");
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
    test.use({ viewport: { width, height: 844 }, ...TOUCH });

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
  test.use({ viewport: { width: 360, height: 780 }, ...TOUCH });

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
    await openPanelTouch(page);
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
  test.use({ viewport: { width: 360, height: 780 }, ...TOUCH });

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

// Page-level overflow can't see a squeezed toolbar: the reader chrome sits
// inside overflow:hidden columns, and its flex items shrink (wrapping "Sign
// in", overlapping the Trial badge onto the title, clipping the avatar's
// chevron) long before anything overflows. So check that the toolbar content
// fits AND that every item except the chapter menu (which ellipsizes by
// design) is at its natural width, measured by briefly un-shrinking them.
async function expectReaderToolbarFits(page) {
  const bar = page.locator(".rf-reader-chrome, .rf-phone-toolbar");
  await expect(bar).toHaveCount(1);
  const { scrollWidth, clientWidth } = await bar.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(scrollWidth, "reader toolbar content is wider than the toolbar").toBeLessThanOrEqual(clientWidth);

  const chrome = page.locator(".rf-reader-chrome");
  if (await chrome.count() === 0) return; // phone toolbar: its own truncation rules
  const squeezed = await chrome.evaluate((el) => {
    const items = [...el.children].filter((c) => !c.classList.contains("rf-m-chapter-trigger"));
    const actual = items.map((c) => c.getBoundingClientRect().width);
    const saved = items.map((c) => c.style.flexShrink);
    items.forEach((c) => { c.style.flexShrink = "0"; });
    const natural = items.map((c) => c.getBoundingClientRect().width);
    items.forEach((c, i) => { c.style.flexShrink = saved[i]; });
    return items
      .map((c, i) => ({ item: c.getAttribute("aria-label") || c.textContent.trim().slice(0, 24) || c.tagName, actual: actual[i], natural: natural[i] }))
      .filter((r) => r.actual < r.natural - 0.5);
  });
  expect(squeezed, `toolbar items squeezed below their natural width:\n${JSON.stringify(squeezed, null, 2)}`).toEqual([]);
}

// Spec §9.5 viewport sweep. Assertion: no sideways scroll on each surface,
// and the reader toolbar is not clipped. Screenshots go to
// test-results/owner-review/ for the owner to eyeball; they are not compared.
const SWEEP = [[360, 780], [390, 844], [430, 932], [844, 390], [744, 1133], [768, 1024], [820, 1180], [1024, 768]];
const SURFACES = [
  ["landing", async () => {}],
  ["reader", async (page) => { await openDemo(page); }, expectReaderToolbarFits],
  ["pricing", async (page) => { await page.getByRole("button", { name: /see pro plans/i }).click(); await settle(page); }],
];

for (const [w, h] of SWEEP) {
  test.describe(`sweep ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, ...TOUCH });
    for (const [name, open, check] of SURFACES) {
      test(name, async ({ app }) => {
        const page = await app();
        await open(page);
        await expectNoHorizontalOverflow(page);
        if (check) await check(page);
        await page.screenshot({ path: `test-results/owner-review/${name}-${w}x${h}.png`, fullPage: name === "landing" });
      });
    }
  });
}

// The widest toolbar state: signed in (avatar trigger) with the Trial badge
// ("Trial — Nd left"), which the phone toolbar never shows.
for (const [w, h] of [[768, 1024], [820, 1180], [1024, 768]]) {
  test.describe(`reader toolbar with a Trial badge ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, ...TOUCH });

    test("is not clipped", async ({ app }) => {
      const page = await app({ signedIn: true, subscription: "trial" });
      await openDemo(page);
      await expect(page.locator(".rf-reader-chrome").getByText(/Trial — \d+d left/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectReaderToolbarFits(page);
      await page.screenshot({ path: `test-results/owner-review/reader-trial-${w}x${h}.png` });
    });
  });
}

// iOS reads link[rel="apple-touch-icon"] when the page is added to the home
// screen. The theme-favicon effect in App.jsx restyles the TAB favicon per
// theme and must leave the home-screen PNG alone.
test.describe("home-screen icon (phone 390)", () => {
  test.use({ viewport: { width: 390, height: 844 }, ...TOUCH });

  const iconHrefs = (page) => page.evaluate(() => ({
    apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"),
    tab: [...document.querySelectorAll('link[rel="icon"]')].map((l) => l.getAttribute("href")),
  }));

  test("theme changes restyle the tab favicon but never the apple-touch-icon", async ({ app }) => {
    const page = await app();
    const initial = await iconHrefs(page);
    expect(initial.apple).toMatch(/\/apple-touch-icon-180\.png$/);
    expect(initial.tab.length).toBeGreaterThan(0);
    for (const href of initial.tab) expect(href).toMatch(/^data:image\/svg\+xml/);

    await openDemo(page);
    await openPanelTouch(page);
    await openPanelSection(page, "Theme");
    const label = await page
      .locator('.rf-slideover [aria-label^="Theme: "][aria-pressed="false"]:not([aria-label$="(Pro)"])')
      .first()
      .getAttribute("aria-label");
    const otherFreeTheme = page.locator(".rf-slideover").getByRole("button", { name: label, exact: true });
    await otherFreeTheme.click();
    await settle(page);
    await expect(otherFreeTheme).toHaveAttribute("aria-pressed", "true");

    const after = await iconHrefs(page);
    expect(after.apple).toMatch(/\/apple-touch-icon-180\.png$/);
    for (const href of after.tab) expect(href).toMatch(/^data:image\/svg\+xml/);
    expect(after.tab[0]).not.toBe(initial.tab[0]);
  });
});

// ── Slide-over focus & Escape ───────────────────────────────────────────────
// Focus goes back to the toggle only when the panel was opened from the
// keyboard. After a touch/pointer close nothing is focused programmatically,
// because focusing the toggle opens its Radix tooltip (open-on-focus), and on
// touch nothing ever closes it again.
const slideover = (page) => page.locator(".rf-slideover");

test.describe("slide-over focus (tablet 820)", () => {
  test.use({ viewport: { width: 820, height: 1180 }, ...TOUCH });

  test("keyboard open, then Escape, returns focus to the toggle", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    const toggle = panelButton(page);
    // A real keyboard path: Tab from the page start lands on the toggle (the
    // closed slide-over is display:none, so the toolbar comes first).
    await page.keyboard.press("Tab");
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    await settle(page, 500);
    await expect(slideover(page)).toHaveAttribute("data-state", "open");

    await page.keyboard.press("Escape");
    await settle(page, 300);
    await expect(slideover(page)).toHaveAttribute("data-state", "closed");
    await expect(toggle).toBeFocused();
  });

  test("the toolbar under the open panel keeps its layout (no shift, no overflow)", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    const chrome = page.locator(".rf-reader-chrome");
    const layout = () => chrome.evaluate((el) => ({
      fits: el.scrollWidth <= el.clientWidth,
      children: [...el.children].map((c) => {
        const r = c.getBoundingClientRect();
        return [Math.round(r.x), Math.round(r.width)];
      }),
    }));
    const closed = await layout();
    await openPanelTouch(page);
    const opened = await layout();
    expect(opened).toEqual(closed);
    expect(opened.fits).toBe(true);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("slide-over focus (phone 390 touch)", () => {
  test.use({ viewport: { width: 390, height: 844 }, ...TOUCH });

  async function tapOpen(page) {
    await panelButton(page).tap();
    await settle(page, 500);
    await expect(slideover(page)).toHaveAttribute("data-state", "open");
  }

  async function expectClosedWithoutTooltip(page) {
    await settle(page, 1000);
    await expect(slideover(page)).toHaveAttribute("data-state", "closed");
    await expect(page.locator('[role="tooltip"]')).toHaveCount(0);
  }

  test("tapping the backdrop closes the panel without leaving a tooltip open", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await tapOpen(page);
    await page.getByTestId("slideover-backdrop").tap({ position: { x: 370, y: 600 } });
    await expectClosedWithoutTooltip(page);
  });

  test("tapping Close panel closes the panel without leaving a tooltip open", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await tapOpen(page);
    await page.getByRole("button", { name: "Close panel", exact: true }).tap();
    await expectClosedWithoutTooltip(page);
  });
});

test.describe("slide-over Escape (tablet 820)", () => {
  test.use({ viewport: { width: 820, height: 1180 }, ...TOUCH });

  test("Escape closes an open FontPicker menu first, and only a second Escape closes the panel", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await openPanelTouch(page);
    await openPanelSection(page, "Typography");
    await slideover(page).getByTestId("fontpicker-trigger").tap();
    await settle(page, 300);
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("Escape");
    await settle(page, 300);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(slideover(page)).toHaveAttribute("data-state", "open");

    await page.keyboard.press("Escape");
    await settle(page, 300);
    await expect(slideover(page)).toHaveAttribute("data-state", "closed");
  });

  // usePacer ignores keys whose target is inside [role='dialog'] (the
  // slide-over is one), so Escape inside the panel only closes the panel,
  // and Escape outside it still pauses the pacer, same as before this fix.
  test("with the pacer playing, Escape closes the panel, then a second Escape pauses the pacer", async ({ app }) => {
    const page = await app();
    await openDemo(page);
    await page.locator(".rf-reader-chrome").getByRole("button", { name: "Pacer", exact: true }).click();
    await settle(page, 300);
    const pacerBar = page.getByRole("toolbar", { name: "Pacer controls" });
    await pacerBar.getByRole("button", { name: "Play", exact: true }).click();
    await settle(page, 300);
    const pause = pacerBar.getByRole("button", { name: "Pause", exact: true });
    await expect(pause).toBeVisible();

    await openPanelTouch(page);
    await page.keyboard.press("Escape");
    await settle(page, 300);
    await expect(slideover(page)).toHaveAttribute("data-state", "closed");
    await expect(pause).toBeVisible();

    await page.keyboard.press("Escape");
    await settle(page, 300);
    await expect(pacerBar.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await expect(slideover(page)).toHaveAttribute("data-state", "closed");
  });
});

// iOS Safari zooms the page when a focused field's font-size is under 16px.
// Every text field in a phone dialog must compute to >= 16px.
test.describe("phone 390 dialog fields don't trigger iOS zoom", () => {
  test.use({ viewport: { width: 390, height: 844 }, ...TOUCH });

  const fieldFontSizes = (dialog) => dialog.evaluate((el) => [...el.querySelectorAll("input, textarea, select")]
    .filter((f) => f.type !== "hidden" && f.type !== "file" && f.getClientRects().length > 0)
    .map((f) => ({ field: f.getAttribute("aria-label") || f.name || f.type || f.tagName, px: parseFloat(getComputedStyle(f).fontSize) })));

  for (const [name, signedIn, open, selector] of [
    ["auth", false, async (p) => p.getByRole("button", { name: "Sign in" }).click(), ".tmt-m-dialog"],
    ["contact", false, async (p) => p.getByText("Contact", { exact: true }).click(), ".tmt-m-dialog"],
    ["library drawer", true, async (p) => {
      await openDemo(p);
      await openPanelTouch(p);
      await p.getByRole("button", { name: /browse the library/i }).click();
    }, ".tmt-m-dialog-full"],
  ]) {
    test(`${name}: every visible field is at least 16px`, async ({ app }) => {
      const page = await app({ signedIn });
      await open(page);
      await settle(page);
      const sizes = await fieldFontSizes(page.locator(selector));
      expect(sizes.length).toBeGreaterThan(0);
      expect(sizes.filter((s) => s.px < 16), JSON.stringify(sizes)).toEqual([]);
    });
  }
});

// Landscape iPhones: the panel pads its content clear of the notch
// (env(safe-area-inset-left), 0 here) and grows by the same inset, so the
// usable width never shrinks; it also must not scroll-chain to the page.
for (const [w, h] of [[390, 844], [820, 1180]]) {
  test.describe(`slide-over box ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, ...TOUCH });

    test("keeps its width, pads for the notch, and contains overscroll", async ({ app }) => {
      const page = await app();
      await openDemo(page);
      await openPanelTouch(page);
      const box = await slideover(page).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { width: el.getBoundingClientRect().width, paddingLeft: cs.paddingLeft, overscrollY: cs.overscrollBehaviorY };
      });
      // App.jsx sizes the panel min(100vw - 48px, SIDEBAR_WIDTH = 296).
      expect(box).toEqual({ width: Math.min(w - 48, 296), paddingLeft: "0px", overscrollY: "contain" });
    });
  });
}

// Owner-reported on the live site (pre-responsive production): in a narrow
// desktop window the reader toolbar squeezed the panel toggle to ~16×34px, a
// pill instead of a square. Below 1024 the tier layouts must keep it square
// and full-size, whether driven by mouse or touch.
test.describe("panel toggle keeps its shape in narrow windows", () => {
  for (const width of [360, 500, 700, 800, 1000]) {
    for (const [input, extra] of [["mouse", {}], ["touch", TOUCH]]) {
      test.describe(`${width}px ${input}`, () => {
        test.use({ viewport: { width, height: 800 }, ...extra });

        test("the panel toggle is square and at least 34px", async ({ app }) => {
          const page = await app();
          await openDemo(page);
          const box = await panelButton(page).boundingBox();
          expect(box.width).toBeGreaterThanOrEqual(34);
          expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(0.5);
        });
      });
    }
  }
});
