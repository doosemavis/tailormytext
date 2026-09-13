import React from "react";
import PacerBar from "./PacerBar";
import { usePacerState } from "../hooks/usePacerState";

// Store-connected wrapper around the presentational PacerBar. Subscribes to
// the pacer store so play/pause and wpm changes re-render this small subtree
// only, never App. `pacer` is the stable object returned by usePacer.
function PacerTransport({ pacer, t }) {
  const { playing, wpm } = usePacerState(pacer.store);
  return (
    <PacerBar
      playing={playing}
      wpm={wpm}
      onPlayPause={pacer.togglePlay}
      onRestart={pacer.restart}
      onNudge={pacer.nudgeWpm}
      t={t}
    />
  );
}

export default React.memo(PacerTransport);
