import React, { useCallback } from "react";

const NUMBER_STYLE = {
  fontFamily: "var(--tmt-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.1em",
  flexShrink: 0,
};

const INPUT_STYLE = {
  flex: 1,
  minWidth: 0,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "var(--tmt-sans)",
  color: "var(--tmt-ink)",
  background: "transparent",
  border: "none",
  padding: "2px 0",
};

const ROW_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 4,
};

const SNIPPET_STYLE = {
  margin: 0,
  fontSize: 11,
  lineHeight: 1.5,
  color: "var(--tmt-ink-muted)",
  overflow: "hidden",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
};

const SNIPPET_EMPTY_STYLE = {
  margin: 0,
  fontSize: 11,
  color: "var(--tmt-ink-muted)",
  fontStyle: "italic",
};

function ChapterCardItemImpl({
  chapterIndex,
  startIdx,
  titleOverride,
  autoTitle,
  snippet,
  accent,
  borderSoft,
  onTitleChange,
  onTitleClear,
}) {
  const handleChange = useCallback(
    (e) => onTitleChange(startIdx, e.target.value),
    [startIdx, onTitleChange],
  );

  const handleFocus = useCallback(
    (e) => {
      e.currentTarget.style.borderBottomColor = accent;
    },
    [accent],
  );

  const handleBlur = useCallback(
    (e) => {
      e.currentTarget.style.borderBottomColor = borderSoft;
      if (!e.currentTarget.value) {
        onTitleClear(startIdx);
      }
    },
    [startIdx, borderSoft, onTitleClear],
  );

  return (
    <div
      style={{
        padding: "10px 20px",
        borderBottom: `1px solid ${borderSoft}`,
      }}
    >
      <div style={ROW_STYLE}>
        <span style={{ ...NUMBER_STYLE, color: accent }}>{chapterIndex}</span>
        <input
          type="text"
          value={titleOverride ?? ""}
          placeholder={autoTitle}
          aria-label={`Title for chapter ${chapterIndex}`}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={{
            ...INPUT_STYLE,
            borderBottom: `1px solid ${borderSoft}`,
          }}
        />
      </div>
      {snippet ? (
        <p style={SNIPPET_STYLE}>
          {snippet}
          {snippet.length === 120 ? "…" : ""}
        </p>
      ) : (
        <p style={SNIPPET_EMPTY_STYLE}>(no body text)</p>
      )}
    </div>
  );
}

// React.memo with shallow compare. Primitive props + stable onTitleChange /
// onTitleClear refs mean only cards whose titleOverride or snippet changed
// re-render. Toggling a break only re-renders the affected chapter cards,
// not all of them.
export default React.memo(ChapterCardItemImpl);
