import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBreakpoint, readBreakpoint } from "../../src/hooks/useBreakpoint";

const original = window.matchMedia;

function evaluate(query, { width, coarse }) {
  const max = query.match(/max-width: (\d+)px/);
  if (max) return width <= Number(max[1]);
  if (query.includes("pointer: coarse")) return coarse;
  return false;
}

// Fake matchMedia whose state can change; fires "change" listeners like a browser.
function installMatchMedia(initial) {
  const state = { ...initial };
  const listeners = new Set();
  window.matchMedia = vi.fn((query) => ({
    media: query,
    get matches() { return evaluate(query, state); },
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  }));
  return {
    set(next) {
      Object.assign(state, next);
      listeners.forEach((fn) => fn());
    },
  };
}

afterEach(() => { window.matchMedia = original; });

describe("readBreakpoint", () => {
  it.each([
    [360, "phone"], [767, "phone"], [768, "tablet"], [1023, "tablet"], [1024, "desktop"], [1440, "desktop"],
  ])("width %i is %s", (width, tier) => {
    installMatchMedia({ width, coarse: false });
    expect(readBreakpoint().tier).toBe(tier);
  });

  it("reports touch from pointer: coarse", () => {
    installMatchMedia({ width: 1024, coarse: true });
    expect(readBreakpoint()).toEqual({ tier: "desktop", isTouch: true });
  });

  it("falls back to desktop without matchMedia", () => {
    window.matchMedia = undefined;
    expect(readBreakpoint()).toEqual({ tier: "desktop", isTouch: false });
  });
});

describe("useBreakpoint", () => {
  it("updates when a tier boundary is crossed", () => {
    const mm = installMatchMedia({ width: 1280, coarse: false });
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.tier).toBe("desktop");
    act(() => mm.set({ width: 820 }));
    expect(result.current.tier).toBe("tablet");
    act(() => mm.set({ width: 390 }));
    expect(result.current.tier).toBe("phone");
  });

  it("keeps the same object when a change stays inside a tier", () => {
    const mm = installMatchMedia({ width: 1280, coarse: false });
    const { result } = renderHook(() => useBreakpoint());
    const first = result.current;
    act(() => mm.set({ width: 1100 }));
    expect(result.current).toBe(first);
  });
});
