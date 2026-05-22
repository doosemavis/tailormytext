import { describe, it, expect } from "vitest";
import { scoreConfidence } from "../../src/utils/scoreConfidence.js";

function uniformSections(n, bodyBytes = 1000) {
  return Array.from({ length: n }, (_, i) => ({
    type: "chapter",
    title: `Chapter ${i + 1}`,
    number: i + 1,
    content: "x".repeat(bodyBytes),
  }));
}

describe("scoreConfidence — base cases", () => {
  it("scores a clean 3-chapter doc at 1.00 (no penalties)", () => {
    const sections = uniformSections(3, 500);
    const { score, reasons } = scoreConfidence(sections, { depthFallback: false });
    expect(score).toBe(1.0);
    expect(reasons).toEqual([]);
  });

  it("scores a depth-fallback doc at < 0.55 with no_repeating_depth", () => {
    const sections = uniformSections(2, 500);
    const { score, reasons } = scoreConfidence(sections, { depthFallback: true });
    expect(score).toBeLessThan(0.55);
    expect(reasons).toContain("no_repeating_depth");
  });

  it("flags single_section", () => {
    const sections = uniformSections(1, 500);
    const { score, reasons } = scoreConfidence(sections, { depthFallback: false });
    expect(score).toBeLessThan(0.85);
    expect(reasons).toContain("single_section");
  });
});

describe("scoreConfidence — graduated size_outlier", () => {
  it("no penalty when ratio <= 2x median", () => {
    const sections = [
      { type: "chapter", title: "A", number: 1, content: "x".repeat(1000) },
      { type: "chapter", title: "B", number: 2, content: "x".repeat(1500) },
      { type: "chapter", title: "C", number: 3, content: "x".repeat(2000) },
    ];
    const { score, reasons } = scoreConfidence(sections, { depthFallback: false });
    expect(reasons).not.toContain("size_outlier");
    expect(score).toBe(1.0);
  });

  it("small penalty for moderate outlier (~5x)", () => {
    const sections = [
      { type: "chapter", title: "A", number: 1, content: "x".repeat(1000) },
      { type: "chapter", title: "B", number: 2, content: "x".repeat(5000) },
      { type: "chapter", title: "C", number: 3, content: "x".repeat(1000) },
    ];
    const { score, reasons } = scoreConfidence(sections, { depthFallback: false });
    expect(reasons).toContain("size_outlier");
    expect(score).toBeGreaterThan(0.85);
    expect(score).toBeLessThan(0.95);
  });

  it("saturates at 0.30 for very large outlier (>=12x)", () => {
    const sections = [
      { type: "chapter", title: "A", number: 1, content: "x".repeat(100) },
      { type: "chapter", title: "B", number: 2, content: "x".repeat(50000) },
      { type: "chapter", title: "C", number: 3, content: "x".repeat(100) },
    ];
    const { score, reasons } = scoreConfidence(sections, { depthFallback: false });
    expect(reasons).toContain("size_outlier");
    expect(score).toBeGreaterThanOrEqual(0.65);
    expect(score).toBeLessThanOrEqual(0.75);
  });

  it("dispersed scoring across outlier severity (no bunching)", () => {
    const mild = scoreConfidence(
      [
        { content: "x".repeat(1000) },
        { content: "x".repeat(3000) },
        { content: "x".repeat(1000) },
      ],
      { depthFallback: false },
    );
    const moderate = scoreConfidence(
      [
        { content: "x".repeat(1000) },
        { content: "x".repeat(6000) },
        { content: "x".repeat(1000) },
      ],
      { depthFallback: false },
    );
    const severe = scoreConfidence(
      [
        { content: "x".repeat(1000) },
        { content: "x".repeat(20000) },
        { content: "x".repeat(1000) },
      ],
      { depthFallback: false },
    );
    expect(mild.score).toBeGreaterThan(moderate.score);
    expect(moderate.score).toBeGreaterThan(severe.score);
  });
});

describe("scoreConfidence — under_detected (low section count vs text size)", () => {
  it("does NOT fire on short docs (< 100 KB)", () => {
    const sections = uniformSections(1, 500);
    const { reasons } = scoreConfidence(sections, {
      depthFallback: false,
      textLength: 50_000,
    });
    expect(reasons).not.toContain("under_detected_severe");
    expect(reasons).not.toContain("under_detected_mild");
  });

  it("fires under_detected_severe when ratio < 0.3 (large doc, few sections)", () => {
    const sections = uniformSections(4, 200_000);
    const { score, reasons } = scoreConfidence(sections, {
      depthFallback: false,
      textLength: 1_200_000,
    });
    expect(reasons).toContain("under_detected_severe");
    expect(score).toBeLessThan(0.70);
  });

  it("fires under_detected_mild when 0.3 <= ratio < 0.5", () => {
    const sections = uniformSections(4, 100_000);
    const { score, reasons } = scoreConfidence(sections, {
      depthFallback: false,
      textLength: 500_000,
    });
    expect(reasons).toContain("under_detected_mild");
    expect(reasons).not.toContain("under_detected_severe");
    expect(score).toBeLessThan(0.85);
  });

  it("no under-detection penalty when ratio >= 0.5", () => {
    const sections = uniformSections(10, 50_000);
    const { reasons } = scoreConfidence(sections, {
      depthFallback: false,
      textLength: 500_000,
    });
    expect(reasons).not.toContain("under_detected_severe");
    expect(reasons).not.toContain("under_detected_mild");
  });

  it("falls back to summed content length when textLength is not provided", () => {
    const sections = uniformSections(4, 200_000);
    const { reasons } = scoreConfidence(sections, { depthFallback: false });
    expect(reasons).toContain("under_detected_severe");
  });
});

describe("scoreConfidence — penalty stacking", () => {
  it("a long single-section doc lands deep in fallback", () => {
    const sections = [{ type: "document", title: null, number: 1, content: "x".repeat(1_000_000) }];
    const { score, reasons } = scoreConfidence(sections, {
      depthFallback: false,
      textLength: 1_000_000,
    });
    expect(reasons).toContain("single_section");
    expect(reasons).toContain("under_detected_severe");
    expect(score).toBeLessThan(0.55);
  });

  it("score clamps to [0, 1]", () => {
    const sections = uniformSections(1, 500);
    const { score } = scoreConfidence(sections, {
      depthFallback: true,
      textLength: 5_000_000,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
