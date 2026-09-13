import React, { useMemo } from "react";
import { Tip } from "./Primitives";

// Hoisted static base — shared shape across all toggle buttons + renders.
const BUTTON_BASE = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function FeatureToggleButtonImpl({ on, label, Icon, accent, iconColor, onToggle, t }) {
  const style = useMemo(
    () => ({
      ...BUTTON_BASE,
      background: on ? accent : "transparent",
      color: on ? "#fff" : iconColor,
    }),
    [on, accent, iconColor],
  );

  return (
    <Tip label={label} t={t} side="bottom">
      <button
        onClick={onToggle}
        aria-label={label}
        aria-pressed={on}
        className={on ? "rf-btn-icon-active" : ""}
        style={style}
      >
        <Icon size={16} strokeWidth={2} />
      </button>
    </Tip>
  );
}

// React.memo with primitive + stable-ref props. Each toggle re-renders only
// when its own `on` flag flips, not when sibling toggles change. The `t`
// (theme) object is stable per theme change because App.jsx wraps it in
// useMemo([theme]).
export default React.memo(FeatureToggleButtonImpl);
