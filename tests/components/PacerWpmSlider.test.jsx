import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import PacerWpmSlider from "../../src/components/PacerWpmSlider";
import { THEMES } from "../../src/config/constants";
import { PACER_FREE_MAX_WPM } from "../../src/config/proFeatures";
import { WPM_MAX } from "../../src/config/pacer";

const t = THEMES.warm;

describe("PacerWpmSlider", () => {
  it("shows the formatted value", () => {
    render(<PacerWpmSlider value={250} onChange={() => {}} isPro={false} t={t} />);
    expect(screen.getByText("250 wpm")).toBeTruthy();
    expect(screen.getByText("Words per minute")).toBeTruthy();
  });

  it("shows a lock marker at the free cap for free users only", () => {
    const { rerender } = render(<PacerWpmSlider value={250} onChange={() => {}} isPro={false} t={t} />);
    expect(screen.getByLabelText(/faster than 400 wpm is pro/i)).toBeTruthy();
    rerender(<PacerWpmSlider value={250} onChange={() => {}} isPro={true} t={t} />);
    expect(screen.queryByLabelText(/faster than 400 wpm is pro/i)).toBeNull();
  });

  // Regression: the pacer clamps a free user's committed WPM to the cap. The
  // first push past the lock changes the value (250 → 400) and the slider
  // snapped back, but every later push commits a value the pacer clamps to the
  // SAME 400, so the prop never changed and the slider kept showing e.g. 1000.
  it("snaps back to the cap on every push past the lock, not just the first", () => {
    function ClampingParent() {
      const [wpm, setWpm] = useState(250);
      return <PacerWpmSlider value={wpm} onChange={(v) => setWpm(Math.min(v, PACER_FREE_MAX_WPM))} isPro={false} t={t} />;
    }
    render(<ClampingParent />);
    const thumb = screen.getByRole("slider");

    fireEvent.keyDown(thumb, { key: "End" });
    expect(screen.getByText(`${PACER_FREE_MAX_WPM} wpm`)).toBeTruthy();

    fireEvent.keyDown(thumb, { key: "End" });
    expect(screen.getByText(`${PACER_FREE_MAX_WPM} wpm`)).toBeTruthy();
    expect(thumb.getAttribute("aria-valuenow")).toBe(String(PACER_FREE_MAX_WPM));
  });

  it("keeps an accepted value (no snap-back when the parent takes it)", () => {
    function PassThroughParent() {
      const [wpm, setWpm] = useState(250);
      return <PacerWpmSlider value={wpm} onChange={setWpm} isPro={true} t={t} />;
    }
    render(<PassThroughParent />);
    const thumb = screen.getByRole("slider");
    fireEvent.keyDown(thumb, { key: "End" });
    expect(screen.getByText(`${WPM_MAX} wpm`)).toBeTruthy();
  });
});
