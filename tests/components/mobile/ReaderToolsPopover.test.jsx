import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Baseline, Palette, Focus, Gauge } from "lucide-react";
import { ReaderToolsPopover } from "../../../src/components/mobile";
import { THEMES } from "../../../src/config/constants";

const t = THEMES.warm;
const render = (ui) => rtlRender(<Tooltip.Provider>{ui}</Tooltip.Provider>);

const makeItems = () => [
  { label: "NeuroDiv", on: false, Icon: Baseline, onToggle: vi.fn() },
  { label: "HueGuide", on: true, Icon: Palette, onToggle: vi.fn() },
  { label: "Focus", on: false, Icon: Focus, onToggle: vi.fn() },
  { label: "Pacer", on: false, Icon: Gauge, onToggle: vi.fn() },
];

describe("ReaderToolsPopover", () => {
  it("shows the four toggles with labels when opened", () => {
    render(<ReaderToolsPopover items={makeItems()} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "Reader tools" }));
    for (const name of ["NeuroDiv", "HueGuide", "Focus", "Pacer"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
      // Radix Popover autofocuses the first focusable child on open, which
      // triggers that item's Tooltip to mount its own visually-hidden
      // role="tooltip" span carrying the same label text (real
      // accessibility behavior, not a bug) — excluded here so this only
      // matches the visible label span this component renders.
      expect(screen.getByText(name, { selector: "span:not([role='tooltip'])" })).toBeTruthy();
    }
  });

  it("reflects on/off state", () => {
    render(<ReaderToolsPopover items={makeItems()} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "Reader tools" }));
    expect(screen.getByRole("button", { name: "HueGuide" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Focus" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("calls the same handler it was given", () => {
    const items = makeItems();
    render(<ReaderToolsPopover items={items} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "Reader tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Focus" }));
    expect(items[2].onToggle).toHaveBeenCalledTimes(1);
    expect(items[0].onToggle).not.toHaveBeenCalled();
  });
});
