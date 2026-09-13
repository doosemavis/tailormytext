import { WPM_DEFAULT } from "../../config/pacer";

// Minimal external store for the pacer's high-frequency UI state (playing,
// wpm). Play/pause, nudges, and slider commits write here instead of App
// state, so only the transport bar and the sidebar slider re-render — App
// (and everything under it) is untouched, which matters on 400K-word books
// where an App render costs tens of milliseconds. Consumed through
// useSyncExternalStore in hooks/usePacerState.js. Pure: no React import.

export function createPacerStore(initial = {}) {
  let state = { playing: false, wpm: WPM_DEFAULT, ...initial };
  const listeners = new Set();
  return {
    get: () => state,
    set: (patch) => {
      const keys = Object.keys(patch);
      if (keys.every((k) => Object.is(patch[k], state[k]))) return;
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
