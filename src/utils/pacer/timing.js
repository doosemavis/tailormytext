import {
  LONG_WORD_CHARS, MULT_LONG_WORD, MULT_CLAUSE, MULT_SENTENCE, MULT_PARAGRAPH,
} from "../../config/pacer";

// Pure timing math for the WPM pacer. No DOM, no state.
// See docs/superpowers/specs/2026-09-12-wpm-pacer-design.md §3.4.

// Closing quotes/brackets that may trail sentence or clause punctuation.
const TRAIL = `["'”’)\\]]*`;
const SENTENCE_END_RE = new RegExp(`[.!?]${TRAIL}$`);
const CLAUSE_END_RE = new RegExp(`[,;:]${TRAIL}$`);

export function baseDelayMs(wpm) {
  return 60000 / wpm;
}

// Largest applicable multiplier wins; multipliers never stack.
export function wordMultiplier(word, isParaEnd = false) {
  let m = 1;
  if (isParaEnd) m = Math.max(m, MULT_PARAGRAPH);
  if (SENTENCE_END_RE.test(word)) m = Math.max(m, MULT_SENTENCE);
  else if (CLAUSE_END_RE.test(word)) m = Math.max(m, MULT_CLAUSE);
  if (word.length > LONG_WORD_CHARS) m = Math.max(m, MULT_LONG_WORD);
  return m;
}

// Mean multiplier over a container's words. Dividing each delay by this
// keeps the container's average pace equal to the requested WPM.
export function meanMultiplier(entries) {
  if (!entries || entries.length === 0) return 1;
  const total = entries.reduce((sum, e) => sum + wordMultiplier(e.word, e.isParaEnd), 0);
  return total / entries.length;
}

export function delayFor(word, isParaEnd, wpm, mean) {
  const safeMean = mean > 0 ? mean : 1;
  return baseDelayMs(wpm) * wordMultiplier(word, isParaEnd) / safeMean;
}
