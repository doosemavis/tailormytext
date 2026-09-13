// Throttled reading-position persistence. The reader reports a position on
// every scroll pause; persisting each one meant a Supabase write roughly
// every 600ms of scrolling for library books. This helper writes at most
// once per `intervalMs` (trailing edge, so the latest position wins) and
// flushes immediately on demand — App calls flush() when the tab is hidden,
// on pagehide, and when the document changes — so nothing is lost while the
// network sees a fraction of the traffic.
//
// Pure: no DOM, no timers beyond setTimeout, injectable clock for tests.

export function createPositionSaver({ persist, intervalMs, now = Date.now }) {
  let pending = null;
  let timer = null;
  let lastSavedAt = -Infinity;

  const write = () => {
    timer = null;
    if (pending == null) return;
    const p = pending;
    pending = null;
    lastSavedAt = now();
    persist(p);
  };

  return {
    // Remember the latest position; schedule a write for the end of the
    // current interval (or right away if the interval has already elapsed).
    note(position) {
      pending = position;
      if (timer) return;
      const wait = Math.max(0, intervalMs - (now() - lastSavedAt));
      timer = setTimeout(write, wait);
    },
    // Persist whatever is pending immediately.
    flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      write();
    },
    // Drop the timer without persisting (caller has already flushed, or
    // the position belongs to a document that is no longer current).
    dispose() {
      if (timer) { clearTimeout(timer); timer = null; }
      pending = null;
    },
    get pending() { return pending; },
  };
}
