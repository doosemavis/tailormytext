import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlideOverPanel } from "../../../src/components/mobile";

const renderPanel = (props = {}) => {
  const onOpenChange = vi.fn();
  render(
    <SlideOverPanel open onOpenChange={onOpenChange} width={296} background="#fff" borderColor="#ccc" {...props}>
      <button>Inside</button>
    </SlideOverPanel>
  );
  return onOpenChange;
};

describe("SlideOverPanel", () => {
  it("shows its children and a backdrop when open", () => {
    renderPanel();
    expect(screen.getByRole("dialog", { name: "Reader panel" })).toBeTruthy();
    expect(screen.getByTestId("slideover-backdrop")).toBeTruthy();
    expect(screen.getByText("Inside")).toBeTruthy();
  });

  it("keeps children mounted but hidden when closed", () => {
    renderPanel({ open: false });
    const panel = document.querySelector(".rf-slideover");
    expect(panel.getAttribute("data-state")).toBe("closed");
    expect(panel.getAttribute("aria-hidden")).toBe("true");
    expect(panel.textContent).toContain("Inside");
    expect(screen.queryByTestId("slideover-backdrop")).toBeNull();
  });

  it("closes on backdrop click", () => {
    const onOpenChange = renderPanel();
    fireEvent.click(screen.getByTestId("slideover-backdrop"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ignores Escape while closed", () => {
    const onOpenChange = renderPanel({ open: false });
    fireEvent.keyDown(document.querySelector(".rf-slideover"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes on Escape from inside the panel when open", () => {
    const onOpenChange = renderPanel();
    fireEvent.keyDown(screen.getByText("Inside"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ignores other keys", () => {
    const onOpenChange = renderPanel();
    fireEvent.keyDown(screen.getByText("Inside"), { key: "Enter" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  // Radix layers opened from inside the panel (menus, selects, tooltips)
  // consume Escape in a document capture listener with preventDefault; one
  // Escape must close only that layer, not the panel too.
  it("leaves an Escape that another layer already handled", () => {
    const consume = (e) => e.preventDefault();
    document.addEventListener("keydown", consume, { capture: true });
    try {
      const onOpenChange = renderPanel();
      fireEvent.keyDown(screen.getByText("Inside"), { key: "Escape" });
      expect(onOpenChange).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", consume, { capture: true });
    }
  });

  it("moves focus into the panel when it opens", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <SlideOverPanel open={false} onOpenChange={onOpenChange} width={296} background="#fff" borderColor="#ccc">
        <button>Inside</button>
      </SlideOverPanel>
    );
    rerender(
      <SlideOverPanel open onOpenChange={onOpenChange} width={296} background="#fff" borderColor="#ccc">
        <button>Inside</button>
      </SlideOverPanel>
    );
    expect(document.activeElement).toBe(document.querySelector(".rf-slideover"));
  });

  it("restores focus to the previously focused element when it closes", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <>
        <button>Outside trigger</button>
        <SlideOverPanel open={false} onOpenChange={onOpenChange} width={296} background="#fff" borderColor="#ccc">
          <button>Inside</button>
        </SlideOverPanel>
      </>
    );
    const trigger = screen.getByText("Outside trigger");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    rerender(
      <>
        <button>Outside trigger</button>
        <SlideOverPanel open onOpenChange={onOpenChange} width={296} background="#fff" borderColor="#ccc">
          <button>Inside</button>
        </SlideOverPanel>
      </>
    );
    expect(document.activeElement).toBe(document.querySelector(".rf-slideover"));

    rerender(
      <>
        <button>Outside trigger</button>
        <SlideOverPanel open={false} onOpenChange={onOpenChange} width={296} background="#fff" borderColor="#ccc">
          <button>Inside</button>
        </SlideOverPanel>
      </>
    );
    expect(document.activeElement).toBe(trigger);
  });

  // A pointer/touch open must not focus the opener again on close: the
  // opener is a Radix Tooltip trigger, and a programmatic focus opens its
  // tooltip with nothing on a touch screen to close it.
  it("does not restore focus when the opener was focused by pointer, not keyboard", () => {
    const onOpenChange = vi.fn();
    const ui = (open) => (
      <>
        <button>Outside trigger</button>
        <SlideOverPanel open={open} onOpenChange={onOpenChange} width={296} background="#fff" borderColor="#ccc">
          <button>Inside</button>
        </SlideOverPanel>
      </>
    );
    const { rerender } = render(ui(false));
    const trigger = screen.getByText("Outside trigger");
    trigger.focus();
    // happy-dom reports every focus as :focus-visible; simulate a pointer focus.
    const realMatches = trigger.matches.bind(trigger);
    vi.spyOn(trigger, "matches").mockImplementation((sel) => (sel === ":focus-visible" ? false : realMatches(sel)));

    rerender(ui(true));
    expect(document.activeElement).toBe(document.querySelector(".rf-slideover"));
    rerender(ui(false));
    expect(document.activeElement).not.toBe(trigger);
  });
});
