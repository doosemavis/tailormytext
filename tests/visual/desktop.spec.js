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
