import { describe, it, expect } from "vitest";
import { baseDelayMs, wordMultiplier, meanMultiplier, delayFor } from "../../../src/utils/pacer/timing";
import { MULT_LONG_WORD, MULT_CLAUSE, MULT_SENTENCE, MULT_PARAGRAPH } from "../../../src/config/pacer";

describe("baseDelayMs", () => {
  it("is 60000 / wpm", () => {
    expect(baseDelayMs(300)).toBeCloseTo(200);
    expect(baseDelayMs(100)).toBeCloseTo(600);
  });
});

describe("wordMultiplier", () => {
  it("is 1 for a plain short word", () => {
    expect(wordMultiplier("the")).toBe(1);
  });
  it("applies the long-word multiplier past 8 characters", () => {
    expect(wordMultiplier("eightchr")).toBe(1);          // exactly 8
    expect(wordMultiplier("ninechars")).toBe(MULT_LONG_WORD);
  });
  it("applies the clause multiplier for , ; :", () => {
    expect(wordMultiplier("well,")).toBe(MULT_CLAUSE);
    expect(wordMultiplier("well;")).toBe(MULT_CLAUSE);
    expect(wordMultiplier("well:")).toBe(MULT_CLAUSE);
  });
  it("applies the sentence multiplier for . ! ? including trailing quotes or brackets", () => {
    expect(wordMultiplier("end.")).toBe(MULT_SENTENCE);
    expect(wordMultiplier("end!")).toBe(MULT_SENTENCE);
    expect(wordMultiplier("end?")).toBe(MULT_SENTENCE);
    expect(wordMultiplier('end."')).toBe(MULT_SENTENCE);
    expect(wordMultiplier("end.’")).toBe(MULT_SENTENCE);
    expect(wordMultiplier("end.)")).toBe(MULT_SENTENCE);
  });
  it("applies the paragraph multiplier when isParaEnd", () => {
    expect(wordMultiplier("end.", true)).toBe(MULT_PARAGRAPH);
    expect(wordMultiplier("plain", true)).toBe(MULT_PARAGRAPH);
  });
  it("takes the largest applicable multiplier, never stacking", () => {
    // long + sentence → sentence wins
    expect(wordMultiplier("extraordinarily.")).toBe(MULT_SENTENCE);
    // long + clause → clause wins
    expect(wordMultiplier("extraordinarily,")).toBe(MULT_CLAUSE);
  });
});

describe("meanMultiplier", () => {
  it("returns 1 for an empty list", () => {
    expect(meanMultiplier([])).toBe(1);
  });
  it("averages the multipliers", () => {
    const entries = [
      { word: "a", isParaEnd: false },       // 1
      { word: "b,", isParaEnd: false },      // 1.5
      { word: "c.", isParaEnd: true },       // 2.5
    ];
    expect(meanMultiplier(entries)).toBeCloseTo((1 + 1.5 + 2.5) / 3);
  });
});

describe("delayFor", () => {
  it("scales the base delay by multiplier over mean", () => {
    // wpm 300 → base 200ms. word "end." multiplier 2.0, mean 1.25 → 320ms
    expect(delayFor("end.", false, 300, 1.25)).toBeCloseTo(320);
  });

  it("keeps a container's total time equal to words / wpm (honest WPM)", () => {
    const words = "It was the best of times, it was the worst of times. Extraordinarily so! End".split(" ");
    const entries = words.map((w, i) => ({ word: w, isParaEnd: i === words.length - 1 }));
    const wpm = 250;
    const mean = meanMultiplier(entries);
    const totalMs = entries.reduce((sum, e) => sum + delayFor(e.word, e.isParaEnd, wpm, mean), 0);
    const expectedMs = (entries.length / wpm) * 60000;
    expect(Math.abs(totalMs - expectedMs) / expectedMs).toBeLessThan(0.01);
  });
});
