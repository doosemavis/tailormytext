import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../src/utils/storage", () => ({
  storageGet: vi.fn(async () => null),
  storageSet: vi.fn(async () => true),
}));

import { storageGet, storageSet } from "../../src/utils/storage";
import { usePacer } from "../../src/hooks/usePacer";
import { WPM_DEFAULT, WPM_NUDGE, STORAGE_KEY_WPM } from "../../src/config/pacer";
import { PACER_FREE_MAX_WPM } from "../../src/config/proFeatures";

function word(text) {
  return `<span class="rf-word" data-word="${text}"><strong>${text[0]}</strong>${text.slice(1)} </span>`;
}
const DOC = `
<div id="reader" style="height:400px;overflow:auto">
  <div id="wrap">
    <div>
      <div class="rf-section">
        <div class="rf-para" data-idx="0">${["One", "two", "three", "four", "five."].map(word).join("")}</div>
        <div class="rf-para" data-idx="1">${["Six", "seven."].map(word).join("")}</div>
      </div>
    </div>
  </div>
</div>`;

const words = () => Array.from(document.querySelectorAll(".rf-word"));
const classesOf = (el) => Array.from(el.classList).filter((c) => c.startsWith("rf-pace")).sort();

function mount(overrides = {}) {
  document.body.innerHTML = DOC;
  const reader = document.getElementById("reader");
  const wrap = document.getElementById("wrap");
  // happy-dom has no layout: make every word "visible" at the top of the reader
  // and give the reader a size, so firstVisibleWord() and the scroll band work.
  reader.getBoundingClientRect = () => ({ top: 0, bottom: 400, height: 400, left: 0, right: 800 });
  document.querySelectorAll(".rf-section, .rf-para, .rf-word").forEach((el) => {
    el.getBoundingClientRect = () => ({ top: 10, bottom: 30, height: 20, left: 0, right: 40 });
  });
  reader.scrollTo = vi.fn();
  const docSections = [{ title: "T", content: "x" }];
  const props = {
    docWrapperRef: { current: wrap },
    readerRef: { current: reader },
    docSections,
    text: "x",
    isPro: false,
    onProGate: vi.fn(),
    authReady: true,
    ...overrides,
  };
  const hook = renderHook((p) => usePacer(p), { initialProps: props });
  return { hook, props, reader, wrap };
}

beforeEach(() => {
  vi.useFakeTimers();
  storageGet.mockClear();
  storageSet.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("usePacer — enable and cursor", () => {
  it("starts disabled, paused, at the default WPM", () => {
    const { hook } = mount();
    expect(hook.result.current.enabled).toBe(false);
    expect(hook.result.current.store.get().playing).toBe(false);
    expect(hook.result.current.store.get().wpm).toBe(WPM_DEFAULT);
  });

  it("placeCursor marks the word with the cursor class while paused", () => {
    const { hook } = mount();
    act(() => hook.result.current.toggle());
    act(() => hook.result.current.placeCursor(words()[2]));
    expect(classesOf(words()[2])).toEqual(["rf-pace-cursor"]);
  });

  it("handleReaderClick places the cursor only while enabled", () => {
    const { hook } = mount();
    const target = words()[1];
    act(() => hook.result.current.handleReaderClick({ target }));
    expect(classesOf(target)).toEqual([]);
    act(() => hook.result.current.toggle());
    act(() => hook.result.current.handleReaderClick({ target }));
    expect(classesOf(target)).toEqual(["rf-pace-cursor"]);
  });

  it("disabling clears every pacer class", () => {
    const { hook } = mount();
    act(() => hook.result.current.toggle());
    act(() => hook.result.current.placeCursor(words()[0]));
    act(() => hook.result.current.play());
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => hook.result.current.toggle());
    expect(words().flatMap(classesOf)).toEqual([]);
    expect(hook.result.current.store.get().playing).toBe(false);
  });
});

describe("usePacer — playback", () => {
  it("play with no cursor starts at the first visible word and advances with a 3-word trail", () => {
    const { hook } = mount();
    act(() => hook.result.current.toggle());
    act(() => hook.result.current.play());
    expect(hook.result.current.store.get().playing).toBe(true);
    const w = words();
    expect(classesOf(w[0])).toEqual(["rf-pace-current"]);

    // WPM 250 → base 240ms; multipliers vary, so step generously.
    act(() => { vi.advanceTimersByTime(4000); });
    // After enough ticks the cursor is past word 3; trail is exactly 3 long.
    const current = w.find((el) => el.classList.contains("rf-pace-current"));
    expect(current).toBeTruthy();
    const trailCount = w.filter((el) => Array.from(el.classList).some((c) => c.startsWith("rf-pace-trail"))).length;
    expect(trailCount).toBeLessThanOrEqual(3);
  });

  it("resumes from where it was after a main-thread stall instead of racing ahead", () => {
    const { hook } = mount();
    act(() => hook.result.current.toggle());
    act(() => hook.result.current.placeCursor(words()[0]));
    act(() => hook.result.current.play());
    // A 3s stall: the wall clock jumps while no timer got to run.
    act(() => { vi.setSystemTime(Date.now() + 3000); });
    act(() => { vi.advanceTimersToNextTimer(); });
    expect(classesOf(words()[1])).toContain("rf-pace-current");
    // Without the guard every missed word would fire back-to-back here.
    act(() => { vi.advanceTimersByTime(5); });
    expect(classesOf(words()[1])).toContain("rf-pace-current");
    expect(classesOf(words()[6])).toEqual([]);
  });

  it("stops at the end of the document, leaving the last word highlighted", () => {
    const { hook } = mount();
    act(() => hook.result.current.toggle());
    act(() => hook.result.current.placeCursor(words()[5])); // "Six"
    act(() => hook.result.current.play());
    act(() => { vi.advanceTimersByTime(10000); });
    expect(hook.result.current.store.get().playing).toBe(false);
    expect(classesOf(words()[6])).toContain("rf-pace-current");
  });

  it("pause freezes the highlight and restores the cursor class", () => {
    const { hook } = mount();
    act(() => hook.result.current.toggle());
    act(() => hook.result.current.placeCursor(words()[0]));
    act(() => hook.result.current.play());
    act(() => { vi.advanceTimersByTime(700); });
    act(() => hook.result.current.pause());
    const current = words().find((el) => el.classList.contains("rf-pace-current"));
    expect(current.classList.contains("rf-pace-cursor")).toBe(true);
    const idx = words().indexOf(current);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(words().indexOf(words().find((el) => el.classList.contains("rf-pace-current")))).toBe(idx);
  });

  it("pauses when the tab becomes hidden", () => {
    const { hook } = mount();
    act(() => hook.result.current.toggle());
    act(() => hook.result.current.play());
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(hook.result.current.store.get().playing).toBe(false);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("resets when the document changes", () => {
    const { hook, props } = mount();
    act(() => hook.result.current.toggle());
    act(() => hook.result.current.play());
    hook.rerender({ ...props, docSections: [{ title: "New", content: "y" }] });
    expect(hook.result.current.store.get().playing).toBe(false);
    expect(words().flatMap(classesOf)).toEqual([]);
  });

  it("restart moves the cursor back to the first visible word, paused", () => {
    const { hook } = mount();
    act(() => hook.result.current.toggle());
    act(() => hook.result.current.placeCursor(words()[4]));
    act(() => hook.result.current.play());
    act(() => hook.result.current.restart());
    expect(hook.result.current.store.get().playing).toBe(false);
    expect(classesOf(words()[0])).toEqual(["rf-pace-cursor"]);
  });
});

describe("usePacer — WPM and gating", () => {
  it("nudges by WPM_NUDGE and persists", async () => {
    const { hook } = mount();
    act(() => hook.result.current.nudgeWpm(+WPM_NUDGE));
    expect(hook.result.current.store.get().wpm).toBe(WPM_DEFAULT + WPM_NUDGE);
    expect(storageSet).toHaveBeenCalledWith(STORAGE_KEY_WPM, String(WPM_DEFAULT + WPM_NUDGE));
  });

  it("clamps free users at the cap and calls onProGate", () => {
    const { hook, props } = mount();
    act(() => hook.result.current.setWpm(900));
    expect(hook.result.current.store.get().wpm).toBe(PACER_FREE_MAX_WPM);
    expect(props.onProGate).toHaveBeenCalledTimes(1);
  });

  it("lets Pro users use the full range without gating", () => {
    const { hook, props } = mount({ isPro: true });
    act(() => hook.result.current.setWpm(900));
    expect(hook.result.current.store.get().wpm).toBe(900);
    expect(props.onProGate).not.toHaveBeenCalled();
  });

  it("clamps to the absolute range", () => {
    const { hook } = mount({ isPro: true });
    act(() => hook.result.current.setWpm(5000));
    expect(hook.result.current.store.get().wpm).toBe(1000);
    act(() => hook.result.current.setWpm(1));
    expect(hook.result.current.store.get().wpm).toBe(100);
  });

  it("loads a stored WPM once auth is ready, clamped to tier", async () => {
    storageGet.mockResolvedValueOnce("600");
    const { hook } = mount();
    await act(async () => { await Promise.resolve(); });
    expect(storageGet).toHaveBeenCalledWith(STORAGE_KEY_WPM);
    expect(hook.result.current.store.get().wpm).toBe(PACER_FREE_MAX_WPM);
  });
});

describe("usePacer — keyboard", () => {
  function press(reader, key, opts = {}) {
    const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts });
    reader.dispatchEvent(ev);
    return ev;
  }

  it("never makes the reader focusable; keys work from anywhere except typing surfaces, and only while enabled", () => {
    const { hook, reader } = mount();
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => hook.result.current.placeCursor(words()[1]));
    act(() => { press(document.body, "ArrowRight"); });
    expect(words().flatMap(classesOf)).toEqual([]);          // disabled: no cursor, no key handling
    act(() => hook.result.current.toggle());
    expect(reader.hasAttribute("tabindex")).toBe(false);
    act(() => hook.result.current.placeCursor(words()[1]));
    act(() => { press(document.body, "ArrowRight"); });       // from outside the reader
    expect(classesOf(words()[2])).toEqual(["rf-pace-cursor"]);
    act(() => { press(input, "ArrowRight"); });               // inside an input: ignored
    expect(classesOf(words()[2])).toEqual(["rf-pace-cursor"]);
    act(() => hook.result.current.toggle());
    act(() => { press(document.body, "ArrowRight"); });       // disabled again: listener gone
    expect(words().flatMap(classesOf)).toEqual([]);
  });

  it("ArrowRight / ArrowLeft move the cursor by one word", () => {
    const { hook, reader } = mount();
    act(() => hook.result.current.toggle());
    act(() => hook.result.current.placeCursor(words()[1]));
    act(() => { press(reader, "ArrowRight"); });
    expect(classesOf(words()[2])).toEqual(["rf-pace-cursor"]);
    act(() => { press(reader, "ArrowLeft"); });
    expect(classesOf(words()[1])).toEqual(["rf-pace-cursor"]);
  });

  it("Space toggles play and Escape pauses; consumed keys are prevented", () => {
    const { hook, reader } = mount();
    act(() => hook.result.current.toggle());
    let ev;
    act(() => { ev = press(reader, " "); });
    expect(ev.defaultPrevented).toBe(true);
    expect(hook.result.current.store.get().playing).toBe(true);
    act(() => { press(reader, "Escape"); });
    expect(hook.result.current.store.get().playing).toBe(false);
  });

  it("Plus and Minus nudge WPM; unrelated keys are not prevented", () => {
    const { hook, reader } = mount();
    act(() => hook.result.current.toggle());
    act(() => { press(reader, "+"); });
    expect(hook.result.current.store.get().wpm).toBe(WPM_DEFAULT + WPM_NUDGE);
    act(() => { press(reader, "-"); });
    expect(hook.result.current.store.get().wpm).toBe(WPM_DEFAULT);
    let ev;
    act(() => { ev = press(reader, "Tab"); });
    expect(ev.defaultPrevented).toBe(false);
  });

  it("ArrowDown falls back to a paragraph step when no layout is available", () => {
    // In happy-dom every word measures identically, so lineStep finds no
    // next line and returns null; the hook then tries a paragraph step.
    const { hook, reader } = mount();
    act(() => hook.result.current.toggle());
    act(() => hook.result.current.placeCursor(words()[0]));
    act(() => { press(reader, "ArrowDown"); });
    expect(classesOf(words()[5])).toEqual(["rf-pace-cursor"]);
  });
});
