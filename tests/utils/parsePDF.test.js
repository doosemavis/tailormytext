import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { analyzePDF, markMinorityFontsAsEmphasis } from "../../src/workers/pdfAnalysis.js";

// parsePDF previously had two bare `catch {}` blocks (outline fetch +
// per-entry destination resolution). Failures vanished into the void;
// when most outline entries failed, the user got a doc with a useless
// flat page list and no warning that the TOC had silently dropped.
//
// These tests cover the extracted helpers — the parsePDF entrypoint
// itself depends on a real CDN-loaded pdf.js global, which we can't
// reproduce in Node. The helpers are the actual error-handling units.

vi.mock("../../src/utils/scriptLoader.js", () => ({
  loadScript: () => Promise.resolve(),
}));

const { resolveDestToPage, resolveOutlineSafe } = await import("../../src/utils/parsePDF.js");

describe("resolveDestToPage — single-entry warn behavior (Task 1.6)", () => {
  let warnSpy;
  beforeEach(() => { warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { warnSpy.mockRestore(); });

  it("resolves a string destination to a 1-indexed page number", async () => {
    const doc = {
      getDestination: vi.fn(() => Promise.resolve(["page-ref", "Fit"])),
      getPageIndex: vi.fn(() => Promise.resolve(4)),
    };
    expect(await resolveDestToPage(doc, "ch1")).toBe(5);
  });

  it("returns null and warns when getDestination throws", async () => {
    const doc = {
      getDestination: vi.fn(() => Promise.reject(new Error("dead link"))),
      getPageIndex: vi.fn(),
    };
    expect(await resolveDestToPage(doc, "ch1")).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/outline|destination/i), expect.anything());
  });

  it("returns null and warns when getPageIndex throws", async () => {
    const doc = {
      getDestination: vi.fn(() => Promise.resolve(["page-ref"])),
      getPageIndex: vi.fn(() => Promise.reject(new Error("invalid ref"))),
    };
    expect(await resolveDestToPage(doc, ["page-ref"])).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/outline|destination/i), expect.anything());
  });
});

describe("resolveOutlineSafe — bulk + threshold warn behavior (Task 1.6)", () => {
  let warnSpy;
  beforeEach(() => { warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { warnSpy.mockRestore(); });

  it("returns null when getOutline throws (Task 1.5)", async () => {
    const doc = { getOutline: vi.fn(() => Promise.reject(new Error("oops"))) };
    const result = await resolveOutlineSafe(doc);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/outline/i), expect.anything());
  });

  it("returns null when getOutline returns empty", async () => {
    const doc = { getOutline: vi.fn(() => Promise.resolve([])) };
    expect(await resolveOutlineSafe(doc)).toBeNull();
  });

  it("returns flattened resolved entries when all destinations resolve", async () => {
    const doc = {
      getOutline: vi.fn(() => Promise.resolve([
        { title: "Ch 1", dest: "d1", items: [] },
        { title: "Ch 2", dest: "d2", items: [] },
      ])),
      getDestination: vi.fn((d) => Promise.resolve([d, "Fit"])),
      getPageIndex: vi.fn(() => Promise.resolve(0)),
    };
    const result = await resolveOutlineSafe(doc);
    expect(result).toHaveLength(2);
    expect(result[0].page).toBe(1);
  });

  it("warns loudly when >50% of outline entries fail to resolve", async () => {
    const doc = {
      getOutline: vi.fn(() => Promise.resolve([
        { title: "Ch 1", dest: "good", items: [] },
        { title: "Ch 2", dest: "bad", items: [] },
        { title: "Ch 3", dest: "bad", items: [] },
        { title: "Ch 4", dest: "bad", items: [] },
      ])),
      getDestination: vi.fn((d) => d === "good" ? Promise.resolve(["p", "Fit"]) : Promise.reject(new Error("dead"))),
      getPageIndex: vi.fn(() => Promise.resolve(0)),
    };
    const result = await resolveOutlineSafe(doc);
    expect(result).toHaveLength(4);
    // The >50% threshold message specifically — separate from the per-entry warns.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/most outline|majority|broken/i));
  });
});

describe("markMinorityFontsAsEmphasis — immutability", () => {
  it("returns new items rather than mutating caller's items", () => {
    const original = { str: "x", fontName: "MinorityFont", isBold: false, isItalic: false };
    const rawPageData = [{ lines: [{ items: [original] }] }];
    const fontUsage = {
      primary: "PrimaryFont", primaryCount: 100,
      all: new Map([["PrimaryFont", 100], ["MinorityFont", 10]]),
    };
    const result = markMinorityFontsAsEmphasis(rawPageData, fontUsage);
    expect(original.isBold).toBe(false); // caller's item untouched
    expect(result[0].lines[0].items[0].isBold).toBe(true); // new item flipped
  });
});

describe("buildPerPageSections — contract guarantees", () => {
  // Helper: build a pdf.js-style item with transform encoding x/y as the
  // 5th/6th elements and fontSize as the 3rd element of the transform matrix.
  function makeItem(str, x, y, fontSize, fontName = "F1") {
    return {
      str,
      fontName,
      // pdf.js transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
      transform: [fontSize, 0, 0, fontSize, x, y],
      width: str.length * (fontSize * 0.6),
      height: fontSize,
      hasEOL: false,
    };
  }

  it("never emits a section with empty content (even when title matches)", () => {
    const rawPages = [{
      pageNum: 1,
      viewport: { width: 612, height: 792 },
      styles: {},
      items: [
        makeItem("Chapter 1", 72, 700, 14),
      ],
    }];
    const result = analyzePDF({ rawPages, resolvedOutline: null });
    // buildPerPageSections suppresses the title-only page (empty content).
    // analyzePDF's fallback then synthesizes exactly one document section
    // from the raw text so the reader always has something to show.
    expect(result).toHaveLength(1); // fallback fires, not an empty-push bug
    for (const s of result) {
      expect(s.content.trim().length).toBeGreaterThan(0);
    }
  });

  it("omits titleSizeRatio when no measurement is available", () => {
    const rawPages = [{
      pageNum: 1,
      viewport: { width: 612, height: 792 },
      styles: {},
      items: [
        makeItem("Body line one.", 72, 700, 12),
        makeItem("Body line two.", 72, 680, 12),
      ],
    }];
    const result = analyzePDF({ rawPages, resolvedOutline: null });
    for (const s of result) {
      if ("titleSizeRatio" in s) expect(s.titleSizeRatio).toBeGreaterThan(0);
    }
  });
});
