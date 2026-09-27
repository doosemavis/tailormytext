// Refreshes the pinned Google Fonts snapshot that tests/visual/fixtures.js
// serves in place of the live fonts.googleapis.com / fonts.gstatic.com.
//
//   node tests/visual/fonts/fetch-google-fonts.mjs
//
// For the same css2 URL, Google sometimes answers with static
// /s/<family>/vNN/*.woff2 files and sometimes with dynamically built
// /l/font?kit=... files — different binaries that rasterize differently.
// Only a static (/s/-only) answer is accepted. Changing the snapshot changes
// how text renders, so desktop baselines must be regenerated afterwards.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { devices } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const MAX_ATTEMPTS = 20;
const USER_AGENT = devices["Desktop Chrome"].userAgent;

function stylesheetUrl() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const match = html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/);
  if (!match) throw new Error("No fonts.googleapis.com/css2 stylesheet link in index.html");
  return match[1].replaceAll("&amp;", "&");
}

async function fetchOk(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

async function fetchStaticCss(cssUrl) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetchOk(cssUrl, { headers: { "User-Agent": USER_AGENT, Accept: "text/css,*/*;q=0.1" } });
    const css = await res.text();
    if (!css.includes("fonts.gstatic.com/l/")) return css;
    console.warn(`attempt ${attempt}: got dynamic /l/font?kit= variant, retrying`);
  }
  throw new Error(`No static-only stylesheet after ${MAX_ATTEMPTS} attempts`);
}

const cssUrl = stylesheetUrl();
const css = await fetchStaticCss(cssUrl);
const fontUrls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/s\/[^)]+)\)/g)].map((m) => m[1]))];

fs.rmSync(path.join(HERE, "s"), { recursive: true, force: true });
for (const url of fontUrls) {
  const file = path.join(HERE, new URL(url).pathname);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await (await fetchOk(url)).arrayBuffer()));
}
fs.writeFileSync(path.join(HERE, "google-fonts.css"), css);
fs.writeFileSync(path.join(HERE, "source.json"), `${JSON.stringify({ cssUrl, userAgent: USER_AGENT }, null, 2)}\n`);
console.log(`Pinned ${fontUrls.length} font files from ${cssUrl}`);
