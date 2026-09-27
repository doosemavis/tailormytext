import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { trailingSpaceWidth, createCursorRing, CURSOR_CLASS, CURSOR_TRIM_VAR } from "../../../src/utils/pacer/cursorRing";

// happy-dom does no text layout, so Range rects are faked: the width reported
// for a range is whatever `spaceWidth` holds when it is measured.
let spaceWidth = 0;
const realCreateRange = document.createRange.bind(document);

beforeEach(() => {
  spaceWidth = 5.5;
  vi.spyOn(document, "createRange").mockImplementation(() => {
    const r = realCreateRange();
    r.getBoundingClientRect = () => ({ width: spaceWidth, height: 0, top: 0, left: 0, right: spaceWidth, bottom: 0 });
    return r;
  });
});
afterEach(() => { vi.restoreAllMocks(); });

function word(html = "<strong>neu</strong>roscience ") {
  const el = document.createElement("span");
  el.className = "rf-word";
  el.innerHTML = html;
  return el;
}

describe("trailingSpaceWidth", () => {
  it("measures the whitespace that ends a word span", () => {
    expect(trailingSpaceWidth(word())).toBe(5.5);
  });

  it("measures a word whose trailing text node is only the space", () => {
    expect(trailingSpaceWidth(word("<strong>a</strong> "))).toBe(5.5);
  });

  it("is 0 when the word has no trailing whitespace", () => {
    expect(trailingSpaceWidth(word("<strong>end</strong>ing"))).toBe(0);
  });
});

describe("createCursorRing", () => {
  let root;
  let ring;
  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
    ring = createCursorRing(() => root);
  });
  afterEach(() => { ring.dispose(); root.remove(); });

  it("show marks the word and trims the ring by its trailing space", () => {
    const w = word(); root.appendChild(w);
    ring.show(w);
    expect(w.classList.contains(CURSOR_CLASS)).toBe(true);
    expect(w.style.getPropertyValue(CURSOR_TRIM_VAR)).toBe("5.5px");
  });

  it("hide removes the class and the trim", () => {
    const w = word(); root.appendChild(w);
    ring.show(w);
    ring.hide(w);
    expect(w.classList.contains(CURSOR_CLASS)).toBe(false);
    expect(w.style.getPropertyValue(CURSOR_TRIM_VAR)).toBe("");
  });

  it("showing another word moves the ring off the first", () => {
    const a = word(); const b = word(); root.append(a, b);
    ring.show(a);
    ring.show(b);
    expect(a.classList.contains(CURSOR_CLASS)).toBe(false);
    expect(a.style.getPropertyValue(CURSOR_TRIM_VAR)).toBe("");
    expect(b.classList.contains(CURSOR_CLASS)).toBe(true);
  });

  it("re-measures when the reader's style changes (font, size, spacing edits while paused)", async () => {
    const w = word(); root.appendChild(w);
    ring.show(w);
    spaceWidth = 9;
    root.style.setProperty("--rf-word-spacing", "4px");
    await new Promise((r) => setTimeout(r, 0));
    expect(w.style.getPropertyValue(CURSOR_TRIM_VAR)).toBe("9px");
  });

  it("stops re-measuring once hidden", async () => {
    const w = word(); root.appendChild(w);
    ring.show(w);
    ring.hide(w);
    spaceWidth = 9;
    root.className = "rf-neurodiv";
    await new Promise((r) => setTimeout(r, 0));
    expect(w.style.getPropertyValue(CURSOR_TRIM_VAR)).toBe("");
  });
});
