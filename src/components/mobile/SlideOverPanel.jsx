import { useEffect, useRef } from "react";

// True when `el` has focus that the user reached by keyboard. Engines without
// :focus-visible (Safari < 15.4) throw on the selector; treat that as "not
// keyboard", which means focus is simply not handed back on close.
function hasKeyboardFocus(el) {
  try {
    return el.matches(":focus-visible");
  } catch {
    return false;
  }
}

// Tablet/phone side panel: slides over the reader instead of pushing it
// (spec §6.2). Deliberately NOT a Radix modal Dialog: modal mode sets
// pointer-events:none on <body>, which restyles every word span in a large
// book (~1.2s on Don Quixote), the same reason the chapter menu is
// non-modal. Contents stay mounted while closed so the hidden file <input>
// inside the panel keeps working for the reader's "Upload a file" button.
// z-index (responsive.css) sits below the font picker menu (zIndex 200) so
// pickers opened from the panel render above it.
export default function SlideOverPanel({ open, onOpenChange, width, background, borderColor, label = "Reader panel", children }) {
  const panelRef = useRef(null);

  // Dialog focus pattern: on open, move focus into the panel. On close (or
  // unmount), hand focus back to the opener ONLY if the opener had keyboard
  // focus when the panel opened. After a touch/mouse open nothing is focused
  // programmatically: the opener is a Radix Tooltip trigger, and Tooltip
  // opens on focus, so a programmatic focus there leaves a tooltip that no
  // pointer-leave or blur will ever close on a touch screen.
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const restoreTo = opener instanceof HTMLElement && hasKeyboardFocus(opener) ? opener : null;
    panelRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onOpenChange(false); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (restoreTo?.isConnected) restoreTo.focus();
    };
  }, [open, onOpenChange]);

  return (
    <>
      {open && (
        <div className="rf-slideover-backdrop" data-testid="slideover-backdrop" aria-hidden="true" onClick={() => onOpenChange(false)} />
      )}
      <aside
        ref={panelRef}
        role="dialog"
        aria-label={label}
        aria-hidden={!open}
        data-state={open ? "open" : "closed"}
        tabIndex={-1}
        className="rf-slideover rf-no-select rf-side-scroll"
        style={{ width, background, borderRight: `1px solid ${borderColor}` }}
      >
        {children}
      </aside>
    </>
  );
}
