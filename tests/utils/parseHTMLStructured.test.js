import { describe, it, expect } from "vitest";
import { parseHTMLStructured } from "../../src/utils/detectStructure.js";

// Phase 4 — point fixes to the HTML walker. Each describe-block locks one
// fix from the plan so future refactors can't quietly re-introduce a bug.

describe("parseHTMLStructured — script/style stripping (Task 4.1)", () => {
  it("does NOT leak <script> source into any section's content", () => {
    const html = `<html><body>
      <h1>Article</h1>
      <p>Real paragraph.</p>
      <script>const evilTracker = "PII"; alert(evilTracker);</script>
    </body></html>`;
    const { sections } = parseHTMLStructured(html);
    for (const s of sections) {
      expect(s.content).not.toContain("evilTracker");
      expect(s.content).not.toContain("alert(");
      expect(s.content).not.toContain("PII");
    }
  });

  it("does NOT leak <style> source into any section's content", () => {
    const html = `<html><body>
      <h1>Article</h1>
      <p>Real paragraph.</p>
      <style>.leaked { color: red; font-family: 'should-not-appear'; }</style>
    </body></html>`;
    const { sections } = parseHTMLStructured(html);
    for (const s of sections) {
      expect(s.content).not.toContain("should-not-appear");
      expect(s.content).not.toContain("color: red");
    }
  });

  it("also strips noscript/iframe/object/embed contents", () => {
    const html = `<html><body>
      <h1>Article</h1>
      <p>Real paragraph.</p>
      <noscript>noscript-fallback-text</noscript>
      <iframe src="x">iframe-text</iframe>
      <object>object-text</object>
      <embed>embed-text</embed>
    </body></html>`;
    const { sections } = parseHTMLStructured(html);
    for (const s of sections) {
      expect(s.content).not.toContain("noscript-fallback-text");
      expect(s.content).not.toContain("iframe-text");
      expect(s.content).not.toContain("object-text");
      expect(s.content).not.toContain("embed-text");
    }
  });
});

describe("parseHTMLStructured — heading detection (Task 4.2 + 90% push)", () => {
  it("happy-path: h1 splits chapters", () => {
    const html = `<html><body>
      <h1>One</h1><p>x</p>
      <h1>Two</h1><p>y</p>
    </body></html>`;
    const { sections } = parseHTMLStructured(html);
    expect(sections).toHaveLength(2);
  });

  it("dynamic depth: repeated h2's split chapters when h1 is the lone doc title", () => {
    // Same dynamic-depth rule as parseMarkdownTokens: smallest depth that
    // repeats (≥2 occurrences) is the section break. A lone h1 (doc title)
    // above repeated h2's flips the break to h2.
    const html = `<html><body>
      <h1>Doc Title</h1>
      <h2>Section A</h2>
      <p>body a</p>
      <h2>Section B</h2>
      <p>body b</p>
    </body></html>`;
    const { sections } = parseHTMLStructured(html);
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.title)).toEqual(["Section A", "Section B"]);
  });

  it("when h1 repeats, h2 stays inline (typical chapter+subsection doc)", () => {
    const html = `<html><body>
      <h1>Ch1</h1><p>body</p>
      <h2>Sub</h2><p>still ch1</p>
      <h1>Ch2</h1><p>body</p>
    </body></html>`;
    const { sections } = parseHTMLStructured(html);
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.title)).toEqual(["Ch1", "Ch2"]);
    expect(sections[0].content).toContain("## Sub");
  });
});

describe("parseHTMLStructured — semantic container recursion (90% push)", () => {
  it("recurses through <article> wrappers to find headings", () => {
    const html = `<html><body>
      <article>
        <h1>Real Title</h1>
        <p>Body.</p>
      </article>
    </body></html>`;
    const { sections: [s] } = parseHTMLStructured(html);
    expect(s.title).toBe("Real Title");
    expect(s.content).toContain("Body");
  });

  it("recurses through <section> wrappers", () => {
    const html = `<html><body>
      <section><h1>A</h1><p>body a</p></section>
      <section><h1>B</h1><p>body b</p></section>
    </body></html>`;
    const { sections } = parseHTMLStructured(html);
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.title)).toEqual(["A", "B"]);
  });

  it("drops <footer> entirely (boilerplate copyright)", () => {
    const html = `<html><body>
      <h1>Article</h1>
      <p>Real paragraph.</p>
      <footer>Copyright 1999, do not read.</footer>
    </body></html>`;
    const { sections: [s] } = parseHTMLStructured(html);
    expect(s.content).toContain("Real paragraph");
    expect(s.content).not.toContain("Copyright 1999");
  });
});

describe("parseHTMLStructured — parsererror detection (Task 4.3)", () => {
  it("happy-path: well-formed HTML returns sections cleanly (no throw)", () => {
    const html = `<html><body><h1>Title</h1><p>Body.</p></body></html>`;
    expect(() => parseHTMLStructured(html)).not.toThrow();
  });

  // NB: text/html mode in DOMParser auto-corrects most malformed input
  // (unclosed tags, missing body, etc) so parseFromString rarely emits
  // a <parsererror> node — happy-dom and real browsers both forgive a
  // lot. The defensive check still runs in case future inputs hit the
  // rare edge that DOES surface parsererror. We assert the GOOD path
  // here and trust the same parsererror pattern proven by parseEPUB
  // (Tasks 1.2-1.4) for the bad-path.
});

describe("parseHTMLStructured — type harmonization (Task 4.4)", () => {
  it("emits type:'chapter', not 'section'", () => {
    const html = `<html><body>
      <h1>Title</h1>
      <p>Body paragraph.</p>
    </body></html>`;
    const { sections: [s] } = parseHTMLStructured(html);
    expect(s.type).toBe("chapter");
  });

  it("fallback (no-headings) section type is still 'document' (from detectTextStructure)", () => {
    const html = `<html><body><p>Just one paragraph.</p></body></html>`;
    const { sections } = parseHTMLStructured(html);
    expect(sections[0].type).toBe("document");
  });
});

describe("parseHTMLStructured — textContent fallback consistency (Task A5)", () => {
  it("falls back via textContent (not innerText) when no semantic structure", () => {
    const html = `<html><body><p>One paragraph.</p><p>Another paragraph.</p></body></html>`;
    const { sections } = parseHTMLStructured(html);
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) {
      expect(s.content.trim().length).toBeGreaterThan(0);
    }
    const joined = sections.map((s) => s.content).join(" ");
    expect(joined).toContain("One paragraph.");
    expect(joined).toContain("Another paragraph.");
  });
});

describe("parseHTMLStructured — confidence signal", () => {
  it("returns confidence without no_repeating_depth when a repeating heading depth exists", () => {
    const html = `<html><body>
      <h1>Chapter One</h1><p>Body one.</p>
      <h1>Chapter Two</h1><p>Body two.</p>
    </body></html>`;
    const result = parseHTMLStructured(html);
    expect(result).toHaveProperty("sections");
    expect(result).toHaveProperty("confidence");
    expect(result.confidence).toHaveProperty("score");
    expect(result.confidence).toHaveProperty("reasons");
    expect(result.confidence.reasons).not.toContain("no_repeating_depth");
    // PARSER_CONTRACT.md §8: ≥ 0.70 = high confidence band
    expect(result.confidence.score).toBeGreaterThanOrEqual(0.70);
  });

  it("returns confidence.reasons containing no_repeating_depth when only a single unique heading depth exists", () => {
    const html = `<html><body>
      <h2>Solo Section</h2><p>Body.</p>
    </body></html>`;
    const result = parseHTMLStructured(html);
    expect(result.confidence.reasons).toContain("no_repeating_depth");
    // PARSER_CONTRACT.md §8: < 0.70 (no repeating depth penalty −0.50 applied)
    expect(result.confidence.score).toBeLessThan(0.70);
  });

  it("returns confidence without no_repeating_depth for no-headings doc (fallback doesn't apply)", () => {
    const html = `<html><body><p>Just prose, no headings.</p></body></html>`;
    const result = parseHTMLStructured(html);
    expect(result.confidence.reasons).not.toContain("no_repeating_depth");
  });
});
