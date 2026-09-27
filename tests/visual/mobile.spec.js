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
