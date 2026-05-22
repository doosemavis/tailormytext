import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectTextStructure,
  parseHTMLStructured,
  parseMarkdownStructured,
} from "../../src/utils/detectStructure.js";
import { parseMarkdownTokens } from "../../src/utils/parseMarkdownTokens.js";
import { analyzePDF } from "../../src/workers/pdfAnalysis.js";
import { Window } from "happy-dom";

// Renderer contract — docs/architecture/PARSER_CONTRACT.md §1.
// Every parser MUST return Section[] where each section has:
//   type: "chapter" | "page" | "section" | "document"
//   title: string | null
//   number: positive integer | null
//   content: non-empty string after trim
//   titleSizeRatio?: positive finite number (omit key entirely if not measured)
//
// This test locks the shape at the parser boundary so silent
// divergence (empty-string title, missing keys, novel type values)
// surfaces as a red test instead of as hollow UI.

// ── DOM shim (needed by parseEPUB + parseDOCX which use DOMParser) ───────
const win = new Window();
globalThis.DOMParser = win.DOMParser;

// ── scriptLoader: no-op so parseEPUB won't fetch from CDN ───────────────
vi.mock("../../src/utils/scriptLoader.js", () => ({
  loadScript: () => Promise.resolve(),
}));

// ── mammoth mock (shared; reset per-test in the DOCX describe block) ─────
const mammothConvertToHtml = vi.fn();
const mammothExtractRawText = vi.fn();
vi.mock("mammoth", () => ({
  default: {
    convertToHtml: (...args) => mammothConvertToHtml(...args),
    extractRawText: (...args) => mammothExtractRawText(...args),
  },
}));

// Canonical type enum — PARSER_CONTRACT.md §1.
const ALLOWED_TYPES = ["chapter", "page", "section", "document"];

// ── shared assertion helper ───────────────────────────────────────────────
function assertSectionShape(section) {
  expect(section).toHaveProperty("type");
  expect(section).toHaveProperty("title");
  expect(section).toHaveProperty("number");
  expect(section).toHaveProperty("content");

  expect(ALLOWED_TYPES).toContain(section.type);

  // title: string OR null; empty-string is NOT allowed (PARSER_CONTRACT.md §1
  // invariant #3 — empty string bypasses the synthesis fallback).
  if (section.title !== null) {
    expect(typeof section.title).toBe("string");
    expect(section.title.trim()).not.toBe("");
  }

  // number: positive integer OR null.
  if (section.number !== null) {
    expect(typeof section.number).toBe("number");
    expect(Number.isInteger(section.number)).toBe(true);
    expect(section.number).toBeGreaterThan(0);
  }

  // content: string, non-empty after trim (PARSER_CONTRACT.md §1 invariant #2).
  expect(typeof section.content).toBe("string");
  expect(section.content.trim()).not.toBe("");

  // titleSizeRatio: if present must be a positive finite number (PARSER_CONTRACT.md §1
  // invariant #5 — null / NaN / Infinity crashes the CSS calc expression).
  if ("titleSizeRatio" in section) {
    expect(typeof section.titleSizeRatio).toBe("number");
    expect(section.titleSizeRatio).toBeGreaterThan(0);
    expect(Number.isFinite(section.titleSizeRatio)).toBe(true);
  }
}

describe("Renderer contract — every parser emits the documented Section[] shape", () => {
  describe("parseMarkdownStructured", () => {
    it("emits valid Section[] for a multi-chapter doc", () => {
      const { sections } = parseMarkdownStructured("# Chapter 1\n\nHello.\n\n# Chapter 2\n\nWorld.");
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThan(0);
      sections.forEach(assertSectionShape);
    });

    it("emits a single valid Section for unstructured prose", () => {
      const { sections } = parseMarkdownStructured("Just some plain prose with no headings at all.");
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBe(1);
      sections.forEach(assertSectionShape);
    });

    // D2 contract: legacy path MUST return { sections, confidence } — not bare
    // Section[] — so the main-thread wrapper (parserWorker.js) never silently
    // treats it as a binary result with confidence lost.
    it("returns { sections, confidence } matching the D2 parser contract (legacy path)", () => {
      const result = parseMarkdownStructured("# Chapter 1\n\nHello.\n\n# Chapter 2\n\nWorld.");
      expect(result).toHaveProperty("sections");
      expect(result).toHaveProperty("confidence");
      expect(result.confidence).toHaveProperty("score");
      expect(result.confidence).toHaveProperty("reasons");
      expect(typeof result.confidence.score).toBe("number");
      expect(Array.isArray(result.confidence.reasons)).toBe(true);
    });
  });

  describe("detectTextStructure", () => {
    it("emits valid Section[] for a doc with CHAPTER headings", () => {
      const { sections } = detectTextStructure("CHAPTER 1\n\nFirst body.\n\nCHAPTER 2\n\nSecond body.");
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThan(0);
      sections.forEach(assertSectionShape);
    });

    it("emits a single document-typed Section for unstructured prose", () => {
      const { sections } = detectTextStructure("Just plain prose. No headings.");
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBe(1);
      expect(sections[0].type).toBe("document");
      sections.forEach(assertSectionShape);
    });
  });

  describe("parseHTMLStructured", () => {
    it("emits valid Section[] for an HTML doc with h1 headings", () => {
      const html = "<html><body><h1>Chapter 1</h1><p>Body one.</p><h1>Chapter 2</h1><p>Body two.</p></body></html>";
      const { sections } = parseHTMLStructured(html);
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThan(0);
      sections.forEach(assertSectionShape);
    });

    it("falls back to detectTextStructure when no headings are present", () => {
      const html = "<html><body><p>Just a paragraph, no headings.</p></body></html>";
      const { sections } = parseHTMLStructured(html);
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThan(0);
      sections.forEach(assertSectionShape);
    });
  });
});

// ── parseMarkdownTokens ───────────────────────────────────────────────────
// No mocks needed — the adapter is pure JS with no external I/O.
describe("parseMarkdownTokens — contract", () => {
  it("emits valid sections for a multi-chapter MD doc", () => {
    const { sections } = parseMarkdownTokens("# Chapter 1\n\nProse.\n\n# Chapter 2\n\nMore prose.");
    expect(Array.isArray(sections)).toBe(true);
    expect(sections.length).toBeGreaterThan(0);
    sections.forEach(assertSectionShape);
  });

  it("emits a valid single section for a no-headings MD doc", () => {
    const { sections } = parseMarkdownTokens("Just prose with no headings at all.");
    expect(Array.isArray(sections)).toBe(true);
    expect(sections.length).toBeGreaterThan(0);
    sections.forEach(assertSectionShape);
  });
});

// ── analyzePDF ────────────────────────────────────────────────────────────
// analyzePDF operates on the post-extraction rawPages shape — no real PDF
// binary or CDN dependency is required. Shape taken from parsePDF.test.js.
describe("analyzePDF — contract", () => {
  // pdf.js transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
  function makeItem(str, x, y, fontSize, fontName = "F1") {
    return {
      str,
      fontName,
      transform: [fontSize, 0, 0, fontSize, x, y],
      width: str.length * (fontSize * 0.6),
      height: fontSize,
      hasEOL: false,
    };
  }

  it("emits valid sections for a minimal synthetic rawPages input", () => {
    const rawPages = [{
      pageNum: 1,
      viewport: { width: 612, height: 792 },
      styles: {},
      items: [
        makeItem("Body line one.", 72, 700, 12),
        makeItem("Body line two.", 72, 680, 12),
      ],
    }];
    const sections = analyzePDF({ rawPages, resolvedOutline: null });
    expect(Array.isArray(sections)).toBe(true);
    expect(sections.length).toBeGreaterThan(0);
    sections.forEach(assertSectionShape);
  });

  it("emits valid sections for a multi-page rawPages input", () => {
    const rawPages = [
      {
        pageNum: 1,
        viewport: { width: 612, height: 792 },
        styles: {},
        items: [
          makeItem("First page body text.", 72, 700, 12),
          makeItem("Continued on this page.", 72, 680, 12),
        ],
      },
      {
        pageNum: 2,
        viewport: { width: 612, height: 792 },
        styles: {},
        items: [
          makeItem("Second page body text.", 72, 700, 12),
        ],
      },
    ];
    const sections = analyzePDF({ rawPages, resolvedOutline: null });
    expect(Array.isArray(sections)).toBe(true);
    expect(sections.length).toBeGreaterThan(0);
    sections.forEach(assertSectionShape);
  });
});

// ── parseEPUB ─────────────────────────────────────────────────────────────
// parseEPUB loads JSZip from CDN (no-op'd by scriptLoader mock) and
// uses a global window.JSZip. We provide a minimal fake JSZip that
// returns synthetic EPUB structure matching the test used in parseEPUB.test.js.
describe("parseEPUB — contract", () => {
  let parseEPUB;

  const CONTAINER_XML = `<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles>
</container>`;

  const OPF_XML = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch3" href="ch3.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
    <itemref idref="ch3"/>
  </spine>
</package>`;

  const NCX_XML = `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <navMap>
    <navPoint><navLabel><text>Chapter One</text></navLabel><content src="ch1.xhtml"/></navPoint>
    <navPoint><navLabel><text>Chapter Two</text></navLabel><content src="ch2.xhtml"/></navPoint>
    <navPoint><navLabel><text>Chapter Three</text></navLabel><content src="ch3.xhtml"/></navPoint>
  </navMap>
</ncx>`;

  function xhtml(body) {
    return `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`;
  }

  beforeEach(async () => {
    const files = {
      "META-INF/container.xml": CONTAINER_XML,
      "OEBPS/content.opf": OPF_XML,
      "OEBPS/toc.ncx": NCX_XML,
      "OEBPS/ch1.xhtml": xhtml("<p>Body of chapter one. It has several words.</p>"),
      "OEBPS/ch2.xhtml": xhtml("<p>Body of chapter two. Prose continues here.</p>"),
      "OEBPS/ch3.xhtml": xhtml("<p>Body of chapter three. Last chapter content.</p>"),
    };
    globalThis.window = globalThis.window ?? globalThis;
    globalThis.window.JSZip = {
      loadAsync: () => Promise.resolve({
        file: (path) => (files[path] !== undefined
          ? { async: () => Promise.resolve(files[path]) }
          : undefined),
      }),
    };
    const mod = await import("../../src/utils/parseEPUB.js");
    parseEPUB = mod.parseEPUB;
  });

  it("emits valid sections for a clean 3-chapter synthetic EPUB", async () => {
    const fakeFile = { arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) };
    const sections = await parseEPUB(fakeFile);
    expect(Array.isArray(sections)).toBe(true);
    expect(sections.length).toBeGreaterThan(0);
    sections.forEach(assertSectionShape);
  });

  it("emits valid sections when NCX is absent (title fallback path)", async () => {
    // Override with no NCX file — chapters fall back to null titles.
    const files = {
      "META-INF/container.xml": CONTAINER_XML,
      "OEBPS/content.opf": OPF_XML,
      "OEBPS/ch1.xhtml": xhtml("<p>Chapter one prose without a title source.</p>"),
      "OEBPS/ch2.xhtml": xhtml("<p>Chapter two prose without a title source.</p>"),
    };
    globalThis.window.JSZip = {
      loadAsync: () => Promise.resolve({
        file: (path) => (files[path] !== undefined
          ? { async: () => Promise.resolve(files[path]) }
          : undefined),
      }),
    };
    const fakeFile = { arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) };
    const sections = await parseEPUB(fakeFile);
    expect(Array.isArray(sections)).toBe(true);
    expect(sections.length).toBeGreaterThan(0);
    sections.forEach(assertSectionShape);
  });
});

// ── parseDOCX ─────────────────────────────────────────────────────────────
// parseDOCX uses mammoth (mocked above) to convert DOCX to HTML, then
// walks the DOM. We feed it synthetic HTML via the mock.
describe("parseDOCX — contract", () => {
  let parseDOCX;

  beforeEach(async () => {
    mammothConvertToHtml.mockReset();
    mammothExtractRawText.mockReset();
    const mod = await import("../../src/utils/parseDOCX.js");
    parseDOCX = mod.parseDOCX;
  });

  it("emits valid sections for a clean 3-chapter synthetic DOCX", async () => {
    mammothConvertToHtml.mockResolvedValue({
      value: [
        "<h1>Chapter One</h1><p>Body of chapter one. Prose content here.</p>",
        "<h1>Chapter Two</h1><p>Body of chapter two. More prose follows.</p>",
        "<h1>Chapter Three</h1><p>Body of chapter three. Final content.</p>",
      ].join(""),
      messages: [],
    });
    const fakeFile = { arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) };
    const sections = await parseDOCX(fakeFile);
    expect(Array.isArray(sections)).toBe(true);
    expect(sections.length).toBeGreaterThan(0);
    sections.forEach(assertSectionShape);
  });

  it("emits a valid section when no headings are present (extractRawText fallback)", async () => {
    mammothConvertToHtml.mockResolvedValue({ value: "", messages: [] });
    mammothExtractRawText.mockResolvedValue({
      value: "Recovered plain prose with no structural headings.",
      messages: [],
    });
    const fakeFile = { arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) };
    // Suppress the expected fallback warning so test output stays clean.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const sections = await parseDOCX(fakeFile);
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThan(0);
      sections.forEach(assertSectionShape);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
