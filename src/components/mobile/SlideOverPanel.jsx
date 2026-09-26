import { useEffect, useRef } from "react";

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

  // Standard dialog focus pattern: on open, remember what had focus and move
  // focus into the panel; on close (or unmount), give it back — otherwise
  // keyboard/screen-reader users lose their place when the panel toggle
  // button that opened this disappears behind the backdrop.
  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    panelRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onOpenChange(false); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
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
