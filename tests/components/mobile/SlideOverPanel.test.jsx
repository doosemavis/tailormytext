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
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes on Escape when open", () => {
    const onOpenChange = renderPanel();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
