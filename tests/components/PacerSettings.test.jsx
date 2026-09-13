import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import PacerSettings from "../../src/components/PacerSettings";
import { createPacerStore } from "../../src/utils/pacer/store";
import { THEMES } from "../../src/config/constants";

const t = THEMES.warm;

describe("PacerSettings", () => {
  it("renders the slider readout and the hint", () => {
    const store = createPacerStore({ wpm: 275 });
    render(<PacerSettings pacer={{ store, setWpm: vi.fn() }} isPro={false} t={t} />);
    expect(screen.getByText("275 wpm")).toBeTruthy();
    expect(screen.getByText(/Click a word or use the arrow keys/)).toBeTruthy();
  });

  it("tracks store updates", () => {
    const store = createPacerStore({ wpm: 275 });
    render(<PacerSettings pacer={{ store, setWpm: vi.fn() }} isPro={true} t={t} />);
    act(() => store.set({ wpm: 600 }));
    expect(screen.getByText("600 wpm")).toBeTruthy();
  });
});
