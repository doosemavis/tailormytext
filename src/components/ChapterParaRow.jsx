import React, { useCallback } from "react";

// Hoisted style fragments — same shape every render, no per-item allocation.
const BUTTON_STYLE = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  padding: "8px 20px",
  transition: "background 0.1s",
};

const BADGE_STYLE = {
  display: "inline-block",
  marginBottom: 4,
  padding: "1px 7px",
  borderRadius: 999,
  color: "#fff",
  fontSize: 9,
  fontWeight: 700,
  fontFamily: "var(--tmt-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const TEXT_STYLE_TITLE = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.55,
  color: "var(--tmt-ink)",
  fontWeight: 600,
  overflow: "hidden",
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
};

const TEXT_STYLE_BODY = {
  ...TEXT_STYLE_TITLE,
  color: "var(--tmt-ink-soft)",
  fontWeight: 400,
};

function ChapterParaRowImpl({ index, text, isTitle, isBreak, accent, onToggle }) {
  const isFirst = index === 0;

  const handleClick = useCallback(() => {
    if (!isFirst) onToggle(index);
  }, [index, isFirst, onToggle]);

  const handleMouseEnter = useCallback(
    (e) => {
      if (!isFirst) e.currentTarget.style.background = `${accent}12`;
    },
    [isFirst, accent],
  );

  const handleMouseLeave = useCallback((e) => {
    e.currentTarget.style.background = "transparent";
  }, []);

  return (
    <button
      aria-pressed={isFirst ? undefined : isBreak}
      onClick={handleClick}
      disabled={isFirst}
      title={
        isFirst
          ? "The first paragraph always starts a chapter"
          : isBreak
          ? "Remove chapter break before this paragraph"
          : "Add chapter break before this paragraph"
      }
      style={{
        ...BUTTON_STYLE,
        borderTop:
          isBreak && !isFirst ? `2px solid ${accent}` : `1px solid transparent`,
        cursor: isFirst ? "default" : "pointer",
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isBreak && !isFirst && (
        <span style={{ ...BADGE_STYLE, background: accent }}>chapter start</span>
      )}
      {isFirst && (
        <span
          style={{
            ...BADGE_STYLE,
            background: `${accent}30`,
            color: accent,
          }}
        >
          document start
        </span>
      )}
      <p style={isTitle ? TEXT_STYLE_TITLE : TEXT_STYLE_BODY}>{text}</p>
    </button>
  );
}

// React.memo with shallow compare. Primitive props (index, text, isTitle,
// isBreak, accent) plus the stable onToggle ref mean only rows whose isBreak
// actually flipped re-render when the user toggles a break. For a 2000-
// paragraph book, that's 1-2 rows per click instead of all 2000.
export default React.memo(ChapterParaRowImpl);
