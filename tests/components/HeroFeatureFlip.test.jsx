import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import HeroFeatureFlip, { FLIP_DURATION_MS, FLIP_EASE, EDGE_ON_MS, SWAP_OVERLAP_MS } from "../../src/components/HeroFeatureFlip";

// Safari draws the page from flattened snapshots during a View Transition
// (the theme wipe). Flattening breaks `backface-visibility: hidden`, so the
// turned-away face — rotated 180°, i.e. mirrored — painted over the card until
// the wipe ended. The away face must therefore be hidden explicitly.

afterEach(() => { cleanup(); vi.useRealTimers(); });

const faceOf = (text) => screen.getByText(text).closest("[data-flip-face]");

describe("HeroFeatureFlip", () => {
  it("hides the turned-away face without relying on backface-visibility", () => {
    render(<HeroFeatureFlip />);
    expect(faceOf("Your file stays yours").style.visibility).toBe("visible");
    expect(faceOf("A soft anchor for your eye").style.visibility).toBe("hidden");
  });

  // The flip eases in and out, so the card is edge-on (90°) well before half
  // the duration. Swapping at FLIP_DURATION_MS / 2 left ~130ms mid-flip with
  // neither face visible (seen as a blank card on the iOS simulator).
  it("puts the edge-on moment where the easing curve reaches 90°, not at half the duration", () => {
    const [x1, y1, x2, y2] = FLIP_EASE;
    const bez = (s, a, b) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3;
    let lo = 0, hi = 1;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (bez(m, y1, y2) < 0.5) lo = m; else hi = m; }
    const expected = bez((lo + hi) / 2, x1, x2) * FLIP_DURATION_MS;
    expect(EDGE_ON_MS).toBeCloseTo(expected, 0);
    expect(EDGE_ON_MS).toBeLessThan(FLIP_DURATION_MS / 2);
  });

  // The rotation runs on the compositor and the visibility swap on the main
  // thread, so an exact swap at 90° left a one-frame gap with no face on
  // screen. The faces overlap briefly around edge-on instead: normal rendering
  // still culls the turned-away one, and in a flattened snapshot the card is
  // too thin there for mirrored text to read.
  it("shows the incoming face just before edge-on and hides the outgoing one just after", () => {
    render(<HeroFeatureFlip />);
    fireEvent.click(screen.getByRole("button", { name: "Show feature 2 of 6" }));
    const incoming = faceOf("A soft anchor for your eye");
    const outgoing = faceOf("Your file stays yours");
    expect(incoming.style.visibility).toBe("visible");
    expect(outgoing.style.visibility).toBe("hidden");
    expect(SWAP_OVERLAP_MS).toBeGreaterThan(0);
    expect(incoming.style.transition).toContain(`${EDGE_ON_MS - SWAP_OVERLAP_MS}ms`);
    expect(outgoing.style.transition).toContain(`${EDGE_ON_MS + SWAP_OVERLAP_MS}ms`);
  });
});
