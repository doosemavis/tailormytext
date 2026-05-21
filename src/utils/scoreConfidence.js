// src/utils/scoreConfidence.js
//
// Heuristic confidence score for text-structure parsing.
// >= 0.70  high — render normally
// >= 0.55  uncertain — show uncertainty badge
//  < 0.55  fallback — single-document mode
//
// O(sections), no ML.

export function scoreConfidence(sections, { depthFallback }) {
  let score = 1.0;
  const reasons = [];

  if (depthFallback) {
    score -= 0.50;
    reasons.push("no_repeating_depth");
  }

  const sizes = sections.map((s) => s.content.length).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)];
  if (median > 0 && sizes[sizes.length - 1] > median * 5) {
    score -= 0.21;
    reasons.push("size_outlier");
  }

  if (sections.length === 1) {
    score -= 0.20;
    reasons.push("single_section");
  }

  return { score: Math.max(0, Math.min(1, score)), reasons };
}
