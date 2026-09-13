// WPM Pacer tunables. Every number the pacer engine or its UI depends on
// lives here so retuning never requires a code hunt. See
// docs/superpowers/specs/2026-09-12-wpm-pacer-design.md §7.

export const WPM_MIN = 100;
export const WPM_MAX = 1000;
export const WPM_DEFAULT = 250;
export const WPM_STEP = 10;      // slider granularity
export const WPM_NUDGE = 25;     // Plus/Minus keys and bar buttons

export const TRAIL_LENGTH = 3;   // words fading behind the current one
export const HOLD_ACCEL_LINES = 10; // held Up/Down switches to paragraph steps after this many line steps
export const SCROLL_BAND = 0.6;  // fraction of reader height the current word is kept inside

// Per-word timing multipliers. The largest applicable one wins; they do not
// stack. Delays are normalised by the container mean so the set WPM holds.
export const LONG_WORD_CHARS = 8;
export const MULT_LONG_WORD = 1.3;
export const MULT_CLAUSE = 1.5;     // , ; :
export const MULT_SENTENCE = 2.0;   // . ! ?
export const MULT_PARAGRAPH = 2.5;  // last word of a paragraph

export const STORAGE_KEY_WPM = "pacer-wpm";
