import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import DocumentBody, { PLAIN_CHUNK_SIZE } from "../../src/components/DocumentBody";
import { THEMES } from "../../src/config/constants";
import { _resetMaterializer } from "../../src/utils/sectionMaterializer";

// No IntersectionObserver in the test DOM → sections materialize immediately.
beforeEach(() => { vi.stubGlobal("IntersectionObserver", undefined); _resetMaterializer(); });
afterEach(() => { vi.unstubAllGlobals(); _resetMaterializer(); });

const t = THEMES.warm;
const settings = { fg: t.fg, fgSoft: t.fgSoft, border: t.border };

function mount({ focusMode = false, sections } = {}) {
  const setFocusPara = vi.fn();
  const sectionRefs = { current: [] };
  const titleRefs = { current: [] };
  const props = {
    text: "Alpha beta.\n\nGamma",
    docSections: sections ?? null,
    hasSections: !!sections,
    wrapperRef: vi.fn(),
    featureClassRef: vi.fn(),
    settings,
    intensityRef: { current: 0.5 },
    focusModeRef: { current: focusMode },
    setFocusPara,
    sectionRefs,
    titleRefs,
  };
  const utils = render(<DocumentBody {...props} />);
  return { ...utils, setFocusPara, sectionRefs, titleRefs };
}

describe("DocumentBody", () => {
  it("renders plain-text paragraphs as innerHTML word spans with the live-feature contract", () => {
    const { container } = mount();
    const paras = container.querySelectorAll(".rf-para");
    expect(paras.length).toBe(2);
    expect(paras[0].dataset.idx).toBe("0");
    const words = paras[0].querySelectorAll(".rf-word");
    expect(Array.from(words).map((w) => w.dataset.word)).toEqual(["Alpha", "beta."]);
    expect(words[0].firstElementChild.tagName).toBe("STRONG");
    expect(words[0].firstElementChild.textContent).toBe("Alp");     // 5 chars × 0.5 → 3 (rounded)
    expect(words[0].firstElementChild.nextSibling.textContent).toBe("ha ");
    expect(words[1].dataset.hue).toBe("4");
  });

  it("renders sections with titles, registers refs, and numbers paragraphs per section", () => {
    const sections = [
      { type: "chapter", number: 1, title: "One", content: "First para.\n\nSecond para." },
      { type: "chapter", number: 2, title: null, content: "Chapter Two\n\nBody here." },
    ];
    const { container, sectionRefs, titleRefs } = mount({ sections });
    const secs = container.querySelectorAll(".rf-section");
    expect(secs.length).toBe(2);
    expect(sectionRefs.current[1]).toBe(secs[1]);
    expect(titleRefs.current[0].textContent).toBe("One");
    expect(secs[1].querySelector("h2").textContent).toBe("Chapter Two"); // promoted first line
    const idx = Array.from(container.querySelectorAll(".rf-para")).map((p) => p.dataset.idx);
    expect(idx).toEqual(["0", "1", "10000"]);
    expect(secs[1].querySelector(".rf-section-body .rf-word").dataset.word).toBe("Body");
  });

  it("windows chapterless documents in fixed-size chunks with continuous paragraph indices", () => {
    const text = Array.from({ length: PLAIN_CHUNK_SIZE + 5 }, (_, i) => `Para ${i} words here.`).join("\n\n");
    const { container } = render(<DocumentBody
      text={text} docSections={null} hasSections={false}
      wrapperRef={vi.fn()} featureClassRef={vi.fn()} settings={settings}
      intensityRef={{ current: 0.5 }} focusModeRef={{ current: false }} setFocusPara={vi.fn()}
      sectionRefs={{ current: [] }} titleRefs={{ current: [] }}
    />);
    const chunks = container.querySelectorAll(".rf-section.rf-plain-chunk");
    expect(chunks.length).toBe(2);
    expect(chunks[0].querySelectorAll(".rf-para").length).toBe(PLAIN_CHUNK_SIZE);
    expect(chunks[1].querySelectorAll(".rf-para").length).toBe(5);
    const idx = Array.from(container.querySelectorAll(".rf-para")).map((p) => Number(p.dataset.idx));
    expect(idx).toEqual(Array.from({ length: PLAIN_CHUNK_SIZE + 5 }, (_, i) => i));
    expect(chunks[1].querySelector(".rf-word").dataset.word).toBe("Para");
  });

  it("delegates paragraph hover to setFocusPara only in focus mode", () => {
    const off = mount({ focusMode: false });
    fireEvent.mouseOver(off.container.querySelectorAll(".rf-word")[2]);
    expect(off.setFocusPara).not.toHaveBeenCalled();
    off.unmount();

    const on = mount({ focusMode: true });
    const words = on.container.querySelectorAll(".rf-word");
    fireEvent.mouseOver(words[2]);        // "Gamma" → paragraph 1
    fireEvent.mouseOver(words[2]);        // same paragraph again: no duplicate call
    fireEvent.mouseOver(words[0]);        // paragraph 0
    expect(on.setFocusPara.mock.calls.map((c) => c[0])).toEqual([1, 0]);
  });
});
