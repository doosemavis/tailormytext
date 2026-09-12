import { describe, it, expect } from "vitest";
import { lineStep, paragraphStep, createHoldAccel } from "../../../src/utils/pacer/nav";

// A fake document: words laid on a grid. Each word is { id, para, line, x }.
// Lines are 20px tall; x is the left edge, each word 30px wide.
function makeDoc(spec) {
  // spec: array of paragraphs, each an array of lines, each an array of word ids
  const words = [];
  let line = 0;
  spec.forEach((paraLines, p) => {
    paraLines.forEach((ids) => {
      ids.forEach((id, col) => words.push({ id, para: p, line, x: col * 30 }));
      line += 1;
    });
    line += 1; // paragraph gap: one empty line
  });
  const at = (w) => words.indexOf(w);
  return {
    words,
    next: (w) => words[at(w) + 1] ?? null,
    prev: (w) => words[at(w) - 1] ?? null,
    measure: (w) => ({ top: w.line * 20, left: w.x, right: w.x + 30 }),
    paraOf: (w) => w.para,
    byId: (id) => words.find((w) => w.id === id),
  };
}

describe("lineStep", () => {
  const doc = makeDoc([
    [["a1", "a2", "a3"], ["b1", "b2"]],   // para 0: two lines
    [["c1", "c2", "c3", "c4"]],           // para 1: one line
  ]);
  const deps = { next: doc.next, prev: doc.prev, measure: doc.measure, lineHeight: 20 };

  it("moves down to the word with the nearest horizontal centre", () => {
    expect(lineStep(doc.byId("a3"), 1, deps).id).toBe("b2");
    expect(lineStep(doc.byId("a1"), 1, deps).id).toBe("b1");
  });

  it("moves up likewise", () => {
    expect(lineStep(doc.byId("b2"), -1, deps).id).toBe("a2");
  });

  it("crosses a paragraph gap to the next real line", () => {
    expect(lineStep(doc.byId("b1"), 1, deps).id).toBe("c1");
    expect(lineStep(doc.byId("b2"), 1, deps).id).toBe("c2");
  });

  it("returns null when there is no further line", () => {
    expect(lineStep(doc.byId("c4"), 1, deps)).toBeNull();
    expect(lineStep(doc.byId("a1"), -1, deps)).toBeNull();
  });
});

describe("paragraphStep", () => {
  const doc = makeDoc([
    [["a1", "a2"]],
    [["b1", "b2", "b3"]],
    [["c1"]],
  ]);
  const deps = { next: doc.next, prev: doc.prev, paraOf: doc.paraOf };

  it("goes to the first word of the next paragraph", () => {
    expect(paragraphStep(doc.byId("a2"), 1, deps).id).toBe("b1");
    expect(paragraphStep(doc.byId("b2"), 1, deps).id).toBe("c1");
  });

  it("goes to the first word of the previous paragraph", () => {
    expect(paragraphStep(doc.byId("b3"), -1, deps).id).toBe("a1");
    expect(paragraphStep(doc.byId("c1"), -1, deps).id).toBe("b1");
  });

  it("returns null at document edges", () => {
    expect(paragraphStep(doc.byId("c1"), 1, deps)).toBeNull();
    expect(paragraphStep(doc.byId("a1"), -1, deps)).toBeNull();
  });
});

describe("createHoldAccel", () => {
  it("returns line steps for the first N presses, then paragraph steps", () => {
    const h = createHoldAccel(3);
    expect(h.onKeyDown("ArrowDown", false)).toBe("line");
    expect(h.onKeyDown("ArrowDown", true)).toBe("line");
    expect(h.onKeyDown("ArrowDown", true)).toBe("line");
    expect(h.onKeyDown("ArrowDown", true)).toBe("paragraph");
    expect(h.onKeyDown("ArrowDown", true)).toBe("paragraph");
  });

  it("resets on key up", () => {
    const h = createHoldAccel(2);
    h.onKeyDown("ArrowDown", false);
    h.onKeyDown("ArrowDown", true);
    expect(h.onKeyDown("ArrowDown", true)).toBe("paragraph");
    h.onKeyUp();
    expect(h.onKeyDown("ArrowDown", false)).toBe("line");
  });

  it("resets when a different key or a non-repeat press arrives", () => {
    const h = createHoldAccel(1);
    h.onKeyDown("ArrowDown", false);
    expect(h.onKeyDown("ArrowDown", true)).toBe("paragraph");
    expect(h.onKeyDown("ArrowUp", true)).toBe("line");
    expect(h.onKeyDown("ArrowUp", false)).toBe("line");
  });

  it("defaults the threshold to the config value", () => {
    const h = createHoldAccel();
    let last = "line";
    for (let i = 0; i < 10; i++) last = h.onKeyDown("ArrowDown", i > 0);
    expect(last).toBe("line");
    expect(h.onKeyDown("ArrowDown", true)).toBe("paragraph");
  });
});
