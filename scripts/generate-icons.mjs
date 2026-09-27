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
