import React, { useCallback, useEffect, useRef } from "react";
import { GUIDE_COLORS } from "../config/constants";

// Memoized overlay component — receives only primitives + stable ref objects so
// React.memo's shallow equality check correctly skips re-renders when guide state
// hasn't changed but a parent re-renders for unrelated reasons.
const ReadingGuideOverlayContent = React.memo(function ReadingGuideOverlayContent({
  guideMode,
  guideColor,
  guideDimOpacity,
  fontSize,
  lineHeight,
  fgColor,
  accentColor,
  domRef,
  guideYRef,
  clientYRef,
  readerLeftRef,
  showGuide,
}) {
  if (guideMode === "none" || !showGuide) return null;

  const lh = fontSize * lineHeight;
  const y = guideYRef.current;
  const cy = clientYRef.current;
  const gc = GUIDE_COLORS[guideColor] || {};
  const hl = gc.highlight || `${accentColor}35`;
  const ul = gc.underline || accentColor;

  if (guideMode === "highlight") return (
    <div
      ref={domRef}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        pointerEvents: "none",
        height: lh,
        background: hl,
        borderRadius: 4,
        transform: `translateY(${y - lh / 2}px)`,
        willChange: "transform",
      }}
    />
  );

  if (guideMode === "underline") return (
    <div
      ref={domRef}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        pointerEvents: "none",
        height: 3,
        background: ul,
        borderRadius: 2,
        opacity: 0.8,
        transform: `translateY(${y + 2}px)`,
        willChange: "transform",
      }}
    />
  );

  if (guideMode === "dim") {
    const alpha = Math.round(guideDimOpacity * 255).toString(16).padStart(2, "0");
    const blur = `blur(${(guideDimOpacity * 5).toFixed(1)}px)`;
    return (
      // position: fixed keeps the cover anchored to the viewport during scroll
      // left is constrained to the reader element's left edge to exclude the sidebar
      <div
        ref={domRef}
        style={{
          position: "fixed",
          left: readerLeftRef.current,
          right: 0,
          top: cy + lh * 0.5,
          bottom: 0,
          pointerEvents: "none",
          background: `${fgColor}${alpha}`,
          backdropFilter: blur,
          WebkitBackdropFilter: blur,
          willChange: "top",
          zIndex: 10,
        }}
      />
    );
  }

  return null;
});

export function useReadingGuide({ guideMode, guideColor, guideDimOpacity = 0.25, fontSize, lineHeight, t }) {
  const guideDimOpacityRef = useRef(guideDimOpacity);
  guideDimOpacityRef.current = guideDimOpacity;
  const tFgRef = useRef(t.fg);
  tFgRef.current = t.fg;
  const guideRef = useRef(null);
  const guideYRef = useRef(0);       // content-relative y (highlight/underline)
  const clientYRef = useRef(0);      // viewport-relative y (dim)
  const readerLeftRef = useRef(0);   // reader's left edge in viewport (dim bounds)
  const readerElRef = useRef(null);
  const rafRef = useRef(null);
  const showGuideRef = useRef(false);

  const applyPositions = useCallback((y, clientY) => {
    const lh = fontSize * lineHeight;
    if (guideMode === "highlight" && guideRef.current) {
      guideRef.current.style.transform = `translateY(${y - lh / 2}px)`;
    } else if (guideMode === "underline" && guideRef.current) {
      guideRef.current.style.transform = `translateY(${y + 2}px)`;
    } else if (guideMode === "dim" && guideRef.current) {
      const op = guideDimOpacityRef.current;
      const alpha = Math.round(op * 255).toString(16).padStart(2, "0");
      const blur = `blur(${(op * 5).toFixed(1)}px)`;
      guideRef.current.style.top = `${clientY + lh * 0.5}px`;
      guideRef.current.style.left = `${readerLeftRef.current}px`;
      guideRef.current.style.background = `${tFgRef.current}${alpha}`;
      guideRef.current.style.backdropFilter = blur;
      guideRef.current.style.webkitBackdropFilter = blur;
    }
  }, [guideMode, fontSize, lineHeight]);

  const handleMouseMove = useCallback((e, readerEl) => {
    if (guideMode === "none" || !readerEl) return;
    const rect = readerEl.getBoundingClientRect();
    const y = e.clientY - rect.top + readerEl.scrollTop;
    guideYRef.current = y;
    clientYRef.current = e.clientY;
    readerLeftRef.current = rect.left;
    readerElRef.current = readerEl;
    showGuideRef.current = true;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => applyPositions(y, e.clientY));
  }, [guideMode, applyPositions]);

  const handleScroll = useCallback(() => {
    if (guideMode === "none" || !showGuideRef.current || !readerElRef.current) return;
    // Only needed for absolute-positioned modes (highlight/underline)
    if (guideMode === "dim") return;
    const readerEl = readerElRef.current;
    const rect = readerEl.getBoundingClientRect();
    const y = clientYRef.current - rect.top + readerEl.scrollTop;
    guideYRef.current = y;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => applyPositions(y, clientYRef.current));
  }, [guideMode, applyPositions]);

  useEffect(() => {
    if (guideMode === "dim" && guideRef.current) {
      const alpha = Math.round(guideDimOpacity * 255).toString(16).padStart(2, "0");
      const blur = `blur(${(guideDimOpacity * 5).toFixed(1)}px)`;
      guideRef.current.style.background = `${t.fg}${alpha}`;
      guideRef.current.style.backdropFilter = blur;
      guideRef.current.style.webkitBackdropFilter = blur;
    }
  }, [guideDimOpacity, guideMode, t.fg]);

  const handleMouseLeave = useCallback(() => {
    showGuideRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const renderOverlay = (showGuide) => (
    <ReadingGuideOverlayContent
      guideMode={guideMode}
      guideColor={guideColor}
      guideDimOpacity={guideDimOpacity}
      fontSize={fontSize}
      lineHeight={lineHeight}
      fgColor={t.fg}
      accentColor={t.accent}
      domRef={guideRef}
      guideYRef={guideYRef}
      clientYRef={clientYRef}
      readerLeftRef={readerLeftRef}
      showGuide={showGuide}
    />
  );

  return { handleMouseMove, handleMouseLeave, handleScroll, renderOverlay, showGuideRef };
}
