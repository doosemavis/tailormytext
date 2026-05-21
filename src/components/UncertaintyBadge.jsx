import { memo } from "react";

// Shown in the reader top bar when a text-parser's confidence score is below
// 0.70. Clicking it opens the EditChaptersModal (wired in D6).
// Renders null when score is null/undefined (binary parsers, library books)
// or when confidence is already acceptable (>= 0.70).
const UncertaintyBadge = memo(function UncertaintyBadge({ score, onClick }) {
  if (score == null || score >= 0.70) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="tmt-pill--warning"
      aria-label={`Detection uncertain (score ${score.toFixed(2)}). Click to edit chapters.`}
    >
      Detection uncertain · Edit chapters
    </button>
  );
});

export default UncertaintyBadge;
