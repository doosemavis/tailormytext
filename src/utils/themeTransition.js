import { flushSync } from "react-dom";

const VT_DURATION_MS = 550;
const VT_EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";
const ROOT_DATA_ATTR = "rfThemeVt";

// The reveal animation of the most recent theme switch, cancelled when its
// transition finishes (and, defensively, before the next one starts).
let lastRevealAnim = null;

// Dev-only: report the frame cadence during the reveal so a choppy wipe can
// be told apart from a page stall (a 30fps cadence shows ~33ms gaps).
function sampleFrames(transition) {
  const t0 = performance.now();
  const gaps = [];
  let last = null;
  let done = false;
  const tick = (ts) => {
    if (last != null) gaps.push(Math.round(ts - last));
    last = ts;
    if (!done) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const report = (outcome) => {
    done = true;
    const ran = Math.round(performance.now() - t0);
    const sorted = [...gaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const verdict = ran < VT_DURATION_MS - 60 ? `ENDED EARLY (${outcome})` : outcome;
    const leftovers = document.getAnimations().filter((a) => a.effect?.pseudoElement === "::view-transition-new(root)").length;
    console.info(`[theme-vt] ran ${ran}ms of ${VT_DURATION_MS}ms — ${verdict}; ${gaps.length} frames, median gap ${median}ms, max gap ${sorted[sorted.length - 1] ?? 0}ms; reveal animations attached: ${leftovers}`);
  };
  transition.finished.then(() => report("finished"), (err) => report(`rejected: ${err?.name || err}`));
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

const supportsViewTransitions = () =>
  typeof document !== "undefined" &&
  typeof document.startViewTransition === "function";

function originFromEvent(event) {
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const fallback = { x: viewportWidth / 2, y: viewportHeight / 2, viewportWidth, viewportHeight };

  if (!event) return fallback;

  // Keyboard-activated clicks report (0, 0); detect that and use the target's center instead.
  const isKeyboardSynthetic = event.detail === 0 && event.clientX === 0 && event.clientY === 0;
  if (!isKeyboardSynthetic && typeof event.clientX === "number") {
    return { x: event.clientX, y: event.clientY, viewportWidth, viewportHeight };
  }

  const rect = event.currentTarget?.getBoundingClientRect?.();
  if (rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      viewportWidth,
      viewportHeight,
    };
  }
  return fallback;
}

/**
 * Apply a theme change inside a circular View Transition reveal originating from the click point.
 * Falls back to a plain apply when the View Transitions API isn't available or the user prefers
 * reduced motion.
 */
export function runThemeTransition(event, applyFn) {
  if (!supportsViewTransitions() || prefersReducedMotion()) {
    applyFn();
    return;
  }

  const { x, y, viewportWidth, viewportHeight } = originFromEvent(event);
  const maxRadius = Math.hypot(
    Math.max(x, viewportWidth - x),
    Math.max(y, viewportHeight - y),
  );

  const root = document.documentElement;
  root.dataset[ROOT_DATA_ATTR] = "active";
  const cleanup = () => { delete root.dataset[ROOT_DATA_ATTR]; };

  const transition = document.startViewTransition(() => {
    flushSync(applyFn);
  });

  if (transition?.finished?.finally) {
    transition.finished.finally(cleanup);
  } else {
    cleanup();
  }

  if (transition?.ready?.then) {
    transition.ready.then(() => {
      // Cancel any reveal animation left over from a previous switch. With
      // fill:"forwards" a finished animation stays attached to the
      // ::view-transition-new(root) pseudo-element for the life of the page,
      // so from the second theme change onward the new reveal competed with
      // one (then two, then three…) stale ones on the same property — smooth
      // the first time, catching every time after.
      if (lastRevealAnim) { lastRevealAnim.cancel(); lastRevealAnim = null; }
      const anim = document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${maxRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: VT_DURATION_MS,
          // Ease-out, not ease-in-out: with ease-in-out the edge moves fastest
          // at the midpoint, when the circle is already large and crossing the
          // text, so at 30fps (energy saver, memory pressure, 30Hz displays)
          // it jumps hundreds of px per frame right in the middle and reads
          // as a skip. Ease-out spends its fast phase while the circle is
          // small and decelerates through the sweep.
          easing: VT_EASING,
          fill: "forwards",
          pseudoElement: "::view-transition-new(root)",
        },
      );
      lastRevealAnim = anim;
      transition.finished.finally(() => {
        if (lastRevealAnim === anim) lastRevealAnim = null;
        anim.cancel();
      });
      if (import.meta.env.DEV) sampleFrames(transition);
    }).catch(() => {});
  }
}
