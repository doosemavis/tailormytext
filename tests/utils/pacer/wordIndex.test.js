import { describe, it, expect, beforeEach } from "vitest";
import { createWordIndex, containerOf } from "../../../src/utils/pacer/wordIndex";

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
