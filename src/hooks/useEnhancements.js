import { useState, useRef, useMemo, useCallback, useEffect, useLayoutEffect } from "react";
import { PALETTES } from "../config/constants";

// Imperative DOM walker for NeuroDiv bold-slice updates. Called from both
// liveWriters.neuroDivIntensity (slider drag) and the IntersectionObserver
// callback (off-screen section scrolls into view). DOM structure invariant
// per renderWord in DocumentBody.jsx — <span class="rf-word" data-word="...">
// <strong>{first}</strong>{rest}{" "}</span> — so the walk is a pair of
// textContent writes per word.
function applyIntensityToWords(scope, intensity) {
  const words = scope.querySelectorAll(".rf-word");
  for (let i = 0; i < words.length; i++) {
    const wEl = words[i];
    const word = wEl.dataset.word;
    if (!word) continue;
    const bl = Math.max(1, Math.round(word.length * intensity));
    const strong = wEl.firstElementChild;
    if (!strong || strong.tagName !== "STRONG") continue;
    strong.textContent = word.slice(0, bl);
    const rest = strong.nextSibling;
    if (rest && rest.nodeType === Node.TEXT_NODE) {
      rest.textContent = word.slice(bl);
    }
  }
  return words.length;
}

// Bucket C of the App.jsx state-colocation refactor (see
// docs/architecture/STATE_COLOCATION_PLAN.md §Phase 2). Owns the seven
// enhancement state slots (NeuroDiv / HueGuide / Focus + intensities + palette),
// the rAF-coalesced liveWriters that push DOM updates without React
// reconciliation, the three stable toggle callbacks, the feature-class
// className writer, and the focus-mode <style> sheet manager.
//
// Inputs:
//   docWrapperRef — App-owned ref to the document inner wrapper. liveWriters
//     and the huePalette layout effect read it for setProperty writes.
//   readerRef — App-owned ref to the scrollable reader container. Used as
//     the IntersectionObserver `root` so the visible-section set tracks
//     reader-frame visibility, not viewport visibility.
//   docSections — drives the IO effect's setup/teardown lifecycle.
//   user, authLoading — drive the signout reset for focusPara.
//
// Phase 4 (useScrollController) will pull `visibleSectionsRef` and
// `sectionStaleRef` out of here — scroll visibility is fundamentally a
// scroll concern. Until then they're hook-local refs that liveWriters and
// the IO callback both touch.
export function useEnhancements({ docWrapperRef, readerRef, docSections, user, authLoading }) {
  const hasSections = docSections && docSections.length > 0 && (docSections.length > 1 || docSections[0]?.title);

  // ── State ──
  const [neuroDiv, setNeuroDiv] = useState(false);
  const [neuroDivIntensity, setNeuroDivIntensity] = useState(0.42);
  const [hueGuide, setHueGuide] = useState(false);
  const [huePalette, setHuePalette] = useState("ocean");
  const [hueIntensity, setHueIntensity] = useState(1);  // 0 = plain text fg, 1 = full palette
  const [focusMode, setFocusMode] = useState(false);
  const [focusPara, setFocusPara] = useState(-1);

  // Reset focus-mode paragraph pointer on signout. Doc-state reset
  // (text/docSections/fileName/etc) runs inside useDocumentState — focusPara
  // belongs to Bucket C, so the reset rides with the state.
  useEffect(() => {
    if (!authLoading && !user) setFocusPara(-1);
  }, [user, authLoading]);

  // ── Feature toggles (NeuroDiv/HueGuide/Focus) flip a CSS class on the document inner div via ref.
  //     Single className write, no React reconciliation through the Section subtree. ──
  const featureClassRef = useRef(null);
  const featureStateRef = useRef({ neuroDiv, hueGuide, focusMode });
  featureStateRef.current = { neuroDiv, hueGuide, focusMode };
  // Latest focusMode for descendant onMouseEnter callbacks — read at hover time, never drives re-render.
  const focusModeRef = useRef(focusMode);
  focusModeRef.current = focusMode;

  const writeFeatureClass = useCallback(() => {
    const el = featureClassRef.current;
    if (!el) return;
    const s = featureStateRef.current;
    el.className = [s.neuroDiv && "rf-neurodiv", s.hueGuide && "rf-hueguide", s.focusMode && "rf-focus-mode"].filter(Boolean).join(" ");
  }, []);

  // Callback ref: writes the feature class synchronously on mount so initial DOM state is correct.
  const handleFeatureClassRef = useCallback((el) => {
    featureClassRef.current = el;
    if (el) writeFeatureClass();
  }, [writeFeatureClass]);

  // Toggle-driven updates: synchronous className write before paint — click-to-visual on the same frame.
  useLayoutEffect(() => {
    if (featureClassRef.current) writeFeatureClass();
  }, [neuroDiv, hueGuide, focusMode, writeFeatureClass]);

  // ── Focus style management (kept here so DocumentBody never re-renders for focusPara changes) ──
  const focusStyleRef = useRef(null);
  useEffect(() => {
    if (!focusStyleRef.current) { focusStyleRef.current = document.createElement("style"); document.head.appendChild(focusStyleRef.current); }
    if (focusMode && focusPara >= 0) focusStyleRef.current.textContent = `.rf-para{opacity:0.1;transition:opacity 0.35s ease}.rf-para[data-idx="${focusPara}"]{opacity:1}`;
    else if (focusMode) focusStyleRef.current.textContent = `.rf-para{opacity:0.1;transition:opacity 0.35s ease}`;
    else focusStyleRef.current.textContent = `.rf-para{opacity:1;transition:opacity 0.35s ease}`;
  }, [focusMode, focusPara]);

  // Stable feature-toggle handlers (Perf H1). Without these, the three
  // reader-chrome toggles created a fresh onClick closure per render.
  const toggleNeuroDiv = useCallback(() => setNeuroDiv(v => !v), []);
  const toggleHueGuide = useCallback(() => setHueGuide(v => !v), []);
  const toggleFocusMode = useCallback(() => {
    setFocusMode(v => {
      const next = !v;
      if (!next) setFocusPara(-1);
      return next;
    });
  }, []);

  // huePalette is read from a ref inside handleDocWrapperRef so the ref callback
  // stays stable across palette changes (otherwise React would re-fire the ref
  // each time the user picks a palette).
  const huePaletteRef = useRef(huePalette);
  huePaletteRef.current = huePalette;

  // neuroDivIntensity is read from a ref by Paragraph at render time, so
  // intensity changes don't propagate via props (and so don't re-render any
  // memo'd Paragraph). The DOM is updated imperatively via
  // liveWriters.neuroDivIntensity instead. Keeping the ref in sync on every
  // render means any Paragraph that DOES re-render (theme change, doc swap)
  // reads the live value.
  const neuroDivIntensityRef = useRef(neuroDivIntensity);
  neuroDivIntensityRef.current = neuroDivIntensity;

  // Z+: visibleSectionsRef holds the .rf-section elements currently in (or
  // near) the viewport; sectionStaleRef tracks sections that missed an
  // intensity change while off-screen and need updating when they scroll back.
  // The IntersectionObserver that populates these refs lives in App.jsx in
  // Phase 2 C1 — it moves into this hook in C2, at which point the refs stop
  // being returned (App stops needing direct access).
  const visibleSectionsRef = useRef(new Set());
  const sectionStaleRef = useRef(new Set());

  // Per-slider live writers: write a single CSS var directly to the wrapper on every drag tick.
  // App state isn't touched during drag — we update it once on release via the slider's onChange.
  // huePalette is in the same family: instead of plumbing palette colors as props through 146
  // sections / thousands of paragraphs (each re-walked by React on every palette change), the
  // palette's 5 colors are written to --rf-hue-0..4 on the doc wrapper. DocumentBody emits
  // `color: var(--rf-hue-N)` per word at render time using a slot index derived from word
  // position — that index is palette-independent, so the React tree never re-renders when the
  // user picks a different palette.
  const liveWriters = useMemo(() => {
    // rAF-coalesce: high-DPI pointer input fires `input` events faster than the
    // browser can paint (commonly 100+/sec), so an uncoalesced setProperty per
    // event blocks the main thread enough that the slider thumb itself lags
    // behind the cursor. Wrapping each writer so setProperty runs at most once
    // per frame with the latest pending value keeps the thumb glued to the
    // cursor on big docs (Don Quixote, 146 ch / 427K words).
    const coalesced = (apply) => {
      let pending = null;
      let rafId = 0;
      return (v) => {
        pending = v;
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          apply(pending);
        });
      };
    };
    return {
      fontSize: coalesced(v => docWrapperRef.current?.style.setProperty("--rf-font-size", `${v}px`)),
      lineHeight: coalesced(v => docWrapperRef.current?.style.setProperty("--rf-line-height", String(v))),
      columnWidth: coalesced(v => docWrapperRef.current?.style.setProperty("--rf-column-width", `${v}%`)),
      letterSpacing: coalesced(v => docWrapperRef.current?.style.setProperty("--rf-letter-spacing", `${v}px`)),
      wordSpacing: coalesced(v => docWrapperRef.current?.style.setProperty("--rf-word-spacing", `${v}px`)),
      hueIntensity: coalesced(v => docWrapperRef.current?.style.setProperty("--rf-hue-intensity", String(v))),
      // huePalette stays synchronous: it's click-driven (palette dropdown), not
      // drag-driven, and the mount-time seed in handleDocWrapperRef must run
      // before first paint to avoid a one-frame color flash on .rf-word.
      huePalette: (k) => {
        const el = docWrapperRef.current;
        if (!el) return;
        const colors = PALETTES[k]?.colors;
        if (!colors) return;
        for (let i = 0; i < colors.length; i++) el.style.setProperty(`--rf-hue-${i}`, colors[i]);
      },
      // neuroDivIntensity is structurally per-word (the bold-letter count
      // varies by word length), so it can't ride a single CSS variable like
      // hueIntensity. Instead we mutate the DOM directly: each `.rf-word`
      // carries `data-word` with the original text, and `applyIntensityToWords`
      // rewrites the <strong> slice + trailing text node. React isn't involved.
      //
      // Z+: the walk is scoped to currently-visible .rf-section elements
      // (tracked by IntersectionObserver in App.jsx for Phase 2 C1). Off-screen
      // sections are marked "stale" and updated when they scroll into view via
      // the IO callback — bounding per-tick work to ~5 sections × ~500 words ≈
      // 2500 elements instead of the full 424K on Don Quixote.
      neuroDivIntensity: coalesced(v => {
        neuroDivIntensityRef.current = v;
        const wrapper = docWrapperRef.current;
        if (!wrapper) return;
        const t0 = import.meta.env.DEV ? performance.now() : 0;
        let visibleWordCount = 0;
        for (const section of visibleSectionsRef.current) {
          visibleWordCount += applyIntensityToWords(section, v);
        }
        // Off-screen sections track "needs update" via the stale Set; the
        // IntersectionObserver callback applies the current intensity when
        // they re-enter the viewport.
        const allSections = wrapper.querySelectorAll(".rf-section");
        for (const section of allSections) {
          if (!visibleSectionsRef.current.has(section)) {
            sectionStaleRef.current.add(section);
          }
        }
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log(`[perf] neuroDivIntensity walk (visible): ${(performance.now() - t0).toFixed(0)}ms over ${visibleWordCount} words (${visibleSectionsRef.current.size} visible / ${allSections.length} total sections)`);
        }
      }),
    };
  }, [docWrapperRef]);

  // Palette changes after mount: write the 5 vars on the wrapper. No React render of DocumentBody.
  useLayoutEffect(() => {
    liveWriters.huePalette(huePalette);
  }, [huePalette, liveWriters]);

  // Z+: IntersectionObserver bounds the NeuroDiv intensity DOM walk to
  // visible sections. Without this the live writer walks all 424K .rf-word
  // elements on Don Quixote each tick (~780ms); with it the walk is bounded
  // to ~5 visible sections (~2-5K words, target <50ms).
  //
  // On enter: section joins the visible set; if it missed an intensity change
  // while off-screen (in the stale set), apply current intensity now.
  // On leave: section drops out of the visible set.
  // rAF retry until .rf-section elements are present in the DOM (initial
  // mount race — DocumentBody renders sections after this effect fires).
  useEffect(() => {
    if (!hasSections || !docSections?.length) return;
    const wrapper = docWrapperRef.current;
    const reader = readerRef.current;
    if (!wrapper || !reader) return;

    let observer = null;
    let rafId = 0;
    const setup = () => {
      const sections = wrapper.querySelectorAll(".rf-section");
      if (sections.length === 0) {
        rafId = requestAnimationFrame(setup);
        return;
      }
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSectionsRef.current.add(entry.target);
            if (sectionStaleRef.current.has(entry.target)) {
              applyIntensityToWords(entry.target, neuroDivIntensityRef.current);
              sectionStaleRef.current.delete(entry.target);
            }
          } else {
            visibleSectionsRef.current.delete(entry.target);
          }
        }
      }, { root: reader, rootMargin: "300px 0px" });
      sections.forEach(s => observer.observe(s));
    };
    setup();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
      visibleSectionsRef.current.clear();
      sectionStaleRef.current.clear();
    };
  }, [hasSections, docSections, docWrapperRef, readerRef]);

  return {
    // State
    neuroDiv, neuroDivIntensity, hueGuide, huePalette, hueIntensity, focusMode, focusPara,
    // Setters
    setNeuroDiv, setNeuroDivIntensity, setHueGuide, setHuePalette, setHueIntensity,
    setFocusMode, setFocusPara,
    // Toggles
    toggleNeuroDiv, toggleHueGuide, toggleFocusMode,
    // Writers
    liveWriters,
    huePaletteRef,
    // Refs read by DocumentBody descendants (hover focus reset, intensityRef)
    neuroDivIntensityRef, focusModeRef,
    // Callback ref consumed by DocumentBody
    handleFeatureClassRef,
  };
}
