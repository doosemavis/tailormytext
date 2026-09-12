import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PacerWpmSlider from "../../src/components/PacerWpmSlider";
import { THEMES } from "../../src/config/constants";

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
});
