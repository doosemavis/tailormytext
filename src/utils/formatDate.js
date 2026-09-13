// Shared date formatters. Previously each modal/page inlined its own
// `function formatDate(d)`; six call sites converged on the same body
// with minor variants (null guard vs not, "long" vs "short" month).
// Centralized here so the locale + null-fallback are consistent.

const LONG_OPTS = { month: "long", day: "numeric", year: "numeric" };
const SHORT_OPTS = { month: "short", day: "numeric", year: "numeric" };

export function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", LONG_OPTS);
}

export function formatDateShort(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", SHORT_OPTS);
}
