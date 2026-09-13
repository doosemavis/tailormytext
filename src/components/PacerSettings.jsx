import React from "react";
import PacerWpmSlider from "./PacerWpmSlider";
import { usePacerState } from "../hooks/usePacerState";

// Sidebar body of the Pacer section (shown while the pacer is enabled).
// Store-connected so a slider commit re-renders only this subtree, not App.

const HINT_STYLE = { margin: "2px 12px 6px", fontSize: 11.5, lineHeight: 1.45, fontFamily: "'DM Sans', sans-serif" };

function PacerSettings({ pacer, isPro, t }) {
  const { wpm } = usePacerState(pacer.store);
  return (
    <>
      <PacerWpmSlider value={wpm} onChange={pacer.setWpm} isPro={isPro} t={t} />
      <p style={{ ...HINT_STYLE, color: t.fgSoft }}>
        Click a word or use the arrow keys to set the start. Space plays and pauses.
      </p>
    </>
  );
}

export default React.memo(PacerSettings);
