import { describe, it, expect } from "vitest";
import {
  buildParagraphs,
  deriveBreaksFromSections,
  buildChapters,
} from "../../src/components/EditChaptersModal.jsx";

// Pure-helper contract for EditChaptersModal (D6).
// These helpers drive the paragraph derivation and chapter-break logic;
// D7's applyChapterOverrides must apply the same /\n{2,}/ split to re-derive
// the paragraph stream and resolve break indices correctly.

describe("buildParagraphs", () => {
  it("returns [] for null", () => {
    expect(buildParagraphs(null)).toEqual([]);
  });

  it("returns [] for undefined", () => {
    expect(buildParagraphs(undefined)).toEqual([]);
  });

  it("returns [] for empty array", () => {
    expect(buildParagraphs([])).toEqual([]);
  });

  it("produces one title entry for a section with a title and empty content", () => {
    const sections = [{ title: "Intro", content: "" }];
    const result = buildParagraphs(sections);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ text: "Intro", sectionIdx: 0, isTitle: true });
  });

  it("produces title + 3 body entries for a section with title and 3-paragraph content", () => {
    const sections = [
      { title: "Chapter One", content: "Para A.\n\nPara B.\n\nPara C." },
    ];
    const result = buildParagraphs(sections);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ text: "Chapter One", sectionIdx: 0, isTitle: true });
    expect(result[1]).toEqual({ text: "Para A.", sectionIdx: 0, isTitle: false });
    expect(result[2]).toEqual({ text: "Para B.", sectionIdx: 0, isTitle: false });
    expect(result[3]).toEqual({ text: "Para C.", sectionIdx: 0, isTitle: false });
  });

  it("all body entries carry the correct sectionIdx", () => {
    const sections = [
      { title: "S0", content: "body0a\n\nbody0b" },
      { title: "S1", content: "body1a" },
    ];
    const result = buildParagraphs(sections);
    const s0Entries = result.filter((p) => p.sectionIdx === 0);
    const s1Entries = result.filter((p) => p.sectionIdx === 1);
    expect(s0Entries).toHaveLength(3); // title + 2 body
    expect(s1Entries).toHaveLength(2); // title + 1 body
  });

  it("filters out whitespace-only chunks", () => {
    const sections = [{ title: null, content: "real\n\n   \n\nalso real" }];
    const result = buildParagraphs(sections);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.text)).toEqual(["real", "also real"]);
  });

  it("collapses 3+ newlines: 'a\\n\\n\\n\\nb' → 2 body paragraphs", () => {
    const sections = [{ title: null, content: "a\n\n\n\nb" }];
    const result = buildParagraphs(sections);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("a");
    expect(result[1].text).toBe("b");
  });

  it("sections without a title still produce body entries", () => {
    const sections = [{ content: "no title here" }];
    const result = buildParagraphs(sections);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ text: "no title here", sectionIdx: 0, isTitle: false });
  });

  // Risk-aware edge case: single \n within a block stays as one paragraph;
  // only \n{2,} splits. D7 must use the same derivation when applying overrides.
  it("single \\n within a block does not split: 'line1\\nline2\\n\\nline3' → 2 paragraphs", () => {
    const sections = [{ title: null, content: "line1\nline2\n\nline3" }];
    const result = buildParagraphs(sections);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("line1\nline2");
    expect(result[1].text).toBe("line3");
  });
});

describe("deriveBreaksFromSections", () => {
  it("returns [] for empty paras", () => {
    expect(deriveBreaksFromSections([], [])).toEqual([]);
  });

  it("returns [] for empty docSections", () => {
    const paras = [{ text: "x", sectionIdx: 0, isTitle: false }];
    expect(deriveBreaksFromSections(paras, [])).toEqual([]);
  });

  it("returns [] for a single-section doc (no breaks needed)", () => {
    const sections = [{ title: "Only", content: "body a\n\nbody b" }];
    const paras = buildParagraphs(sections);
    expect(deriveBreaksFromSections(paras, sections)).toEqual([]);
  });

  it("3-section doc with paras [s0,s0,s1,s1,s2] returns [2, 4]", () => {
    const paras = [
      { text: "s0a", sectionIdx: 0, isTitle: false },
      { text: "s0b", sectionIdx: 0, isTitle: false },
      { text: "s1a", sectionIdx: 1, isTitle: false },
      { text: "s1b", sectionIdx: 1, isTitle: false },
      { text: "s2a", sectionIdx: 2, isTitle: false },
    ];
    const sections = [{}, {}, {}];
    expect(deriveBreaksFromSections(paras, sections)).toEqual([2, 4]);
  });

  it("adjacent paragraphs from the same section do not produce a break", () => {
    const paras = [
      { text: "a", sectionIdx: 0, isTitle: false },
      { text: "b", sectionIdx: 0, isTitle: false },
      { text: "c", sectionIdx: 0, isTitle: false },
    ];
    const sections = [{}];
    expect(deriveBreaksFromSections(paras, sections)).toEqual([]);
  });
});

describe("buildChapters", () => {
  it("returns [] for empty paras", () => {
    expect(buildChapters([], [], {})).toEqual([]);
  });

  it("empty breaks + N paragraphs → 1 chapter containing all", () => {
    const paras = [
      { text: "a", sectionIdx: 0, isTitle: false },
      { text: "b", sectionIdx: 0, isTitle: false },
      { text: "c", sectionIdx: 0, isTitle: false },
    ];
    const chapters = buildChapters(paras, [], {});
    expect(chapters).toHaveLength(1);
    expect(chapters[0].startIdx).toBe(0);
    expect(chapters[0].paras).toHaveLength(3);
  });

  it("breaks [2, 5] on 8 paragraphs → 3 chapters with correct startIdx and paragraph slices", () => {
    const paras = Array.from({ length: 8 }, (_, i) => ({
      text: `p${i}`,
      sectionIdx: 0,
      isTitle: false,
    }));
    const chapters = buildChapters(paras, [2, 5], {});
    expect(chapters).toHaveLength(3);
    expect(chapters[0].startIdx).toBe(0);
    expect(chapters[0].paras.map((p) => p.text)).toEqual(["p0", "p1"]);
    expect(chapters[1].startIdx).toBe(2);
    expect(chapters[1].paras.map((p) => p.text)).toEqual(["p2", "p3", "p4"]);
    expect(chapters[2].startIdx).toBe(5);
    expect(chapters[2].paras.map((p) => p.text)).toEqual(["p5", "p6", "p7"]);
  });

  it("titles map keyed by startIdx surfaces as titleOverride on the correct chapter", () => {
    const paras = [
      { text: "a", sectionIdx: 0, isTitle: false },
      { text: "b", sectionIdx: 0, isTitle: false },
      { text: "c", sectionIdx: 1, isTitle: false },
    ];
    const titles = { 0: "My First Chapter", 2: "My Second Chapter" };
    const chapters = buildChapters(paras, [2], titles);
    expect(chapters[0].titleOverride).toBe("My First Chapter");
    expect(chapters[1].titleOverride).toBe("My Second Chapter");
  });

  it("titles not matching any startIdx are ignored (no spurious titleOverride)", () => {
    const paras = [
      { text: "a", sectionIdx: 0, isTitle: false },
      { text: "b", sectionIdx: 0, isTitle: false },
    ];
    const titles = { 99: "Ghost Title" };
    const chapters = buildChapters(paras, [], titles);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].titleOverride).toBeUndefined();
  });

  it("break indices not matching any paragraph index are simply ignored", () => {
    const paras = [
      { text: "a", sectionIdx: 0, isTitle: false },
      { text: "b", sectionIdx: 0, isTitle: false },
    ];
    // 99 is out of range; should produce 1 chapter, not crash
    const chapters = buildChapters(paras, [99], {});
    expect(chapters).toHaveLength(1);
    expect(chapters[0].paras).toHaveLength(2);
  });
});
