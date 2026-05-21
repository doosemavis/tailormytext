import { describe, it, expect } from "vitest";
import { scoreConfidence } from "../../src/utils/scoreConfidence.js";

describe("scoreConfidence", () => {
  it("scores a clean 3-chapter doc at >= 0.85", () => {
    const sections = [
      { type: "chapter", title: "Chapter 1", number: 1, content: "Lots of prose here..." },
      { type: "chapter", title: "Chapter 2", number: 2, content: "More prose here..." },
      { type: "chapter", title: "Chapter 3", number: 3, content: "Still more prose..." },
    ];
    const { score } = scoreConfidence(sections, { depthFallback: false });
    expect(score).toBeGreaterThanOrEqual(0.85);
  });

  it("scores a depth-fallback doc at < 0.55", () => {
    const sections = [
      { type: "chapter", title: "Intro", number: 1, content: "..." },
      { type: "chapter", title: "About the author", number: 2, content: "..." },
    ];
    const { score, reasons } = scoreConfidence(sections, { depthFallback: true });
    expect(score).toBeLessThan(0.55);
    expect(reasons).toContain("no_repeating_depth");
  });

  it("penalizes a size outlier", () => {
    const sections = [
      { type: "chapter", title: "A", number: 1, content: "x".repeat(100) },
      { type: "chapter", title: "B", number: 2, content: "x".repeat(50000) },
      { type: "chapter", title: "C", number: 3, content: "x".repeat(100) },
    ];
    const { score, reasons } = scoreConfidence(sections, { depthFallback: false });
    expect(score).toBeLessThan(0.80);
    expect(reasons).toContain("size_outlier");
  });
});
