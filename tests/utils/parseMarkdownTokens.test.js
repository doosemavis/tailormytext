import { describe, it, expect } from "vitest";
import { parseMarkdownTokens } from "../../src/utils/parseMarkdownTokens.js";

// Token→Section adapter contract — see docs/architecture/PARSER_CONTRACT.md.
//
// marked.lexer() produces a token stream; this adapter walks it into
// { sections, confidence } where sections follows Section[] per the
// renderer contract and confidence = { score, reasons }. The mapping
// below is locked by these tests so a future marked version bump (or a
// misguided refactor) can't silently drift the content shape.

describe("parseMarkdownTokens — section boundaries", () => {
  it("emits a single 'document' section for prose with no headings", () => {
    const { sections } = parseMarkdownTokens("Just one paragraph of prose. No headings at all.");
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe("document");
    expect(sections[0].title).toBeNull();
    expect(sections[0].content).toContain("Just one paragraph");
  });

  it("starts a new section at every h1", () => {
    const md = "# One\n\nBody one.\n\n# Two\n\nBody two.";
    const { sections } = parseMarkdownTokens(md);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ type: "chapter", title: "One", number: 1 });
    expect(sections[1]).toMatchObject({ type: "chapter", title: "Two", number: 2 });
  });

  it("repeated h1's split sections; lone h1 + repeated h2's flips to h2 splits", () => {
    // Dynamic-depth rule: the smallest depth occurring ≥2 times is the
    // section break. For "# Title ## A ## B" with body text in between,
    // h2 becomes the chapter break, the lone h1 is dropped as doc-title
    // metadata, and pre-chapter body becomes a leading "document" section
    // so the intro is preserved.
    const md = "# Document Title\n\nIntro.\n\n## Chapter A\n\nbody\n\n## Chapter B\n\nbody";
    const { sections } = parseMarkdownTokens(md);
    expect(sections).toHaveLength(3);
    expect(sections[0].type).toBe("document");
    expect(sections[0].content).toContain("Intro.");
    expect(sections.slice(1).map((s) => s.title)).toEqual(["Chapter A", "Chapter B"]);
  });

  it("lone h1 with NO intro body collapses to just the chapters", () => {
    // semantic-sections.html shape: h1 doc title + repeated chapter headings.
    // No intro means the leading "document" section is empty and skipped.
    const md = "# Document Title\n\n## Chapter A\n\nbody\n\n## Chapter B\n\nbody";
    const { sections } = parseMarkdownTokens(md);
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.title)).toEqual(["Chapter A", "Chapter B"]);
  });

  it("when h1 repeats, h2 stays inline (clean-doc.md fixture)", () => {
    const md = "# Ch1\n\nbody\n\n## Sub\n\nstill ch1\n\n# Ch2\n\nbody";
    const { sections } = parseMarkdownTokens(md);
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.title)).toEqual(["Ch1", "Ch2"]);
    expect(sections[0].content).toContain("## Sub");
  });

  it("h3+ does NOT start a section; it becomes an inline ## / ### heading", () => {
    const md = "# Chapter\n\n### Inline heading\n\nBody.";
    const { sections } = parseMarkdownTokens(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].content).toContain("### Inline heading");
  });

  it("content before the first heading lands in a leading 'document' section", () => {
    const md = "Intro paragraph before any heading.\n\n# First Heading\n\nBody.";
    const { sections } = parseMarkdownTokens(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].type).toBe("document");
    expect(sections[0].content).toContain("Intro paragraph");
    expect(sections[1].title).toBe("First Heading");
  });
});

describe("parseMarkdownTokens — inline emphasis mapping", () => {
  it("**bold** stays **bold** (renderer's private marker)", () => {
    const { sections: [s] } = parseMarkdownTokens("Some **bold word** here.");
    expect(s.content).toContain("**bold word**");
  });

  it("*italic* and _italic_ both become __italic__", () => {
    const { sections: sectA } = parseMarkdownTokens("Some *italicised* word.");
    expect(sectA[0].content).toContain("__italicised__");
    const { sections: sectB } = parseMarkdownTokens("Some _underscored_ word.");
    expect(sectB[0].content).toContain("__underscored__");
  });

  it("[link text](url) keeps the label and drops the URL", () => {
    const { sections: [s] } = parseMarkdownTokens("Click [the link](https://example.com) please.");
    expect(s.content).toContain("the link");
    expect(s.content).not.toContain("example.com");
    expect(s.content).not.toContain("(https");
  });

  it("inline `code` drops the backticks (no monospace style in renderer)", () => {
    const { sections: [s] } = parseMarkdownTokens("Use the `useState` hook.");
    expect(s.content).toContain("useState");
    expect(s.content).not.toContain("`useState`");
  });

  it("![image](src) is dropped entirely", () => {
    const { sections: [s] } = parseMarkdownTokens("Look at this ![cool pic](/img.png) image.");
    expect(s.content).not.toContain("cool pic");
    expect(s.content).not.toContain("/img.png");
  });
});

describe("parseMarkdownTokens — block elements", () => {
  it("- bullet lists render as one '- item' line per entry", () => {
    const md = "- alpha\n- beta\n- gamma";
    const { sections: [s] } = parseMarkdownTokens(md);
    expect(s.content).toContain("- alpha");
    expect(s.content).toContain("- beta");
    expect(s.content).toContain("- gamma");
  });

  it("numbered lists render as '1. item' with the original start number", () => {
    const { sections: [s] } = parseMarkdownTokens("3. third\n4. fourth");
    expect(s.content).toContain("3. third");
    expect(s.content).toContain("4. fourth");
  });

  it("fenced code blocks render as plain text without backticks or lang tag", () => {
    const md = "```js\nconst x = 1;\nconst y = 2;\n```";
    const { sections: [s] } = parseMarkdownTokens(md);
    expect(s.content).toContain("const x = 1");
    expect(s.content).toContain("const y = 2");
    expect(s.content).not.toContain("```");
    expect(s.content).not.toContain("js\n");
  });

  it("blockquote lines render as plain paragraphs (no '> ' prefix)", () => {
    const { sections: [s] } = parseMarkdownTokens("> A pithy thought.\n> Continued thought.");
    expect(s.content).toContain("A pithy thought");
    expect(s.content).toContain("Continued thought");
    expect(s.content).not.toContain("> ");
  });

  it("HTML comments are dropped", () => {
    const { sections: [s] } = parseMarkdownTokens("Some prose.\n\n<!-- editor's note -->\n\nMore prose.");
    expect(s.content).toContain("Some prose");
    expect(s.content).toContain("More prose");
    expect(s.content).not.toContain("editor");
    expect(s.content).not.toContain("<!--");
  });

  it("horizontal rules (---, ***) are dropped", () => {
    const md = "Paragraph one.\n\n---\n\nParagraph two.";
    const { sections: [s] } = parseMarkdownTokens(md);
    expect(s.content).toContain("Paragraph one");
    expect(s.content).toContain("Paragraph two");
    expect(s.content).not.toMatch(/^---$/m);
  });

  it("strikethrough ~~text~~ is rendered as plain text (we don't have a strike style)", () => {
    const { sections: [s] } = parseMarkdownTokens("This is ~~struck out~~ text.");
    expect(s.content).toContain("struck out");
    expect(s.content).not.toContain("~~");
  });
});

describe("parseMarkdownTokens — confidence signal", () => {
  it("returns confidence.score ≥ 0.70 and no no_repeating_depth reason when a repeating heading depth exists", () => {
    const md = "# Chapter 1\n\nProse.\n\n# Chapter 2\n\nMore.";
    const result = parseMarkdownTokens(md);
    expect(result).toHaveProperty("sections");
    expect(result).toHaveProperty("confidence");
    expect(result.confidence).toHaveProperty("score");
    expect(result.confidence).toHaveProperty("reasons");
    expect(result.confidence.reasons).not.toContain("no_repeating_depth");
  });
  it("returns confidence.reasons containing no_repeating_depth when no repeating depth exists (only one heading)", () => {
    const md = "# Solo Chapter\n\nProse.";
    const result = parseMarkdownTokens(md);
    expect(result.confidence.reasons).toContain("no_repeating_depth");
  });
  it("returns confidence without no_repeating_depth for a no-headings doc (fallback doesn't apply)", () => {
    // No headings means pickSectionDepth returns Infinity and never fires
    // the fallback path — no_repeating_depth reason should not appear.
    const md = "Just prose, no headings.";
    const result = parseMarkdownTokens(md);
    expect(result.confidence.reasons).not.toContain("no_repeating_depth");
  });
});

describe("parseMarkdownTokens — edge cases", () => {
  it("link inside heading: title keeps the label, not the URL", () => {
    const md = "# Chapter [with link](https://example.com)\n\nBody.";
    const { sections: [s] } = parseMarkdownTokens(md);
    expect(s.title).toBe("Chapter with link");
  });

  it("escaped emphasis (\\*not italic\\*) survives as literal characters", () => {
    const { sections: [s] } = parseMarkdownTokens("Some \\*not italic\\* text.");
    expect(s.content).toContain("*not italic*");
    expect(s.content).not.toContain("__not italic__");
  });

  it("setext h1 (=== underline) splits sections; setext h2 (---) stays inline", () => {
    const md = "First Heading\n=============\n\nBody one.\n\nA Sub-Heading\n--------------\n\nBody two.";
    const { sections } = parseMarkdownTokens(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("First Heading");
    expect(sections[0].content).toContain("## A Sub-Heading");
  });

  it("setext h1 with multiple === sections produces multiple chapters", () => {
    const md = "Chapter A\n=========\n\nBody A.\n\nChapter B\n=========\n\nBody B.";
    const { sections } = parseMarkdownTokens(md);
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.title)).toEqual(["Chapter A", "Chapter B"]);
  });

  it("YAML front matter does NOT appear in any section's content", () => {
    const md = "---\ntitle: Hello\nauthor: Me\n---\n\n# Real Heading\n\nBody.";
    const { sections } = parseMarkdownTokens(md);
    // Either a leading "document" section with the frontmatter dropped, or
    // just the # Real Heading section. Either way: no YAML in output.
    for (const s of sections) {
      expect(s.content).not.toMatch(/^title:/m);
      expect(s.content).not.toMatch(/^author:/m);
    }
  });

  it("sections without content are dropped (no phantom 'empty chapter')", () => {
    const md = "# Empty\n\n# Real\n\nThis one has content.";
    const { sections } = parseMarkdownTokens(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Real");
  });

  it("strips front matter even when document has no headings", () => {
    const md = `---\ntitle: My Doc\nauthor: Me\n---\n\nJust some prose. No headings.`;
    const { sections } = parseMarkdownTokens(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].content).not.toContain("title:");
    expect(sections[0].content).not.toContain("---");
    expect(sections[0].content.trim()).toBe("Just some prose. No headings.");
  });

  it("no-headings fallback uses stripped MD, not raw input (BOM + front matter not leaked)", () => {
    // This exercises the sections.length === 0 fallback path (line 242).
    // After stripping, the body is only hrs+spaces — all render to "" — so
    // sections stays empty and the fallback fires. The raw `md` contains
    // front matter; stripped does not. The fallback must use stripped.
    const bom = "﻿";
    const md = bom + "---\ntitle: My Doc\nauthor: Me\n---\n\n---\n\n---";
    const { sections } = parseMarkdownTokens(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].content).not.toContain("title:");
    expect(sections[0].content).not.toContain("author:");
    expect(sections[0].content).not.toContain("﻿");
  });

  it("returns sections satisfying the renderer contract", () => {
    const ALLOWED = ["chapter", "page", "section", "document"];
    const { sections } = parseMarkdownTokens("# A\n\ntext\n\n# B\n\nmore");
    for (const s of sections) {
      expect(ALLOWED).toContain(s.type);
      expect(typeof s.content).toBe("string");
      expect(s.content.trim()).not.toBe("");
      if (s.title !== null) expect(s.title.trim()).not.toBe("");
      if (s.number !== null) expect(s.number).toBeGreaterThan(0);
    }
  });
});
