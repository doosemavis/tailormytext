import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  registerSection, unregisterSection, materializeSection, dematerializeSection, isMaterialized, _resetMaterializer,
} from "../../src/utils/sectionMaterializer";

function makeSection() {
  const sectionEl = document.createElement("div");
  sectionEl.className = "rf-section";
  const bodyEl = document.createElement("div");
  sectionEl.appendChild(bodyEl);
  document.body.appendChild(sectionEl);
  return { sectionEl, bodyEl };
}

let ioInstances;
class FakeIO {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.observed = new Set(); ioInstances.push(this); }
  observe(el) { this.observed.add(el); }
  unobserve(el) { this.observed.delete(el); }
  disconnect() { this.observed.clear(); }
  fire(el, isIntersecting) { this.cb([{ target: el, isIntersecting }]); }
}

beforeEach(() => { ioInstances = []; _resetMaterializer(); document.body.innerHTML = ""; });
afterEach(() => { vi.unstubAllGlobals(); _resetMaterializer(); });

describe("sectionMaterializer with IntersectionObserver", () => {
  it("starts empty with a placeholder height, fills when near, empties when far keeping its height", () => {
    vi.stubGlobal("IntersectionObserver", FakeIO);
    const { sectionEl, bodyEl } = makeSection();
    registerSection({ sectionEl, bodyEl, paras: ["One two.", "Three"], baseIdx: 20000, getIntensity: () => 0.5 });
    expect(bodyEl.innerHTML).toBe("");
    expect(sectionEl.style.minHeight).toBe("280px");
    expect(isMaterialized(sectionEl)).toBe(false);

    ioInstances[0].fire(sectionEl, true);
    expect(isMaterialized(sectionEl)).toBe(true);
    expect(sectionEl.style.minHeight).toBe("");
    const paras = bodyEl.querySelectorAll(".rf-para");
    expect(Array.from(paras).map((p) => p.dataset.idx)).toEqual(["20000", "20001"]);
    expect(paras[0].querySelectorAll(".rf-word").length).toBe(2);
    expect(paras[0].querySelector(".rf-word strong").textContent).toBe("On");

    Object.defineProperty(sectionEl, "offsetHeight", { value: 900, configurable: true });
    ioInstances[0].fire(sectionEl, false);
    expect(isMaterialized(sectionEl)).toBe(false);
    expect(bodyEl.innerHTML).toBe("");
    expect(sectionEl.style.minHeight).toBe("900px");
  });

  it("materializes on demand and is idempotent; unregister stops observation", () => {
    vi.stubGlobal("IntersectionObserver", FakeIO);
    const { sectionEl, bodyEl } = makeSection();
    registerSection({ sectionEl, bodyEl, paras: ["Alpha"], baseIdx: 0, getIntensity: () => 0.5 });
    expect(materializeSection(sectionEl)).toBe(true);
    const first = bodyEl.innerHTML;
    expect(materializeSection(sectionEl)).toBe(true);
    expect(bodyEl.innerHTML).toBe(first);
    expect(materializeSection(document.createElement("div"))).toBe(false);
    dematerializeSection(document.createElement("div"));   // unknown element: no throw
    unregisterSection(sectionEl);
    expect(ioInstances[0].observed.has(sectionEl)).toBe(false);
    expect(materializeSection(sectionEl)).toBe(false);
  });

  it("re-registering a filled section with new content re-renders it in place", () => {
    vi.stubGlobal("IntersectionObserver", FakeIO);
    const { sectionEl, bodyEl } = makeSection();
    registerSection({ sectionEl, bodyEl, paras: ["Old"], baseIdx: 0, getIntensity: () => 0.5 });
    materializeSection(sectionEl);
    registerSection({ sectionEl, bodyEl, paras: ["New", "Text"], baseIdx: 0, getIntensity: () => 0.5 });
    expect(bodyEl.querySelectorAll(".rf-para").length).toBe(2);
    expect(bodyEl.querySelector(".rf-word").dataset.word).toBe("New");
  });
});

describe("sectionMaterializer without IntersectionObserver", () => {
  it("fills immediately", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { sectionEl, bodyEl } = makeSection();
    registerSection({ sectionEl, bodyEl, paras: ["Alpha beta"], baseIdx: 0, getIntensity: () => 0.5 });
    expect(isMaterialized(sectionEl)).toBe(true);
    expect(bodyEl.querySelectorAll(".rf-word").length).toBe(2);
  });
});
