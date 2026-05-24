import React, { useCallback } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

// Hoisted style fragments — same shape every render, no per-item allocation.
const BASE_STYLE = {
  padding: "10px 14px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 10,
  outline: "none",
  userSelect: "none",
};

const LABEL_STYLE = {
  fontSize: 13,
  fontFamily: "'DM Sans', sans-serif",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const ChapterDropdownItemImpl = React.forwardRef(function ChapterDropdownItemImpl(
  { index, label, active, isLast, theme, onSelect },
  ref,
) {
  const handleSelect = useCallback(() => onSelect(index), [index, onSelect]);

  const handleMouseEnter = useCallback(
    (e) => {
      e.currentTarget.style.background = active ? theme.accentSoft : theme.surfaceHover;
    },
    [active, theme.accentSoft, theme.surfaceHover],
  );

  const handleMouseLeave = useCallback(
    (e) => {
      e.currentTarget.style.background = active ? theme.accentSoft : "transparent";
    },
    [active, theme.accentSoft],
  );

  return (
    <DropdownMenu.Item
      ref={ref}
      onSelect={handleSelect}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        ...BASE_STYLE,
        color: active ? theme.accent : theme.fg,
        fontWeight: active ? 650 : 550,
        background: active ? theme.accentSoft : "transparent",
        borderBottom: isLast ? "none" : `1px solid ${theme.borderSoft}`,
      }}
    >
      <span style={LABEL_STYLE}>{label}</span>
    </DropdownMenu.Item>
  );
});

// React.memo with default shallow compare. With primitive props (index, label,
// active, isLast) plus the stable theme + onSelect refs from the parent, only
// items whose `active` flag actually flipped will re-render when the scroll
// watcher updates currentSectionIdx. For a 149-section book, that's 1-2 items
// per scroll update instead of all 149.
export default React.memo(ChapterDropdownItemImpl);
