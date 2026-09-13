import { describe, it, expect } from "vitest";
import { PACER_FREE_MAX_WPM, clampWpmForTier } from "../../src/config/proFeatures";

describe("clampWpmForTier", () => {
  it("caps free users at the free ceiling", () => {
    expect(PACER_FREE_MAX_WPM).toBe(400);
    expect(clampWpmForTier(1000, false)).toBe(400);
    expect(clampWpmForTier(400, false)).toBe(400);
  });

  it("leaves values under the ceiling alone for free users", () => {
    expect(clampWpmForTier(250, false)).toBe(250);
  });

  it("never caps Pro users", () => {
    expect(clampWpmForTier(1000, true)).toBe(1000);
    expect(clampWpmForTier(250, true)).toBe(250);
  });
});
