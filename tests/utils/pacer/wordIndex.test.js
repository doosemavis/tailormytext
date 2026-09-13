import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createWordIndex, containerOf, firstVisibleWord } from "../../../src/utils/pacer/wordIndex";

// Mirrors DocumentBody's DOM: .rf-section > .rf-para > span.rf-word[data-word]
function word(text) {
  return `<span class="rf-word" data-word="${text}"><strong>${text[0]}</strong>${text.slice(1)} </span>`;
}
function para(idx, words) {
  return `<div class="rf-para" data-idx="${idx}">${words.map(word).join("")}</div>`;
}
function section(paras) {
  return `<div class="rf-section"><div><h2>T</h2></div>${paras.join("")}</div>`;
}

const SECTIONED = section([para(0, ["One", "two."]), para(1, ["Three"])])
  + section([])                                  // empty section (title only) must be skipped
  + section([para(10000, ["Four", "five,", "six."])]);

const PLAIN = para(0, ["Alpha", "beta."]) + para(1, ["Gamma"]);

function words() { return Array.from(document.querySelectorAll(".rf-word")); }

describe("containerOf", () => {
  it("prefers .rf-section, falls back to .rf-para", () => {
    document.body.innerHTML = `<div id="w">${SECTIONED}</div>`;
    expect(containerOf(words()[0]).className).toBe("rf-section");
    document.body.innerHTML = `<div id="w">${PLAIN}</div>`;
    expect(containerOf(words()[0]).className).toBe("rf-para");
  });
});

describe("createWordIndex on a sectioned document", () => {
  let idx;
  beforeEach(() => {
    document.body.innerHTML = `<div id="w">${SECTIONED}</div>`;
    idx = createWordIndex();
  });

  it("walks forward through paragraphs, skips empty sections, and returns null at the end", () => {
    const w = words();
    const seen = [];
    let cur = w[0];
    while (cur) { seen.push(cur.dataset.word); cur = idx.next(cur); }
    expect(seen).toEqual(["One", "two.", "Three", "Four", "five,", "six."]);
  });

  it("walks backward and returns null at the start", () => {
    const w = words();
    const seen = [];
    let cur = w[w.length - 1];
    while (cur) { seen.push(cur.dataset.word); cur = idx.prev(cur); }
    expect(seen).toEqual(["six.", "five,", "Four", "Three", "two.", "One"]);
  });

  it("reports word text, paragraph end, and a container mean", () => {
    const w = words();
    expect(idx.entry(w[0])).toMatchObject({ word: "One", isParaEnd: false });
    expect(idx.entry(w[1])).toMatchObject({ word: "two.", isParaEnd: true });
    expect(idx.entry(w[2])).toMatchObject({ word: "Three", isParaEnd: true });
    expect(idx.entry(w[0]).mean).toBeGreaterThan(1);
  });

  it("finds the first word under a root", () => {
    const root = document.getElementById("w");
    expect(idx.firstWordIn(root).dataset.word).toBe("One");
    expect(idx.firstWordIn(document.querySelectorAll(".rf-section")[1])).toBeNull();
  });

  it("returns null for an element outside any container", () => {
    const stray = document.createElement("span");
    document.body.appendChild(stray);
    expect(idx.next(stray)).toBeNull();
    expect(idx.entry(stray)).toBeNull();
  });
});

describe("firstVisibleWord", () => {
  const rect = (top, bottom, left = 0, right = 800) => ({ top, bottom, left, right, height: bottom - top, width: right - left });
  let wrapper, reader, idx;
  beforeEach(() => {
    document.body.innerHTML = `<div id="reader"><div id="w">${PLAIN}</div></div>`;
    wrapper = document.getElementById("w");
    reader = document.getElementById("reader");
    reader.getBoundingClientRect = () => rect(0, 600);
    wrapper.getBoundingClientRect = () => rect(-300, 900, 40, 760);
    const paras = document.querySelectorAll(".rf-para");
    paras[0].getBoundingClientRect = () => rect(-300, -20);   // scrolled off the top
    paras[1].getBoundingClientRect = () => rect(10, 400);     // first fully visible
    idx = createWordIndex();
  });
  afterEach(() => { document.elementFromPoint = undefined; });

  it("uses elementFromPoint when a probe lands on a paragraph inside the wrapper", () => {
    const target = document.querySelectorAll(".rf-para")[1].querySelector(".rf-word");
    document.elementFromPoint = vi.fn(() => target);
    expect(firstVisibleWord(wrapper, reader, idx).dataset.word).toBe("Gamma");
    expect(document.elementFromPoint).toHaveBeenCalledTimes(1);
  });

  it("falls back to the rect walk when hit testing misses", () => {
    document.elementFromPoint = vi.fn(() => document.body);
    expect(firstVisibleWord(wrapper, reader, idx).dataset.word).toBe("Gamma");
  });

  it("falls back to the rect walk when elementFromPoint is unavailable", () => {
    expect(firstVisibleWord(wrapper, reader, idx).dataset.word).toBe("Gamma");
    expect(firstVisibleWord(null, reader, idx)).toBeNull();
  });

  it("in a sectioned document, measures only intersecting sections and prefers an exact hit in a later one", () => {
    document.body.innerHTML = `<div id="reader"><div id="w">${SECTIONED}</div></div>`;
    const wrap = document.getElementById("w");
    const rd = document.getElementById("reader");
    rd.getBoundingClientRect = () => rect(0, 600);
    wrap.getBoundingClientRect = () => rect(-1000, 3000, 40, 760);
    const secs = document.querySelectorAll(".rf-section");
    const paras = document.querySelectorAll(".rf-para");
    secs[0].getBoundingClientRect = () => rect(-500, 100);   // straddles the top edge
    paras[0].getBoundingClientRect = () => rect(-500, -100); // fully above
    paras[1].getBoundingClientRect = () => rect(-50, 100);   // partial
    secs[1].getBoundingClientRect = () => rect(100, 120);    // empty section
    secs[2].getBoundingClientRect = () => rect(120, 3000);
    paras[2].getBoundingClientRect = () => rect(130, 400);   // exact, in a later section
    expect(firstVisibleWord(wrap, rd, createWordIndex()).dataset.word).toBe("Four");

    paras[2].getBoundingClientRect = () => rect(700, 900);   // no exact hit anywhere → partial wins
    expect(firstVisibleWord(wrap, rd, createWordIndex()).dataset.word).toBe("Three");

    secs[2].getBoundingClientRect = () => rect(700, 3000);   // section below the reader is never scanned
    paras[2].getBoundingClientRect = vi.fn(() => rect(130, 400));
    firstVisibleWord(wrap, rd, createWordIndex());
    expect(paras[2].getBoundingClientRect).not.toHaveBeenCalled();
  });
});

describe("createWordIndex on a plain-text document", () => {
  it("uses .rf-para as the container and crosses paragraph siblings", () => {
    document.body.innerHTML = `<div id="w">${PLAIN}</div>`;
    const idx = createWordIndex();
    const w = words();
    expect(idx.next(w[1]).dataset.word).toBe("Gamma");
    expect(idx.prev(w[2]).dataset.word).toBe("beta.");
    expect(idx.next(w[2])).toBeNull();
    expect(idx.entry(w[1])).toMatchObject({ word: "beta.", isParaEnd: true });
  });
});
