import React, { useCallback } from "react";
import { Lock } from "lucide-react";

const LOCK_STYLE = {
  color: "#fff",
  filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))",
};

const ThemeDotImpl = React.forwardRef(function ThemeDotImpl(
  { themeKey, accent, isActive, locked, fg, bg, onSelect },
  ref,
) {
  const handleClick = useCallback(
    (e) => onSelect(themeKey, e),
    [themeKey, onSelect],
  );

  return (
    <button
      ref={ref}
      onClick={handleClick}
      className="rf-static"
      style={{
        position: "relative",
        width: 26,
        height: 26,
        borderRadius: 13,
        background: accent,
        cursor: "pointer",
        border: isActive ? `2.5px solid ${fg}` : "2.5px solid transparent",
        boxShadow: isActive ? `0 0 0 2.5px ${bg}` : "none",
        transition: "all 0.15s",
        opacity: locked ? 0.55 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {locked && <Lock size={10} style={LOCK_STYLE} />}
    </button>
  );
});

// React.memo with primitive props — themeKey, accent, isActive, locked, fg, bg
// are all primitive. onSelect must be a stable ref from the parent (useCallback).
// Only the dot whose isActive flipped re-renders when theme changes.
export default React.memo(ThemeDotImpl);
