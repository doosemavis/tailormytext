import { meanMultiplier } from "./timing";
import { materializeSection } from "../sectionMaterializer";

// Ordered traversal over the `.rf-word` spans DocumentBody renders, holding
// one container's word list in memory at a time. On a 427K-word book this
// bounds per-step work to one Map lookup and, at container boundaries, one
// querySelectorAll over a single chapter.
// See docs/superpowers/specs/2026-09-12-wpm-pacer-design.md §3.3.

const CONTAINER_SELECTOR = ".rf-section, .rf-para";

export function containerOf(el) {
  if (!el || typeof el.closest !== "function") return null;
  return el.closest(".rf-section") || el.closest(".rf-para");
}

function siblingContainer(container, dir) {
  let el = dir > 0 ? container.nextElementSibling : container.previousElementSibling;
  while (el && !el.matches(CONTAINER_SELECTOR)) {
    el = dir > 0 ? el.nextElementSibling : el.previousElementSibling;
  }
  return el;
}

function buildCache(container) {
  // Windowed sections may be empty until asked for (sectionMaterializer);
  // fill on demand so the pacer never treats a far chapter as wordless.
  materializeSection(container);
  const words = Array.from(container.querySelectorAll(".rf-word"));
  const indexOf = new Map(words.map((w, i) => [w, i]));
  const paraOf = words.map((w) => w.closest(".rf-para"));
  const paraEnd = words.map((_, i) => i + 1 >= words.length || paraOf[i + 1] !== paraOf[i]);
  const entries = words.map((w, i) => ({ word: w.dataset.word || "", isParaEnd: paraEnd[i] }));
  return { container, words, indexOf, paraEnd, mean: meanMultiplier(entries) };
}

// First word of the first paragraph whose top edge is inside the reader's
// viewport; falls back to a paragraph that straddles the top edge.
// Fast path: hit-test a few points down the reader's left text edge with
// elementFromPoint, which is O(1) regardless of document size. The rect
// walk over every .rf-para (8,400 on a 420K-word book) is the fallback for
// environments without hit testing or when the probes land on chrome.
const PROBE_FRACTIONS = [0.02, 0.1, 0.25, 0.45, 0.7];

function hitTestParagraph(wrapper, rr) {
  if (typeof document.elementFromPoint !== "function") return null;
  const wr = wrapper.getBoundingClientRect();
  const x = Math.min(rr.right - 1, wr.left + Math.max(8, Math.min(24, wr.width / 4)));
  for (const f of PROBE_FRACTIONS) {
    const hit = document.elementFromPoint(x, rr.top + rr.height * f);
    const para = hit && typeof hit.closest === "function" ? hit.closest(".rf-para") : null;
    if (para && wrapper.contains(para)) return para;
  }
  return null;
}

// Rect walk over one list of paragraphs: the first whose top edge is inside
// the reader wins; otherwise the first that straddles the reader's top.
function scanParagraphs(paras, rr) {
  let partial = null;
  for (const p of paras) {
    const r = p.getBoundingClientRect();
    if (r.top >= rr.top && r.top < rr.bottom) return { exact: p, partial };
    if (!partial && r.bottom > rr.top && r.top < rr.bottom) partial = p;
  }
  return { exact: null, partial };
}

// Bounded fallback: only paragraphs inside sections that intersect the
// reader are measured, so a 146-chapter book costs ~146 rect reads plus one
// chapter, not every paragraph in the book.
function walkVisibleParagraph(wrapper, rr) {
  const sections = wrapper.querySelectorAll(".rf-section");
  if (sections.length === 0) {
    const { exact, partial } = scanParagraphs(wrapper.querySelectorAll(".rf-para"), rr);
    return exact || partial;
  }
  let firstPartial = null;
  for (const s of sections) {
    const r = s.getBoundingClientRect();
    if (r.bottom <= rr.top || r.top >= rr.bottom) continue;
    const { exact, partial } = scanParagraphs(s.querySelectorAll(".rf-para"), rr);
    if (exact) return exact;
    if (!firstPartial) firstPartial = partial;
  }
  return firstPartial;
}

export function firstVisibleWord(wrapper, reader, index) {
  if (!wrapper || !reader) return null;
  const rr = reader.getBoundingClientRect();
  const hit = hitTestParagraph(wrapper, rr);
  if (hit) {
    const w = index.firstWordIn(hit);
    if (w) return w;
  }
  const para = walkVisibleParagraph(wrapper, rr);
  return para ? index.firstWordIn(para) : null;
}

export function createWordIndex() {
  let cache = null;

  function ensure(el) {
    const container = containerOf(el);
    if (!container) return null;
    if (!cache || cache.container !== container) cache = buildCache(container);
    return cache;
  }

  // Step to an adjacent word, hopping containers (and skipping empty ones)
  // until a word is found or the document runs out.
  function step(el, dir) {
    const c = ensure(el);
    if (!c) return null;
    const i = c.indexOf.get(el);
    if (i === undefined) return null;
    const j = i + dir;
    if (j >= 0 && j < c.words.length) return c.words[j];
    let container = c.container;
    for (;;) {
      container = siblingContainer(container, dir);
      if (!container) return null;
      const nextCache = buildCache(container);
      if (nextCache.words.length > 0) {
        cache = nextCache;
        return dir > 0 ? nextCache.words[0] : nextCache.words[nextCache.words.length - 1];
      }
    }
  }

  return {
    next: (el) => step(el, +1),
    prev: (el) => step(el, -1),
    entry(el) {
      const c = ensure(el);
      if (!c) return null;
      const i = c.indexOf.get(el);
      if (i === undefined) return null;
      return { word: c.words[i].dataset.word || "", isParaEnd: c.paraEnd[i], mean: c.mean };
    },
    firstWordIn(root) {
      if (!root || typeof root.querySelector !== "function") return null;
      materializeSection(root.closest ? (root.closest(".rf-section") || root) : root);
      return root.querySelector(".rf-word");
    },
    clear() { cache = null; },
  };
}
