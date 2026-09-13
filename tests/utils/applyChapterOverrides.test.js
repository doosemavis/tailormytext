import { describe, it, expect } from "vitest";
import { applyChapterOverrides } from "../../src/utils/applyChapterOverrides.js";

// Behavioral tests for applyChapterOverrides (D7).
// Companion to tests/components/EditChaptersModal.test.jsx which covers the
// paragraph-stream derivation. Here we verify that the override application
// produces correct Section[] output for the renderer.

// Helper: build a minimal Section[] fixture with N paragraphs across
// one section so tests can specify content cheaply.
function oneSection(paras, title = null) {
  return [{ type: "chapter", title, number: 1, content: paras.join("\n\n") }];
}

// ── Identity cases ──────────────────────────────────────────────────────────

describe("applyChapterOverrides — identity / early-return", () => {
  it("returns input array unchanged (===) when overrides is null", () => {
    const sections = oneSection(["Para one.", "Para two."]);
    expect(applyChapterOverrides(sections, null)).toBe(sections);
  });

  it("returns input array unchanged (===) when overrides is undefined", () => {
    const sections = oneSection(["Para one."]);
    expect(applyChapterOverrides(sections, undefined)).toBe(sections);
  });

  it("returns input array unchanged (===) when overrides.breaks is undefined", () => {
    const sections = oneSection(["Para one."]);
    expect(applyChapterOverrides(sections, { titles: { 0: "Foo" } })).toBe(sections);
  });

  it("returns input array unchanged (===) when sections is empty", () => {
    const sections = [];
    expect(applyChapterOverrides(sections, { breaks: [2] })).toBe(sections);
  });
});

// ── breaks = [] (single chapter) ────────────────────────────────────────────

describe("applyChapterOverrides — empty breaks array", () => {
  it("empty breaks collapses everything into one chapter", () => {
    const sections = oneSection(["Alpha.", "Beta.", "Gamma."]);
    const result = applyChapterOverrides(sections, { breaks: [] });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("chapter");
    expect(result[0].number).toBe(1);
  });

  it("empty breaks: chapter title falls back to 'Chapter 1' when no isTitle para", () => {
    const sections = oneSection(["Paragraph one.", "Paragraph two."]);
    const result = applyChapterOverrides(sections, { breaks: [] });
    expect(result[0].title).toBe("Chapter 1");
  });

  it("empty breaks: content is all paragraphs joined by \\n\\n", () => {
    const sections = oneSection(["Alpha.", "Beta."]);
    const result = applyChapterOverrides(sections, { breaks: [] });
    expect(result[0].content).toBe("Alpha.\n\nBeta.");
  });
});

// ── breaks = [2, 5] on 8-paragraph document ─────────────────────────────────

describe("applyChapterOverrides — breaks [2, 5] on 8-paragraph doc", () => {
  // 8 paras (no titles) → [0..1] | [2..4] | [5..7] = 3 chapters
  const PARAS = ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"];

  it("produces 3 chapters", () => {
    const sections = oneSection(PARAS);
    const result = applyChapterOverrides(sections, { breaks: [2, 5] });
    expect(result).toHaveLength(3);
  });

  it("chapter boundaries are correct", () => {
    const sections = oneSection(PARAS);
    const result = applyChapterOverrides(sections, { breaks: [2, 5] });
    expect(result[0].content).toBe("p0\n\np1");
    expect(result[1].content).toBe("p2\n\np3\n\np4");
    expect(result[2].content).toBe("p5\n\np6\n\np7");
  });

  it("chapter numbers are 1-indexed", () => {
    const sections = oneSection(PARAS);
    const result = applyChapterOverrides(sections, { breaks: [2, 5] });
    expect(result.map((c) => c.number)).toEqual([1, 2, 3]);
  });

  it("chapters without explicit titles get 'Chapter N' defaults", () => {
    const sections = oneSection(PARAS);
    const result = applyChapterOverrides(sections, { breaks: [2, 5] });
    expect(result.map((c) => c.title)).toEqual(["Chapter 1", "Chapter 2", "Chapter 3"]);
  });
});

// ── Title overrides ──────────────────────────────────────────────────────────

describe("applyChapterOverrides — title overrides", () => {
  it("titles[0] overrides chapter 1's title", () => {
    const sections = oneSection(["Para one.", "Para two.", "Para three."]);
    const result = applyChapterOverrides(sections, {
      breaks: [2],
      titles: { 0: "Foo" },
    });
    expect(result[0].title).toBe("Foo");
    expect(result[1].title).toBe("Chapter 2");
  });

  it("trimmed empty title string does NOT override (falls through to auto)", () => {
    const sections = oneSection(["Para one.", "Para two."]);
    const result = applyChapterOverrides(sections, {
      breaks: [],
      titles: { 0: "   " },
    });
    expect(result[0].title).toBe("Chapter 1");
  });

  it("empty string title does NOT override", () => {
    const sections = oneSection(["Para one."]);
    const result = applyChapterOverrides(sections, {
      breaks: [],
      titles: { 0: "" },
    });
    expect(result[0].title).toBe("Chapter 1");
  });
});

// ── isTitle paragraph hoisting ───────────────────────────────────────────────

describe("applyChapterOverrides — isTitle paragraph hoisting", () => {
  // When a section has a title, buildParagraphs emits it as isTitle:true.
  // That paragraph should be hoisted as the chapter title and NOT appear in content.
  it("hoists an isTitle paragraph as the chapter title", () => {
    const sections = [
      { type: "chapter", title: "My Title", number: 1, content: "Body A.\n\nBody B." },
    ];
    const result = applyChapterOverrides(sections, { breaks: [] });
    expect(result[0].title).toBe("My Title");
    expect(result[0].content).toBe("Body A.\n\nBody B.");
  });

  it("isTitle paragraph text does NOT appear in content", () => {
    const sections = [
      { type: "chapter", title: "My Title", number: 1, content: "Body A." },
    ];
    const result = applyChapterOverrides(sections, { breaks: [] });
    expect(result[0].content).not.toContain("My Title");
  });

  it("explicit title override wins over isTitle hoist", () => {
    const sections = [
      { type: "chapter", title: "Auto Title", number: 1, content: "Body A." },
    ];
    const result = applyChapterOverrides(sections, {
      breaks: [],
      titles: { 0: "Manual Override" },
    });
    expect(result[0].title).toBe("Manual Override");
  });

  it("when explicit override wins, the leading isTitle para is still excluded from content", () => {
    const sections = [
      { type: "chapter", title: "Auto Title", number: 1, content: "Body A." },
    ];
    const result = applyChapterOverrides(sections, {
      breaks: [],
      titles: { 0: "Manual Override" },
    });
    expect(result[0].content).not.toContain("Auto Title");
    expect(result[0].content).toBe("Body A.");
  });

  it("mid-slice isTitle is NOT hoisted — stays in content (chapter title falls through to default)", () => {
    // paras: [SecA-title(0), A1(1), A2(2), SecB-title(3), B1(4), B2(5)]
    // break [2] → chapter 2 = [A2, SecB-title, B1, B2]. The leading para A2 is
    // not a title; SecB-title sits mid-slice and must NOT be hoisted as the
    // chapter title — that would mislabel chapter 2 as "Section B".
    const sections = [
      { type: "chapter", title: "Section A", number: 1, content: "A1.\n\nA2." },
      { type: "chapter", title: "Section B", number: 2, content: "B1.\n\nB2." },
    ];
    const result = applyChapterOverrides(sections, { breaks: [2] });
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Section A");
    expect(result[0].content).toBe("A1.");
    expect(result[1].title).toBe("Chapter 2");
    expect(result[1].content).toBe("A2.\n\nSection B\n\nB1.\n\nB2.");
  });
});

// ── Out-of-range break indices ───────────────────────────────────────────────

describe("applyChapterOverrides — out-of-range break indices", () => {
  it("break index >= paraCount is filtered out", () => {
    // 3 paras (no title section) → paraCount = 3; break at 99 is ignored
    const sections = oneSection(["A.", "B.", "C."]);
    const result = applyChapterOverrides(sections, { breaks: [99] });
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("A.\n\nB.\n\nC.");
  });

  it("break index <= 0 is filtered out", () => {
    const sections = oneSection(["A.", "B.", "C."]);
    const result = applyChapterOverrides(sections, { breaks: [0] });
    expect(result).toHaveLength(1);
  });

  it("negative break index is filtered out", () => {
    const sections = oneSection(["A.", "B."]);
    const result = applyChapterOverrides(sections, { breaks: [-1] });
    expect(result).toHaveLength(1);
  });

  it("duplicate break indices produce no duplicate chapters", () => {
    const sections = oneSection(["A.", "B.", "C.", "D."]);
    // Two breaks at index 2 — Set deduplication should give only 1 extra chapter
    const result = applyChapterOverrides(sections, { breaks: [2, 2] });
    expect(result).toHaveLength(2);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe("applyChapterOverrides — edge cases", () => {
  it("section with title-only and no body content: title hoisted, content is empty string", () => {
    const sections = [{ type: "chapter", title: "Just A Title", number: 1, content: "" }];
    const result = applyChapterOverrides(sections, { breaks: [] });
    expect(result[0].title).toBe("Just A Title");
    expect(result[0].content).toBe("");
  });

  it("single-paragraph doc with breaks:[] preserves the paragraph in content", () => {
    const sections = oneSection(["Only one paragraph."]);
    const result = applyChapterOverrides(sections, { breaks: [] });
    expect(result[0].content).toBe("Only one paragraph.");
  });

  it("multi-section input is flattened into one paragraph stream before splitting", () => {
    const sections = [
      { type: "chapter", title: null, number: 1, content: "A.\n\nB." },
      { type: "chapter", title: null, number: 2, content: "C.\n\nD." },
    ];
    // paras: A(0), B(1), C(2), D(3) — break at 2 means section boundary preserved
    const result = applyChapterOverrides(sections, { breaks: [2] });
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("A.\n\nB.");
    expect(result[1].content).toBe("C.\n\nD.");
  });

  it("output sections all have type 'chapter'", () => {
    // Even if input had type 'document' or 'section'
    const sections = [{ type: "document", title: null, number: null, content: "A.\n\nB." }];
    const result = applyChapterOverrides(sections, { breaks: [1] });
    expect(result.every((s) => s.type === "chapter")).toBe(true);
  });
});
