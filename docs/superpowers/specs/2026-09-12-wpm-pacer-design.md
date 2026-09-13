# WPM Pacer — Design Spec

**Date:** 2026-09-12
**Status:** Approved in brainstorming; awaiting spec review
**Branch:** `worktree-wpm-pacer` (off `origin/production`)

## 1. Summary

A reader sets a words-per-minute target, presses Play, and the document
highlights words at that pace in place. The current word is bright and the
three words before it fade out behind it, so the reader's eye is pulled
forward along the real page layout rather than into a single-word box. The
goal is to let readers train speed and comprehension together on the text
they are actually reading.

The feature is free for everyone up to a WPM ceiling. Speeds above the
ceiling require Pro.

## 2. Decisions made in brainstorming

| Question | Decision |
| --- | --- |
| Highlight shape | Current word plus a three-word fading trail |
| Start point | Click a word, or arrow keys, else first visible paragraph |
| Arrow keys | Left/Right = word; Up/Down = visual line; held Up/Down switches to paragraph after 10 line steps |
| WPM nudge keys | Plus and Minus (arrows are reserved for the cursor) |
| Tier | Free up to `PACER_FREE_MAX_WPM` (400); above that is Pro |
| Engine | DOM-driven hook toggling classes on existing `.rf-word` spans |
| Dependencies | None new |
| Persistence | WPM per device via user-scoped localStorage; on/off and playing are not persisted |

## 3. Architecture

### 3.1 Overview

```
App.jsx
  ├─ usePacer({ docWrapperRef, readerRef, docSections, isPro, onProGate, authReady })
  │     ├─ utils/pacer/timing.js     pure: delay per word, section normalization
  │     ├─ utils/pacer/nav.js        pure: next/prev word, line step, paragraph step, hold accel
  │     └─ utils/pacer/wordIndex.js  DOM: ordered word traversal, one container cached at a time
  ├─ Sidebar  <Section title="Pacer">  Toggle + PacerWpmSlider + key tip
  ├─ Toolbar  <FeatureToggleButton label="Pacer">
  └─ Reader   <PacerBar>  Restart, Play/Pause, WPM −/+ readout (visible only while enabled)
global.css: .rf-pace-current, .rf-pace-trail-1..3, .rf-pace-cursor, reduced-motion rules
config/pacer.js: all tunables
config/proFeatures.js: PACER_FREE_MAX_WPM, clampWpmForTier()
```

The hook follows the `useEnhancements` pattern: React state holds only
`enabled`, `playing`, and `wpm`. The cursor (current word element), the
cached container word list, the timer handle, the trail elements, and the
hold-accel counter live in refs. The React tree never re-renders per tick.

### 3.2 DOM contract

`DocumentBody` renders every word as
`<span class="rf-word" data-word="…"><strong>…</strong>…{" "}</span>`
inside `.rf-para[data-idx]`, inside `.rf-section` when the document has
sections. The pacer depends on exactly that structure and on nothing else in
`DocumentBody`. `DocumentBody` itself is not modified; the one delegated
click listener (§5.3) is attached in `App.jsx`.

### 3.3 Word traversal (`wordIndex.js`)

Position is an element reference, not a global index. To advance:

1. Look up the cached `{ container, words: NodeList, i, meanMultiplier }`
   for the cursor's container (a `.rf-section`, or a `.rf-para` for
   plain-text docs).
2. If `i + 1 < words.length`, return `words[i + 1]`.
3. Otherwise find the next container in document order via
   `nextElementSibling` walking, query its `.rf-word` list, cache it, and
   return its first word. Return `null` at end of document.

`prev` mirrors this. The cache holds one container at a time. On a
427K-word book that bounds per-tick work to one array index and, at
boundaries, one `querySelectorAll` over a single chapter.

`content-visibility: auto` on `.rf-para` means off-screen paragraphs have no
layout. Traversal does not need layout; only line stepping and auto-scroll
do, and both operate near the cursor, which is always scrolled into view
first.

### 3.4 Timing (`timing.js`)

All functions are pure.

- `baseDelayMs(wpm) = 60000 / wpm`
- `wordMultiplier(word, isParaEnd)`:
  - length > `LONG_WORD_CHARS` (8) → `MULT_LONG_WORD` (1.3)
  - ends with `,` `;` `:` → `MULT_CLAUSE` (1.5)
  - ends with `.` `!` `?` (optionally followed by a closing quote or
    bracket) → `MULT_SENTENCE` (2.0)
  - last word of a paragraph → `MULT_PARAGRAPH` (2.5)
  - multipliers do not stack; the largest applicable one wins
- `sectionMeanMultiplier(words)` — mean of `wordMultiplier` over a
  container's word list, computed once when the container is cached.
- `delayFor(word, isParaEnd, wpm, meanMultiplier) = baseDelayMs(wpm) * wordMultiplier / meanMultiplier`

Dividing by the mean keeps the container's average pace equal to the set
WPM, so the number the reader trains against is honest.

The scheduler is a self-correcting `setTimeout` chain: each tick records
`nextDueAt += delay` and schedules `setTimeout(tick, nextDueAt - now)`, so
drift does not accumulate across a chapter. `requestAnimationFrame` is not
used because it stops in background tabs and its cadence is unrelated to
WPM.

### 3.5 Highlight writes

Each tick performs at most four class operations on four elements: the
outgoing word loses `rf-pace-current` and gains `rf-pace-trail-1`; the
prior trail words shift `1→2→3`; the word leaving the trail loses its
class; the incoming word gains `rf-pace-current`. A `trail` ref holds the
last three elements so no DOM query is needed.

The cursor outline (`rf-pace-cursor`) is a separate class on the current
word shown while enabled and paused. Playing removes it; pausing restores
it on the word where playback stopped.

### 3.6 Auto-scroll

After each tick the hook reads the current word's bounding box relative to
the reader. If its vertical center falls outside the middle `SCROLL_BAND`
(60%) of the reader height, the hook scrolls the reader so the word lands
at the vertical center, using `scrollTo({ behavior: "smooth" })`, or
`"auto"` when `prefers-reduced-motion` is set. One `getBoundingClientRect`
per tick is well within budget at any reachable WPM.

### 3.7 Lifecycle and safety

- `visibilitychange` to hidden → pause.
- Document change (`docSections` identity changes) → stop, clear classes,
  clear cache, cursor to null.
- Disable → same as document change.
- End of document → stop, leave the last word highlighted, `playing=false`.
- Unmount → clear timer and classes.
- The hook removes any classes it added before dropping element references
  so a paused pacer never leaves stray highlights after a re-render.

## 4. Navigation (`nav.js`)

All navigation pauses playback first, then moves the cursor.

- **Left / Right** — `prevWord` / `nextWord` via `wordIndex`.
- **Up / Down** — `lineStep(cursor, dir, measure)`. `measure` is an injected
  function returning `{ top, left, right }` for an element. The step walks
  words in `dir` until it finds one whose `top` differs from the cursor's by
  more than half a line height, records that line's `top`, then continues
  while `top` stays on that line and picks the word whose horizontal center
  is nearest the cursor's center. Returns `null` when no further line
  exists.
- **Paragraph step** — first word of the previous / next `.rf-para`.
- **Hold acceleration** — `holdAccel` is a small pure state machine:
  `{ lines: 0 }` on keydown of a fresh key; each repeat increments `lines`;
  once `lines >= HOLD_ACCEL_LINES` (10) the step function switches from
  `lineStep` to paragraph step for the rest of the hold; `keyup` resets.
  Repeats come from the browser's native key repeat (`event.repeat`), so no
  interval timer is needed.
- **Home** — cursor to the first word of the first paragraph whose top edge
  is inside the reader viewport.
- **Space** — toggle play / pause.
- **Plus / Minus** (also `=` and `_`, and numpad variants) — WPM
  ±`WPM_NUDGE` (25), through the same gated setter as the slider.
- **Escape** — pause.

Keys are handled by a `keydown` / `keyup` listener pair on the reader
scroll element, which receives `tabIndex=0` and an `aria-label` only while
the pacer is enabled. The listener calls `preventDefault` only for keys it
consumes, so Tab, page navigation, and shortcuts elsewhere are untouched.
When the pacer is disabled the element loses `tabIndex` and the listeners
are removed, so arrow keys scroll the reader exactly as they do today.

Cursor placement when Play is pressed with no cursor: first word of the
first paragraph whose top edge is inside the reader viewport. If no
paragraph qualifies (empty document), Play is a no-op.

## 5. UI

### 5.1 Sidebar section "Pacer"

Placed directly after the Enhancements section. Uses `Section` (open=false,
`active={pacer.enabled}`), a `Toggle` labelled "Pacer" with a Gauge icon,
and `PacerWpmSlider`, a thin wrapper around `Slider` (min `WPM_MIN`, max
`WPM_MAX`, step `WPM_STEP`, format `FMT_WPM` → "300 wpm") whose `onChange`
is the gated setter. For free users the wrapper overlays a small lock glyph
on the track at `(cap − min) / (max − min)`. Below the slider a short
`fgSoft` tip reads: "Click a word or use the arrow keys to set the start.
Space plays and pauses."

### 5.2 Toolbar toggle

A fourth `FeatureToggleButton` after Focus, label "Pacer", Gauge icon,
`onToggle={pacer.toggle}`. Same size and styling as its siblings so the
four buttons keep equal visual weight.

### 5.3 PacerBar

New component `src/components/PacerBar.jsx`, rendered as a sibling of the
reader scroll container inside the same flex column so it stays fixed at
the bottom of the reader while content scrolls. Visible only while
`pacer.enabled`. Contents, left to right:

- Restart (RotateCcw icon) — cursor back to Home position, paused.
- Play / Pause (Play / Pause icons) — primary button, accent background.
- Minus, WPM readout ("300 wpm", mono font), Plus.

Height 44px, same shadow and border language as the top toolbar, centered
horizontally, `role="toolbar"`, every button with `aria-label`. The readout
uses `aria-live="polite"` so screen readers hear WPM changes.

Click-to-place: `App.jsx` attaches one `onClick` to the doc wrapper. The
handler calls `e.target.closest(".rf-word")`; if found and the pacer is
enabled, it calls `pacer.placeCursor(el)`. Clicks while disabled are
ignored, so text selection behaviour is unchanged when the feature is off.

### 5.4 CSS

Added to `global.css`:

```css
.rf-word { border-radius: 3px; transition: background-color 0.18s ease; }
.rf-pace-current { background: var(--rf-pace-color); }
.rf-pace-trail-1 { background: color-mix(in oklab, var(--rf-pace-color) 60%, transparent); }
.rf-pace-trail-2 { background: color-mix(in oklab, var(--rf-pace-color) 35%, transparent); }
.rf-pace-trail-3 { background: color-mix(in oklab, var(--rf-pace-color) 15%, transparent); }
.rf-pace-cursor  { outline: 2px solid var(--rf-pace-color); outline-offset: 1px; }
@media (prefers-reduced-motion: reduce) {
  .rf-word { transition: none; }
  .rf-pace-trail-1, .rf-pace-trail-2, .rf-pace-trail-3 { background: transparent; }
}
```

`--rf-pace-color` is set to the active theme's `accent` on the reader scroll
container's inline style in `App.jsx`; the CSS applies its own alpha per
class (28 / 18 / 11 / 5 %) so one colour serves the solid cursor outline and
the translucent fills, and the highlight follows theme changes with a single
inline-style write.

## 6. Gating

`config/proFeatures.js` gains:

```js
export const PACER_FREE_MAX_WPM = 400;
export const clampWpmForTier = (wpm, isPro) =>
  isPro ? wpm : Math.min(wpm, PACER_FREE_MAX_WPM);
```

`usePacer.setWpm(next)` clamps to `[WPM_MIN, WPM_MAX]`, then calls
`clampWpmForTier`. If the tier clamp changed the value, the hook stores the
clamped value and calls `onProGate()`, which `App.jsx` wires to open the
pricing modal. This single path covers the slider, the bar buttons, and the
keyboard nudge.

If a Pro user's subscription lapses while a WPM above the cap is stored, the
hook clamps on next load; the stored value is not rewritten until the user
changes it.

## 7. Configuration (`config/pacer.js`)

```js
export const WPM_MIN = 100;
export const WPM_MAX = 1000;
export const WPM_DEFAULT = 250;
export const WPM_STEP = 10;
export const WPM_NUDGE = 25;
export const TRAIL_LENGTH = 3;
export const HOLD_ACCEL_LINES = 10;
export const SCROLL_BAND = 0.6;          // fraction of reader height kept "comfortable"
export const LONG_WORD_CHARS = 8;
export const MULT_LONG_WORD = 1.3;
export const MULT_CLAUSE = 1.5;          // , ; :
export const MULT_SENTENCE = 2.0;        // . ! ?
export const MULT_PARAGRAPH = 2.5;
export const STORAGE_KEY_WPM = "pacer-wpm";
```

## 8. Persistence

`usePacer` reads `STORAGE_KEY_WPM` through `storageGet` once `authReady` is
true (keys are user-scoped, so reading before scope is set would hit the
wrong namespace) and writes through `storageSet` on every committed WPM
change. Reads that fail or return a non-numeric value fall back to
`WPM_DEFAULT`. `enabled` and `playing` are never persisted.

The read/write pair is isolated in two small functions inside the hook so
the later per-user accessibility-preferences work can redirect them to the
profile column without touching the engine.

## 9. Error handling

- All DOM reads are guarded: a missing wrapper, reader, or cursor element
  makes the operation a no-op rather than a throw.
- `storageGet` / `storageSet` failures are caught and logged with a
  `[pacer]` prefix; the feature keeps working with in-memory state.
- If the cursor element is detached from the DOM (document re-rendered
  under a paused pacer), the next tick or key press detects
  `!cursor.isConnected`, clears state, and behaves as "no cursor set".
- The timer callback is wrapped so an unexpected exception stops playback
  cleanly and logs, rather than leaving a dangling timeout chain.

## 10. Testing

Test runner: Vitest with happy-dom, files under `tests/`.

- `tests/utils/pacer/timing.test.js` — base delay, each multiplier, "largest
  wins" rule, punctuation followed by quote, mean normalization property
  (sum of delays over a synthetic container equals `words / wpm` minutes
  within 1%).
- `tests/utils/pacer/nav.test.js` — next/prev across paragraph and section
  boundaries and at document ends; `lineStep` with a fake `measure` that
  lays words on a grid, including "nearest horizontal center" and "no next
  line"; `holdAccel` state machine transitions and reset on keyup.
- `tests/utils/pacer/wordIndex.test.js` — traversal over a rendered
  three-section fixture, cache rebuilt at boundaries, `null` at end.
- `tests/hooks/usePacer.test.jsx` — with fake timers: play advances classes
  in the expected pattern, pause freezes them, trail length stays 3, end of
  document stops, `visibilitychange` pauses, disable clears every class,
  `setWpm` clamps and fires `onProGate` for free but not Pro, storage
  round-trip via a mocked `storage.js`.
- `tests/config/proFeatures.test.js` — `clampWpmForTier`.
- `tests/components/PacerBar.test.jsx` — renders buttons with labels,
  Play/Pause label reflects state, readout announces WPM.

Manual browser verification (per the per-commit verify rule) on Don
Quixote: auto-scroll smoothness at 250 and 800 WPM, line stepping at two
font sizes and two column widths, hold acceleration, theme switch while
playing, reduced-motion mode.

## 11. Delivery plan (summary; details in the implementation plan)

Commits in order, each green on `npm test` and `npm run build`:

1. `config/pacer.js` + `proFeatures` additions + tests.
2. `timing.js` + tests.
3. `nav.js` + tests.
4. `wordIndex.js` + tests.
5. `usePacer.js` + tests.
6. `PacerBar.jsx` + `PacerWpmSlider.jsx` + tests + CSS.
7. `App.jsx` wiring (sidebar, toolbar, bar, click handler, theme color var).
   Browser-verified by the owner before commit.
8. Docs: CLAUDE.md hook list and TAILORMYTEXT.md capability entry.

## 12. Out of scope

- Comprehension quizzes or scoring.
- Session statistics (time read, average WPM).
- Analytics events (would require a migration to extend the `events` CHECK
  constraint).
- Server-side persistence of WPM (deferred to the accessibility-preferences
  work).
- Touch gestures beyond tap-to-place, which the click handler already
  covers.
