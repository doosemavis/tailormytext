import { useEffect, useState } from "react";
import { MQ_PHONE, MQ_TABLET_DOWN, MQ_TOUCH } from "../config/breakpoints";

const DESKTOP = { tier: "desktop", isTouch: false };

// Synchronous read so initial state (first paint, panelOpen default) already
// uses the right tier.
export function readBreakpoint() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return DESKTOP;
  const phone = window.matchMedia(MQ_PHONE).matches;
  const tabletDown = window.matchMedia(MQ_TABLET_DOWN).matches;
  return {
    tier: phone ? "phone" : tabletDown ? "tablet" : "desktop",
    isTouch: window.matchMedia(MQ_TOUCH).matches,
  };
}

// Re-renders only when a tier or touch boundary is crossed, never on every
// resize: an App render costs ~25ms on a 420K-word book.
export function useBreakpoint() {
  const [bp, setBp] = useState(readBreakpoint);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const queries = [MQ_PHONE, MQ_TABLET_DOWN, MQ_TOUCH].map((q) => window.matchMedia(q));
    const onChange = () => setBp((prev) => {
      const next = readBreakpoint();
      return next.tier === prev.tier && next.isTouch === prev.isTouch ? prev : next;
    });
    queries.forEach((mql) => mql.addEventListener("change", onChange));
    onChange();
    return () => queries.forEach((mql) => mql.removeEventListener("change", onChange));
  }, []);
  return bp;
}
