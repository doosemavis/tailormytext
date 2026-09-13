import { useSyncExternalStore } from "react";

// Subscribe a component to the pacer store (see utils/pacer/store.js).
// Returns the current { playing, wpm } snapshot and re-renders only the
// caller when it changes.
export function usePacerState(store) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
