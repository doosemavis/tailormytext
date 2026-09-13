import { createContext, useCallback, useContext, useState } from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { X, AlertTriangle, CheckCircle2, Info } from "lucide-react";

// Transient toast/banner backed by @radix-ui/react-toast — same primitive
// family as the rest of the Radix surface in this app. Radix handles a11y
// (live regions, polite/assertive modes), hover-to-pause auto-dismiss,
// keyboard escape, and swipe gestures on touch devices.
//
// Single-slot: a new showToast() replaces the in-flight toast (the changing
// `key` on Toast.Root drives the unmount-then-mount + animation).
//
// Usage:
//   const { showToast } = useToast();
//   showToast("Couldn't save document", "error");
//   showToast("Avatar updated", "success");
//   showToast("Did you know…", "info");

const ToastContext = createContext(null);
const DEFAULT_DURATION_MS = 5000;

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { id, message, type, duration }

  const showToast = useCallback((message, type = "error", duration = DEFAULT_DURATION_MS) => {
    setToast({ id: Date.now() + Math.random(), message, type, duration });
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      <RadixToast.Provider swipeDirection="up" duration={DEFAULT_DURATION_MS}>
        {children}
        {toast && (
          <ToastView
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={dismiss}
          />
        )}
        <RadixToast.Viewport
          style={{
            position: "fixed",
            top: 24,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            width: 480,
            maxWidth: "calc(100vw - 32px)",
            margin: 0,
            padding: 0,
            listStyle: "none",
            outline: "none",
            zIndex: 2000,
          }}
        />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside a <ToastProvider>");
  return ctx;
}

const TYPE_STYLES = {
  error:   { accent: "#E25C5C", icon: AlertTriangle, label: "Error" },
  success: { accent: "#22C55E", icon: CheckCircle2, label: "Success" },
  info:    { accent: "#3B82F6", icon: Info, label: "Note" },
};

function ToastView({ message, type, duration, onClose }) {
  const { accent, icon: Icon, label } = TYPE_STYLES[type] ?? TYPE_STYLES.error;
  return (
    <RadixToast.Root
      className="rf-toast"
      duration={duration}
      onOpenChange={(open) => { if (!open) onClose(); }}
      style={{
        background: "#1A1A1A",
        color: "#fff",
        borderLeft: `4px solid ${accent}`,
        borderRadius: 12,
        boxShadow: "0 18px 44px rgba(0,0,0,0.36)",
        padding: "14px 16px 14px 18px",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 14,
        lineHeight: 1.4,
      }}
    >
      <Icon size={18} style={{ color: accent, flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10, fontWeight: 700, color: accent, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          {label}
        </span>
        <RadixToast.Description style={{ margin: 0 }}>{message}</RadixToast.Description>
      </div>
      <RadixToast.Close
        aria-label="Dismiss"
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: "rgba(255,255,255,0.7)", padding: 4, borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, marginTop: -2,
        }}
      >
        <X size={16} />
      </RadixToast.Close>
    </RadixToast.Root>
  );
}
