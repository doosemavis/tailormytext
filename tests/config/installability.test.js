import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
const html = readFileSync("index.html", "utf8");
const icon = (purpose, size) => manifest.icons.find((i) => i.purpose === purpose && i.sizes === size);

describe("home-screen install", () => {
  it("manifest lists PNG icons with separate any/maskable purposes", () => {
    expect(icon("any", "192x192")?.src).toBe("/icons/icon-192.png");
    expect(icon("any", "512x512")?.src).toBe("/icons/icon-512.png");
    expect(icon("maskable", "512x512")?.src).toBe("/icons/icon-maskable-512.png");
    expect(manifest.icons.some((i) => i.purpose === "any maskable")).toBe(false);
  });

  it("every manifest icon file exists", () => {
    for (const { src } of manifest.icons) expect(existsSync(`public${src}`)).toBe(true);
  });

  it("manifest keeps standalone display and adds id/scope", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.id).toBe("/");
    expect(manifest.scope).toBe("/");
  });

  it("index.html has the iOS install tags and viewport-fit", () => {
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />');
    expect(html).toContain('name="apple-mobile-web-app-title" content="TailorMyText"');
    expect(html).toContain('name="apple-mobile-web-app-status-bar-style" content="default"');
    expect(html).toContain('name="mobile-web-app-capable" content="yes"');
    expect(html).toContain("viewport-fit=cover");
    expect(existsSync("public/icons/apple-touch-icon-180.png")).toBe(true);
  });
});
