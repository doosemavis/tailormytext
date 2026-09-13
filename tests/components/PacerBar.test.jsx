import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import PacerBar from "../../src/components/PacerBar";
import { THEMES } from "../../src/config/constants";
import { WPM_NUDGE } from "../../src/config/pacer";

const t = THEMES.warm;

// Tip (Primitives) renders a Radix Tooltip, which requires a Provider
// ancestor. The app supplies one at its root; tests supply it here.
const render = (ui) => rtlRender(<Tooltip.Provider>{ui}</Tooltip.Provider>);

describe("PacerBar", () => {
  it("renders a toolbar with labelled controls and the WPM readout", () => {
    render(<PacerBar playing={false} wpm={300} onPlayPause={() => {}} onRestart={() => {}} onNudge={() => {}} t={t} />);
    expect(screen.getByRole("toolbar", { name: /pacer/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restart" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Slower" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Faster" })).toBeTruthy();
    expect(screen.getByText("300 wpm")).toBeTruthy();
  });

  it("labels the primary button Pause while playing", () => {
    render(<PacerBar playing={true} wpm={300} onPlayPause={() => {}} onRestart={() => {}} onNudge={() => {}} t={t} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("wires the callbacks", () => {
    const onPlayPause = vi.fn(); const onRestart = vi.fn(); const onNudge = vi.fn();
    render(<PacerBar playing={false} wpm={300} onPlayPause={onPlayPause} onRestart={onRestart} onNudge={onNudge} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    fireEvent.click(screen.getByRole("button", { name: "Faster" }));
    fireEvent.click(screen.getByRole("button", { name: "Slower" }));
    expect(onPlayPause).toHaveBeenCalledTimes(1);
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onNudge).toHaveBeenNthCalledWith(1, WPM_NUDGE);
    expect(onNudge).toHaveBeenNthCalledWith(2, -WPM_NUDGE);
  });

  it("announces WPM changes politely", () => {
    render(<PacerBar playing={false} wpm={300} onPlayPause={() => {}} onRestart={() => {}} onNudge={() => {}} t={t} />);
    expect(screen.getByText("300 wpm").getAttribute("aria-live")).toBe("polite");
  });
});
