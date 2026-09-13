import { HOLD_ACCEL_LINES } from "../../config/pacer";

// Cursor navigation for the WPM pacer. Layout-dependent inputs (measure,
// next/prev, paraOf) are injected so these functions run in tests without
// a rendering engine. See spec §4.

export const MAX_WALK = 2000;

const centreOf = (r) => (r.left + r.right) / 2;
const sameLine = (a, b, lineHeight) => Math.abs(a - b) <= lineHeight / 2;

// Move one visual line in `dir`, landing on the word whose horizontal
// centre is nearest the cursor's. Walks words in order until the first one
// on a different line, then scans that line for the best candidate.
export function lineStep(cursor, dir, { next, prev, measure, lineHeight }) {
  if (!cursor) return null;
  const step = dir > 0 ? next : prev;
  const origin = measure(cursor);
  const cx = centreOf(origin);

  let el = step(cursor);
  let walked = 0;
  // Phase 1: leave the current line.
  while (el && sameLine(measure(el).top, origin.top, lineHeight)) {
    el = step(el);
    if (++walked > MAX_WALK) return null;
  }
  if (!el) return null;

  // Phase 2: scan the target line for the nearest centre.
  const lineTop = measure(el).top;
  let best = el;
  let bestDist = Math.abs(centreOf(measure(el)) - cx);
  el = step(el);
  while (el && sameLine(measure(el).top, lineTop, lineHeight)) {
    const d = Math.abs(centreOf(measure(el)) - cx);
    if (d < bestDist) { best = el; bestDist = d; }
    el = step(el);
    if (++walked > MAX_WALK) break;
  }
  return best;
}

// First word of the adjacent paragraph in `dir`, or null at a document edge.
export function paragraphStep(cursor, dir, { next, prev, paraOf }) {
  if (!cursor) return null;
  const origin = paraOf(cursor);
  if (dir > 0) {
    let el = next(cursor);
    let walked = 0;
    while (el && paraOf(el) === origin) {
      el = next(el);
      if (++walked > MAX_WALK) return null;
    }
    return el || null;
  }
  // Backward: walk into the previous paragraph, then to its first word.
  let el = prev(cursor);
  let walked = 0;
  while (el && paraOf(el) === origin) {
    el = prev(el);
    if (++walked > MAX_WALK) return null;
  }
  if (!el) return null;
  const target = paraOf(el);
  let first = el;
  let p = prev(el);
  while (p && paraOf(p) === target) {
    first = p;
    p = prev(p);
    if (++walked > MAX_WALK) break;
  }
  return first;
}

// Held-key acceleration: the first `threshold` steps of one hold are line
// steps; every step after that is a paragraph step. Any non-repeat press,
// a different key, or keyup starts a fresh hold.
export function createHoldAccel(threshold = HOLD_ACCEL_LINES) {
  let key = null;
  let lines = 0;
  return {
    onKeyDown(k, repeat) {
      if (!repeat || k !== key) { key = k; lines = 0; }
      lines += 1;
      return lines > threshold ? "paragraph" : "line";
    },
    onKeyUp() { key = null; lines = 0; },
  };
}
