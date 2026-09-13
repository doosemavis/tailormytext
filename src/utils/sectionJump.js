// Chapter-jump helpers. Sections use `content-visibility: auto`, so a title
// inside a skipped section has no real box until the section renders. The
// old approach un-skipped EVERY section for the duration of a jump (a full
// layout of the book both ways: ~1.4s on Don Quixote, twice). These helpers
// un-skip only the target section; every other section keeps its placeholder
// size, and since the scroll offset is computed and applied within that one
// consistent layout, the landing point is the same.

import { materializeSection } from "./sectionMaterializer";

export function revealSection(section) {
  if (!section || !section.style) return;
  materializeSection(section);   // windowed chapters are filled on demand
  section.style.contentVisibility = "visible";
}

export function releaseSection(section) {
  if (section && section.style) section.style.contentVisibility = "";
}

// scrollTop that puts `target`'s top edge `gutter` px below the container's
// top edge. Call with the target's section revealed.
export function jumpScrollTop(container, target, gutter = 8) {
  const tr = target.getBoundingClientRect();
  const cr = container.getBoundingClientRect();
  return Math.max(0, tr.top - cr.top + container.scrollTop - gutter);
}
