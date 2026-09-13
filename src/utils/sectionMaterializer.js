import { paragraphHtml } from "./paragraphHtml";

// DOM windowing for sectioned documents. A section's paragraphs exist in the
// DOM only while the section is near the viewport; far sections are emptied
// and hold their last measured height. Rationale: with the whole book in the
// DOM (~1.5M nodes on Don Quixote) any inherited style change — theme,
// typography vars, feature classes, even Radix toggling pointer-events on
// <body> — recomputes style for every node (~1.2s measured), regardless of
// content-visibility. Keeping ~3 chapters live makes those recalcs cheap.
//
// The registry is keyed by the `.rf-section` element. DocumentBody registers
// each section with its paragraph sources; an IntersectionObserver (or an
// immediate materialize where IO is unavailable) drives fill/empty; the pacer
// and chapter jumps call materializeSection() on demand so they never see an
// empty chapter.

const registry = new WeakMap();
const NEAR_MARGIN = "150% 0px";
const EST_PARA_PX = 140;  // placeholder height per never-rendered paragraph

let observer = null;
function getObserver() {
  if (observer || typeof IntersectionObserver === "undefined") return observer;
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) materializeSection(e.target);
      else dematerializeSection(e.target);
    }
  }, { root: null, rootMargin: NEAR_MARGIN });
  return observer;
}

export function isMaterialized(sectionEl) {
  const rec = registry.get(sectionEl);
  return !!rec && rec.filled;
}

// Register (or re-register on content change) and start observing. When the
// IntersectionObserver API is missing (tests, old engines) the section is
// filled immediately and stays filled.
export function registerSection({ sectionEl, bodyEl, paras, baseIdx, getIntensity }) {
  const prev = registry.get(sectionEl);
  const rec = { bodyEl, paras, baseIdx, getIntensity, filled: false };
  registry.set(sectionEl, rec);
  if (prev && prev.filled) {
    materializeSection(sectionEl);
    return;
  }
  sectionEl.style.minHeight = `${paras.length * EST_PARA_PX}px`;
  const io = getObserver();
  if (io) io.observe(sectionEl);
  else materializeSection(sectionEl);
}

export function unregisterSection(sectionEl) {
  const io = getObserver();
  if (io) io.unobserve(sectionEl);
  registry.delete(sectionEl);
}

// Fill the section's body now. Returns true when the section is (now) filled,
// false when the element is not a registered section.
export function materializeSection(sectionEl) {
  const rec = registry.get(sectionEl);
  if (!rec) return false;
  if (rec.filled) return true;
  const intensity = rec.getIntensity();
  let html = "";
  for (let i = 0; i < rec.paras.length; i++) {
    html += `<div class="rf-para" data-idx="${rec.baseIdx + i}">${paragraphHtml(rec.paras[i], intensity)}</div>`;
  }
  rec.bodyEl.innerHTML = html;
  rec.filled = true;
  sectionEl.style.minHeight = "";
  return true;
}

export function dematerializeSection(sectionEl) {
  const rec = registry.get(sectionEl);
  if (!rec || !rec.filled) return;
  // Freeze the measured height so scroll offsets below stay put.
  const h = sectionEl.offsetHeight;
  if (h > 0) sectionEl.style.minHeight = `${h}px`;
  rec.bodyEl.innerHTML = "";
  rec.filled = false;
}

// Test hook: drop the shared observer between tests.
export function _resetMaterializer() {
  if (observer) observer.disconnect();
  observer = null;
}
