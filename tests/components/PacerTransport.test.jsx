import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen, fireEvent, act } from "@testing-library/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import PacerTransport from "../../src/components/PacerTransport";
import { createPacerStore } from "../../src/utils/pacer/store";
import { THEMES } from "../../src/config/constants";
import { WPM_NUDGE } from "../../src/config/pacer";

const t = THEMES.warm;
const render = (ui) => rtlRender(<Tooltip.Provider>{ui}</Tooltip.Provider>);

const fakePacer = (store) => ({ store, togglePlay: vi.fn(), restart: vi.fn(), nudgeWpm: vi.fn() });

describe("PacerTransport", () => {
  it("renders the bar from the store snapshot", () => {
    const store = createPacerStore({ wpm: 300 });
    render(<PacerTransport pacer={fakePacer(store)} t={t} />);
    expect(screen.getByText("300 wpm")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("re-renders on store changes without any parent render", () => {
    const store = createPacerStore({ wpm: 300 });
    render(<PacerTransport pacer={fakePacer(store)} t={t} />);
    act(() => store.set({ wpm: 325, playing: true }));
    expect(screen.getByText("325 wpm")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("forwards control callbacks to the pacer", () => {
    const store = createPacerStore();
    const pacer = fakePacer(store);
    render(<PacerTransport pacer={pacer} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Faster" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(pacer.togglePlay).toHaveBeenCalledTimes(1);
    expect(pacer.nudgeWpm).toHaveBeenCalledWith(WPM_NUDGE);
    expect(pacer.restart).toHaveBeenCalledTimes(1);
  });
});
