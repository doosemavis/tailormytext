import { describe, it, expect } from "vitest";
import { revealSection, releaseSection, jumpScrollTop } from "../../src/utils/sectionJump";

const rect = (top) => ({ top, bottom: top + 100, left: 0, right: 100, width: 100, height: 100 });

describe("sectionJump", () => {
  it("reveals and releases only the given section via inline content-visibility", () => {
    const section = document.createElement("div");
    revealSection(section);
    expect(section.style.contentVisibility).toBe("visible");
    releaseSection(section);
    expect(section.style.contentVisibility).toBe("");
    expect(() => { revealSection(null); releaseSection(undefined); }).not.toThrow();
  });

  it("computes the scroll offset that lands the target under the gutter", () => {
    const container = document.createElement("div");
    const target = document.createElement("h2");
    container.getBoundingClientRect = () => rect(100);
    container.scrollTop = 5000;
    target.getBoundingClientRect = () => rect(400);   // 300px below the container's top edge
    expect(jumpScrollTop(container, target, 8)).toBe(5000 + 300 - 8);
    expect(jumpScrollTop(container, target)).toBe(5292);
  });

  it("never returns a negative offset", () => {
    const container = document.createElement("div");
    const target = document.createElement("h2");
    container.getBoundingClientRect = () => rect(100);
    container.scrollTop = 0;
    target.getBoundingClientRect = () => rect(50);
    expect(jumpScrollTop(container, target)).toBe(0);
  });
});
