import { useState, useRef, useEffect, useCallback } from "react";
import {
  WPM_MIN, WPM_MAX, WPM_DEFAULT, WPM_NUDGE, TRAIL_LENGTH, SCROLL_BAND, STORAGE_KEY_WPM,
} from "../config/pacer";
import { clampWpmForTier } from "../config/proFeatures";
import { storageGet, storageSet } from "../utils/storage";
import { createWordIndex } from "../utils/pacer/wordIndex";
import { delayFor } from "../utils/pacer/timing";
import { lineStep, paragraphStep, createHoldAccel } from "../utils/pacer/nav";

// WPM Pacer engine. Toggles classes on the .rf-word spans DocumentBody
// renders (same imperative-DOM pattern as NeuroDiv intensity), so playback
// never reconciles React. Spec: docs/superpowers/specs/2026-09-12-wpm-pacer-design.md

const CLS_CURRENT = "rf-pace-current";
const CLS_CURSOR = "rf-pace-cursor";
const trailClass = (i) => `rf-pace-trail-${i + 1}`;

const clampRange = (v) => Math.min(WPM_MAX, Math.max(WPM_MIN, Math.round(v)));

const prefersReducedMotion = () =>
  typeof window?.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function firstVisibleWord(wrapper, reader, index) {
  if (!wrapper || !reader) return null;
  const rr = reader.getBoundingClientRect();
  const paras = wrapper.querySelectorAll(".rf-para");
  let partial = null;
  for (const p of paras) {
    const r = p.getBoundingClientRect();
    if (r.top >= rr.top && r.top < rr.bottom) return index.firstWordIn(p);
    if (!partial && r.bottom > rr.top && r.top < rr.bottom) partial = p;
  }
  return partial ? index.firstWordIn(partial) : null;
}

export function usePacer({ docWrapperRef, readerRef, docSections, text, isPro, onProGate, authReady }) {
  const [enabled, setEnabledState] = useState(false);
  const [playing, setPlayingState] = useState(false);
  const [wpm, setWpmState] = useState(WPM_DEFAULT);

  const enabledRef = useRef(false);
  const playingRef = useRef(false);
  const wpmRef = useRef(WPM_DEFAULT);
  const isProRef = useRef(isPro);
  isProRef.current = isPro;
  const onProGateRef = useRef(onProGate);
  onProGateRef.current = onProGate;

  const cursorRef = useRef(null);
  const trailRef = useRef([]);
  const timerRef = useRef(0);
  const dueAtRef = useRef(0);
  const indexRef = useRef(null);
  if (!indexRef.current) indexRef.current = createWordIndex();
  const holdRef = useRef(null);
  if (!holdRef.current) holdRef.current = createHoldAccel();

  const setPlaying = (v) => { playingRef.current = v; setPlayingState(v); };

  // ── Highlight bookkeeping ──
  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = 0; } };

  const clearHighlights = useCallback(() => {
    const cur = cursorRef.current;
    if (cur) cur.classList.remove(CLS_CURRENT, CLS_CURSOR);
    trailRef.current.forEach((el, i) => el.classList.remove(trailClass(i)));
    trailRef.current = [];
  }, []);

  const pushTrail = (el) => {
    const prev = trailRef.current;
    prev.forEach((t, i) => t.classList.remove(trailClass(i)));
    const next = [el, ...prev].slice(0, TRAIL_LENGTH);
    next.forEach((t, i) => t.classList.add(trailClass(i)));
    trailRef.current = next;
  };

  const keepInBand = (el) => {
    const reader = readerRef.current;
    if (!reader || !el || typeof reader.scrollTo !== "function") return;
    const rr = reader.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const centre = (r.top + r.bottom) / 2 - rr.top;
    const margin = (rr.height * (1 - SCROLL_BAND)) / 2;
    if (centre >= margin && centre <= rr.height - margin) return;
    reader.scrollTo({
      top: reader.scrollTop + centre - rr.height / 2,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  const setCursor = useCallback((el) => {
    const old = cursorRef.current;
    if (old) old.classList.remove(CLS_CURSOR);
    cursorRef.current = el;
    if (el && !playingRef.current) el.classList.add(CLS_CURSOR);
    if (el) keepInBand(el);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Playback ──
  const pause = useCallback(() => {
    clearTimer();
    if (!playingRef.current) return;
    setPlaying(false);
    const cur = cursorRef.current;
    if (cur && cur.isConnected) cur.classList.add(CLS_CURSOR);
  }, []);

  const stopAll = useCallback(() => {
    clearTimer();
    clearHighlights();
    cursorRef.current = null;
    indexRef.current.clear();
    setPlaying(false);
  }, [clearHighlights]);

  const schedule = () => {
    const cur = cursorRef.current;
    const entry = cur ? indexRef.current.entry(cur) : null;
    if (!entry) { pause(); return; }
    const delay = delayFor(entry.word, entry.isParaEnd, wpmRef.current, entry.mean);
    dueAtRef.current += delay;
    timerRef.current = setTimeout(tick, Math.max(0, dueAtRef.current - Date.now()));
  };

  function tick() {
    timerRef.current = 0;
    try {
      const cur = cursorRef.current;
      if (!cur || !cur.isConnected) { stopAll(); return; }
      const next = indexRef.current.next(cur);
      if (!next) { setPlaying(false); return; }  // end of document: leave last word lit
      cur.classList.remove(CLS_CURRENT);
      pushTrail(cur);
      next.classList.remove(...trailRef.current.map((_, i) => trailClass(i)));
      next.classList.add(CLS_CURRENT);
      cursorRef.current = next;
      keepInBand(next);
      schedule();
    } catch (err) {
      console.error("[pacer] tick failed; stopping", err);
      stopAll();
    }
  }

  const play = useCallback(() => {
    if (!enabledRef.current || playingRef.current) return;
    let cur = cursorRef.current;
    if (!cur || !cur.isConnected) {
      cur = firstVisibleWord(docWrapperRef.current, readerRef.current, indexRef.current);
      if (!cur) return;
      cursorRef.current = cur;
    }
    cur.classList.remove(CLS_CURSOR);
    cur.classList.add(CLS_CURRENT);
    setPlaying(true);
    dueAtRef.current = Date.now();
    schedule();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = useCallback(() => {
    if (playingRef.current) pause(); else play();
  }, [pause, play]);

  const placeCursor = useCallback((el) => {
    if (!enabledRef.current || !el) return;
    pause();
    clearHighlights();
    setCursor(el);
  }, [pause, clearHighlights, setCursor]);

  const restart = useCallback(() => {
    if (!enabledRef.current) return;
    pause();
    clearHighlights();
    setCursor(firstVisibleWord(docWrapperRef.current, readerRef.current, indexRef.current));
  }, [pause, clearHighlights, setCursor]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReaderClick = useCallback((e) => {
    if (!enabledRef.current) return;
    const target = e?.target;
    const el = target && typeof target.closest === "function" ? target.closest(".rf-word") : null;
    if (el) placeCursor(el);
  }, [placeCursor]);

  // ── Enable / disable ──
  const setEnabled = useCallback((v) => {
    enabledRef.current = v;
    setEnabledState(v);
    if (!v) stopAll();
  }, [stopAll]);
  const toggle = useCallback(() => setEnabled(!enabledRef.current), [setEnabled]);

  // ── WPM ──
  const persistWpm = (v) => {
    storageSet(STORAGE_KEY_WPM, String(v)).catch((err) => console.warn("[pacer] wpm save failed", err));
  };
  const setWpm = useCallback((next) => {
    const ranged = clampRange(Number(next) || WPM_DEFAULT);
    const tiered = clampWpmForTier(ranged, isProRef.current);
    wpmRef.current = tiered;
    setWpmState(tiered);
    persistWpm(tiered);
    if (tiered !== ranged && typeof onProGateRef.current === "function") onProGateRef.current();
  }, []);
  const nudgeWpm = useCallback((delta) => setWpm(wpmRef.current + delta), [setWpm]);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    storageGet(STORAGE_KEY_WPM).then((raw) => {
      if (cancelled) return;
      const n = Number(raw);
      const loaded = Number.isFinite(n) && n > 0 ? clampRange(n) : WPM_DEFAULT;
      const tiered = clampWpmForTier(loaded, isProRef.current);
      wpmRef.current = tiered;
      setWpmState(tiered);
    }).catch((err) => console.warn("[pacer] wpm load failed", err));
    return () => { cancelled = true; };
  }, [authReady]);

  // ── Lifecycle: document change, tab hidden, unmount ──
  useEffect(() => { stopAll(); }, [docSections, text, stopAll]);

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "hidden") pause(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pause]);

  useEffect(() => () => { clearTimer(); clearHighlights(); }, [clearHighlights]);

  // ── Keyboard: only while enabled ──
  useEffect(() => {
    const reader = readerRef.current;
    if (!enabled || !reader) return;
    reader.setAttribute("tabindex", "0");
    reader.setAttribute("aria-label", "Reader. Arrow keys move the pacer start; Space plays or pauses.");
    const index = indexRef.current;
    const measure = (el) => el.getBoundingClientRect();
    const paraOf = (el) => el.closest(".rf-para");
    const lineHeightOf = (el) => el.getBoundingClientRect().height || 20;

    const moveTo = (el) => { if (el) placeCursor(el); };
    const currentOrVisible = () => {
      const cur = cursorRef.current;
      if (cur && cur.isConnected) return cur;
      return firstVisibleWord(docWrapperRef.current, reader, index);
    };

    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "ArrowRight": { e.preventDefault(); const c = currentOrVisible(); moveTo(c && cursorRef.current ? index.next(c) : c); return; }
        case "ArrowLeft":  { e.preventDefault(); const c = currentOrVisible(); moveTo(c && cursorRef.current ? index.prev(c) : c); return; }
        case "ArrowDown":
        case "ArrowUp": {
          e.preventDefault();
          const dir = e.key === "ArrowDown" ? 1 : -1;
          const c = currentOrVisible();
          if (!c) return;
          if (!cursorRef.current) { moveTo(c); return; }
          const mode = holdRef.current.onKeyDown(e.key, e.repeat);
          const deps = { next: index.next, prev: index.prev, measure, paraOf, lineHeight: lineHeightOf(c) };
          const target = mode === "line"
            ? (lineStep(c, dir, deps) || paragraphStep(c, dir, deps))
            : paragraphStep(c, dir, deps);
          moveTo(target);
          return;
        }
        case " ": e.preventDefault(); togglePlay(); return;
        case "Escape": e.preventDefault(); pause(); return;
        case "Home": e.preventDefault(); restart(); return;
        case "+": case "=": case "Add": e.preventDefault(); nudgeWpm(+WPM_NUDGE); return;
        case "-": case "_": case "Subtract": e.preventDefault(); nudgeWpm(-WPM_NUDGE); return;
        default: return;
      }
    };
    const onKeyUp = () => holdRef.current.onKeyUp();

    reader.addEventListener("keydown", onKeyDown);
    reader.addEventListener("keyup", onKeyUp);
    return () => {
      reader.removeEventListener("keydown", onKeyDown);
      reader.removeEventListener("keyup", onKeyUp);
      reader.removeAttribute("tabindex");
      reader.removeAttribute("aria-label");
    };
  }, [enabled, readerRef, docWrapperRef, placeCursor, togglePlay, pause, restart, nudgeWpm]);

  return {
    enabled, playing, wpm,
    toggle, setEnabled,
    play, pause, togglePlay, restart,
    setWpm, nudgeWpm,
    placeCursor, handleReaderClick,
  };
}
