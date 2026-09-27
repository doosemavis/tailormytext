// The paused/pre-play cursor ring around one `.rf-word`.
//
// Each word span ends with its separating space (`…word </span>`, see
// utils/paragraphHtml.js), so an outline on the span reached across that space
// to the next word while hugging the first letter. The ring is drawn by CSS
// (`.rf-pace-cursor::after`) and trimmed on the right by the trailing space's
// measured width, written to `--rf-cursor-trim` on that one span.
//
// Only the word under the cursor is measured, so no other word pays anything.
// The width can change while paused (font, size or spacing edits, justified
// text reflowing when the reader resizes, a web font finishing loading), so
// while a ring is shown it re-measures on those signals. A ResizeObserver
// cannot watch the word itself: inline boxes report no size to it.

export const CURSOR_CLASS = "rf-pace-cursor";
export const CURSOR_TRIM_VAR = "--rf-cursor-trim";

export function trailingSpaceWidth(wordEl) {
  const last = wordEl?.lastChild;
  if (!last || last.nodeType !== Node.TEXT_NODE) return 0;
  const text = last.data;
  const end = text.length;
  const start = text.replace(/\s+$/, "").length;
  if (start === end) return 0;
  const range = document.createRange();
  range.setStart(last, start);
  range.setEnd(last, end);
  return range.getBoundingClientRect().width;
}

// `getRoot` returns the reader's document wrapper: typography and feature
// changes land on it as style/class writes, and its width drives reflow.
export function createCursorRing(getRoot) {
  let current = null;
  let detach = null;

  const measure = () => {
    if (current?.isConnected) current.style.setProperty(CURSOR_TRIM_VAR, `${trailingSpaceWidth(current)}px`);
  };

  const watch = () => {
    const root = getRoot();
    const cleanups = [];
    if (root && typeof MutationObserver === "function") {
      const mo = new MutationObserver(measure);
      mo.observe(root, { attributes: true, attributeFilter: ["style", "class"] });
      cleanups.push(() => mo.disconnect());
    }
    if (root && typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(measure);
      ro.observe(root);
      cleanups.push(() => ro.disconnect());
    }
    const fonts = typeof document !== "undefined" ? document.fonts : null;
    if (fonts && typeof fonts.addEventListener === "function") {
      fonts.addEventListener("loadingdone", measure);
      cleanups.push(() => fonts.removeEventListener("loadingdone", measure));
    }
    return () => cleanups.forEach((fn) => fn());
  };

  const hide = (el) => {
    if (!el) return;
    el.classList.remove(CURSOR_CLASS);
    el.style.removeProperty(CURSOR_TRIM_VAR);
    if (el !== current) return;
    current = null;
    if (detach) { detach(); detach = null; }
  };

  const show = (el) => {
    if (!el) return;
    if (current && current !== el) hide(current);
    current = el;
    el.classList.add(CURSOR_CLASS);
    measure();
    if (!detach) detach = watch();
  };

  const dispose = () => { if (current) hide(current); };

  return { show, hide, dispose };
}
