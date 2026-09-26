import { describe, it, expect } from "vitest";
import { PHONE_MAX, TABLET_MAX, MQ_PHONE, MQ_TABLET_DOWN, MQ_TOUCH } from "../../src/config/breakpoints";

describe("breakpoints", () => {
  it("uses the spec's tier boundaries", () => {
    expect(PHONE_MAX).toBe(767);
    expect(TABLET_MAX).toBe(1023);
  });
  it("builds media queries from the constants", () => {
    expect(MQ_PHONE).toBe("(max-width: 767px)");
    expect(MQ_TABLET_DOWN).toBe("(max-width: 1023px)");
    expect(MQ_TOUCH).toBe("(pointer: coarse)");
  });
});
