import React from "react";
import { Lock } from "lucide-react";
import { Slider } from "./Primitives";
import { WPM_MIN, WPM_MAX, WPM_STEP } from "../config/pacer";
import { PACER_FREE_MAX_WPM } from "../config/proFeatures";

// WPM slider with a lock marker at the free-tier cap. The marker is purely
// informational: the clamp itself lives in usePacer.setWpm so every input
// path (slider, bar buttons, keys) shares one gate.

const FMT_WPM = (v) => `${v} wpm`;
const CAP_FRACTION = (PACER_FREE_MAX_WPM - WPM_MIN) / (WPM_MAX - WPM_MIN);

function PacerWpmSlider({ value, onChange, isPro, t }) {
  return (
    <div style={{ position: "relative" }}>
      <Slider value={value} min={WPM_MIN} max={WPM_MAX} step={WPM_STEP} onChange={onChange} label="Words per minute" format={FMT_WPM} t={t} />
      {!isPro && (
        <span
          aria-label={`Faster than ${PACER_FREE_MAX_WPM} wpm is Pro`}
          title={`Faster than ${PACER_FREE_MAX_WPM} wpm is Pro`}
          style={{
            position: "absolute",
            // Slider has 12px horizontal padding; the thumb is 14px wide, so the
            // usable track spans padding+7 … 100%-(padding+7).
            left: `calc(19px + (100% - 38px) * ${CAP_FRACTION})`,
            bottom: 2, transform: "translateX(-50%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 14, height: 14, borderRadius: 7, background: t.surface, color: t.fgSoft,
            pointerEvents: "none",
          }}
        >
          <Lock size={9} strokeWidth={2.2} />
        </span>
      )}
    </div>
  );
}

export default React.memo(PacerWpmSlider);
