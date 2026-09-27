import { useRef } from "react";

// Decides how a Slider with an upper `limit` (e.g. the pacer's free-tier WPM
// cap) reacts to a proposed value. The thumb is pinned at the limit, and a
// pointer drag reports `enteredLimit` once per push into it, so the caller can
// prompt mid-drag. Keyboard steps never report it; their commit prompts.
//
// `value` is Radix's value, mapped from the pointer's absolute position.
// `intent` is where the user is really pushing: the value at the grab plus the
// pointer's travel since. They differ when the thumb is grabbed off-centre —
// grabbed right of centre at the limit, the first pixel of leftward travel
// still maps above it. Only `intent` beyond `limit + slack` counts as a push,
// so direction decides and hand jitter at the lock is ignored.
export function limitStep({ value, intent = value, limit, slack = 0, pointerDown, alreadyOver }) {
  if (limit == null) return { shown: value, enteredLimit: false, over: false };
  const over = intent > limit + slack;
  return { shown: Math.min(value, limit), enteredLimit: pointerDown && over && !alreadyOver, over };
}

// Pointer bookkeeping for a limited, horizontal Slider. Wire `start`, `move`
// and `end` to the Radix root's pointer events and run every proposed value
// through `step`. `end` calls `onLimit` once if the drag pushed past the limit
// at any point, so a release after pushing prompts again.
export function useSliderLimit({ limit, min, max, step, onLimit }) {
  const grabRef = useRef(null); // { x, value, perPx } while a thumb grab is tracked
  const lastXRef = useRef(0);
  const overRef = useRef(false);
  const pushedRef = useRef(false);

  const start = (event, currentValue) => {
    overRef.current = false;
    pushedRef.current = false;
    lastXRef.current = event.clientX;
    grabRef.current = null;
    if (limit == null) return;
    // A track click jumps the thumb to the pointer, so Radix's value already is
    // the intent. Only a thumb grab needs travel measured from the grab point.
    const thumb = event.target.closest?.('[role="slider"]');
    if (!thumb) return;
    const usable = event.currentTarget.getBoundingClientRect().width - thumb.getBoundingClientRect().width;
    if (usable <= 0) return;
    grabRef.current = { x: event.clientX, value: currentValue, perPx: (max - min) / usable };
  };

  const move = (event) => { lastXRef.current = event.clientX; };

  const stepValue = (value, pointerDown) => {
    const grab = pointerDown ? grabRef.current : null;
    const intent = grab ? grab.value + (lastXRef.current - grab.x) * grab.perPx : value;
    const next = limitStep({ value, intent, limit, slack: pointerDown ? step : 0, pointerDown, alreadyOver: overRef.current });
    overRef.current = next.over;
    if (next.over && pointerDown) pushedRef.current = true;
    return next;
  };

  const end = () => {
    const pushed = pushedRef.current;
    pushedRef.current = false;
    grabRef.current = null;
    if (pushed && onLimit) onLimit();
  };

  return { start, move, step: stepValue, end };
}
