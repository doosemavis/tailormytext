import React from "react";
import { Play, Pause, RotateCcw, Minus, Plus } from "lucide-react";
import { Tip } from "./Primitives";
import { WPM_NUDGE } from "../config/pacer";

// Transport bar for the WPM pacer. Sits at the bottom of the reader column
// so a reader can pause without opening the sidebar. Same 44px height and
// border language as the top toolbar so the chrome stays symmetric.

const BAR_STYLE = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
  minHeight: 44, padding: "6px 16px", flexShrink: 0,
};
const ICON_BTN = {
  width: 34, height: 34, borderRadius: 8, border: "none", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", background: "transparent",
};

function IconButton({ label, Icon, onClick, t, primary = false }) {
  return (
    <Tip label={label} t={t} side="top">
      <button
        onClick={onClick}
        aria-label={label}
        style={{
          ...ICON_BTN,
          width: primary ? 40 : 34, height: primary ? 40 : 34,
          background: primary ? t.accent : "transparent",
          color: primary ? "#fff" : t.icon,
        }}
      >
        <Icon size={primary ? 18 : 16} strokeWidth={2} />
      </button>
    </Tip>
  );
}

function PacerBar({ playing, wpm, onPlayPause, onRestart, onNudge, t }) {
  return (
    <div
      role="toolbar"
      aria-label="Pacer controls"
      style={{ ...BAR_STYLE, borderTop: `1px solid ${t.borderSoft}`, background: t.bg }}
    >
      <IconButton label="Restart" Icon={RotateCcw} onClick={onRestart} t={t} />
      <IconButton label={playing ? "Pause" : "Play"} Icon={playing ? Pause : Play} onClick={onPlayPause} t={t} primary />
      <IconButton label="Slower" Icon={Minus} onClick={() => onNudge(-WPM_NUDGE)} t={t} />
      <span
        aria-live="polite"
        style={{
          minWidth: 72, textAlign: "center", fontSize: 12, fontWeight: 500, color: t.accent,
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace", letterSpacing: "0.04em",
        }}
      >
        {wpm} wpm
      </span>
      <IconButton label="Faster" Icon={Plus} onClick={() => onNudge(WPM_NUDGE)} t={t} />
    </div>
  );
}

export default React.memo(PacerBar);
