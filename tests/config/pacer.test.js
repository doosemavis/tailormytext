import { describe, it, expect } from "vitest";
import * as P from "../../src/config/pacer";

describe("config/pacer", () => {
  it("has a sane WPM range with the default inside it", () => {
    expect(P.WPM_MIN).toBe(100);
    expect(P.WPM_MAX).toBe(1000);
    expect(P.WPM_DEFAULT).toBeGreaterThanOrEqual(P.WPM_MIN);
    expect(P.WPM_DEFAULT).toBeLessThanOrEqual(P.WPM_MAX);
    expect(P.WPM_STEP).toBe(10);
    expect(P.WPM_NUDGE).toBe(25);
  });

  it("orders the multipliers paragraph > sentence > clause > long word > 1", () => {
    expect(P.MULT_PARAGRAPH).toBeGreaterThan(P.MULT_SENTENCE);
    expect(P.MULT_SENTENCE).toBeGreaterThan(P.MULT_CLAUSE);
    expect(P.MULT_CLAUSE).toBeGreaterThan(P.MULT_LONG_WORD);
    expect(P.MULT_LONG_WORD).toBeGreaterThan(1);
  });

  it("exposes trail, hold, band, and storage constants", () => {
    expect(P.TRAIL_LENGTH).toBe(3);
    expect(P.HOLD_ACCEL_LINES).toBe(10);
    expect(P.SCROLL_BAND).toBeGreaterThan(0);
    expect(P.SCROLL_BAND).toBeLessThan(1);
    expect(P.LONG_WORD_CHARS).toBe(8);
    expect(P.STORAGE_KEY_WPM).toBe("pacer-wpm");
  });
});
