import { describe, it, expect, vi } from "vitest";
import { createPacerStore } from "../../../src/utils/pacer/store";
import { WPM_DEFAULT } from "../../../src/config/pacer";

describe("createPacerStore", () => {
  it("starts with defaults merged with the initial patch", () => {
    expect(createPacerStore().get()).toEqual({ playing: false, wpm: WPM_DEFAULT });
    expect(createPacerStore({ wpm: 400 }).get()).toEqual({ playing: false, wpm: 400 });
  });

  it("notifies subscribers on change and returns a new snapshot object", () => {
    const store = createPacerStore();
    const before = store.get();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ playing: true });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).not.toBe(before);
    expect(store.get()).toEqual({ playing: true, wpm: WPM_DEFAULT });
  });

  it("skips notification when nothing actually changes", () => {
    const store = createPacerStore({ wpm: 300 });
    const listener = vi.fn();
    store.subscribe(listener);
    const snap = store.get();
    store.set({ wpm: 300 });
    store.set({ playing: false });
    expect(listener).not.toHaveBeenCalled();
    expect(store.get()).toBe(snap);
  });

  it("unsubscribes", () => {
    const store = createPacerStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.set({ wpm: 500 });
    expect(listener).not.toHaveBeenCalled();
  });
});
