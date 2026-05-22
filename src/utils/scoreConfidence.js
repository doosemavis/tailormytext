// src/utils/scoreConfidence.js
//
// Heuristic confidence score for text-structure parsing.
// >= 0.70  high — render normally
// >= 0.55  uncertain — show uncertainty badge
//  < 0.55  fallback — single-document mode
//
// O(sections), no ML. Penalties stack intentionally so a document that
// fails multiple sanity checks lands deep in the fallback band.

// Below this text size, structural sanity checks are skipped — short docs
// can legitimately have one or two sections.
const SHORT_DOC_BYTES = 100_000;

// Rough "expected chapter density" used to compare detected section count
// against text length. Real corpora average ~30-50 KB per chapter; 50 KB is
// the more conservative threshold (fewer false-positive under-detection
// flags on books with shorter chapters).
const BYTES_PER_EXPECTED_SECTION = 50_000;

export function scoreConfidence(sections, opts = {}) {
  const { depthFallback = false, textLength = null } = opts;

  let score = 1.0;
  const reasons = [];

  if (depthFallback) {
    score -= 0.50;
    reasons.push("no_repeating_depth");
  }

  // Resolve the doc size in bytes. Caller-provided textLength is preferred
  // (captures the raw input, including stripped markup); fall back to the
  // sum of section content lengths so the function stays usable in tests
  // that don't pass textLength.
  const docBytes =
    typeof textLength === "number" && textLength > 0
      ? textLength
      : sections.reduce((acc, s) => acc + (s.content?.length || 0), 0);

  // Size outlier — graduated penalty.
  // ratio = largest section / median section. Median resists self-inflation
  // by the outlier itself. Penalty kicks in at 2x and saturates at 0.30 so
  // a single very-long section doesn't entirely tank an otherwise-clean
  // parse.
  const sizes = sections.map((s) => s.content?.length || 0).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || 0;
  const maxSize = sizes[sizes.length - 1] || 0;
  if (median > 0 && maxSize > median * 2) {
    const ratio = maxSize / median;
    const penalty = Math.min(0.30, (ratio - 2) * 0.03);
    if (penalty > 0) {
      score -= penalty;
      reasons.push("size_outlier");
    }
  }

  // Under-detection — section count is suspiciously low relative to doc
  // size. Catches the failure mode where the parser misses most chapter
  // boundaries on a long book (e.g., The Republic: 4 sections in 1.2 MB)
  // and would otherwise score 1.00 because nothing about the four detected
  // sections looks individually wrong.
  if (docBytes >= SHORT_DOC_BYTES) {
    const expected = docBytes / BYTES_PER_EXPECTED_SECTION;
    const ratio = sections.length / expected;
    if (ratio < 0.3) {
      score -= 0.35;
      reasons.push("under_detected_severe");
    } else if (ratio < 0.5) {
      score -= 0.20;
      reasons.push("under_detected_mild");
    }
  }

  if (sections.length === 1) {
    score -= 0.20;
    reasons.push("single_section");
  }

  return { score: Math.max(0, Math.min(1, score)), reasons };
}
