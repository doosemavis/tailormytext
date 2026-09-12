import { meanMultiplier } from "./timing";

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
  const words = Array.from(container.querySelectorAll(".rf-word"));
  const indexOf = new Map(words.map((w, i) => [w, i]));
  const paraEnd = words.map((w, i) => {
    const nextWord = words[i + 1];
    return !nextWord || nextWord.closest(".rf-para") !== w.closest(".rf-para");
  });
  const entries = words.map((w, i) => ({ word: w.dataset.word || "", isParaEnd: paraEnd[i] }));
  return { container, words, indexOf, paraEnd, mean: meanMultiplier(entries) };
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
      return root.querySelector(".rf-word");
    },
    clear() { cache = null; },
  };
}
