import { useState, useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { supabase } from "../utils/supabase";
import { formatDate } from "../utils/formatDate";
import { useToast } from "./Toast";

// Persistent top-of-app banner shown to users with a pending account
// deletion. Shows a live countdown to the effective date and a one-click
// Reactivate button. Dismiss (×) hides for the session only — comes back
// on next page load. Reactivation itself clears the deletion timestamps
// in `profiles` and refreshes the auth state.

function formatRelative(target) {
  const now = Date.now();
  const ms = target - now;
  if (ms <= 0) return "today";
  const days = Math.floor(ms / 86400000);
  if (days >= 2) return `in ${days} days`;
  if (days === 1) return "in 1 day";
  const hours = Math.floor(ms / 3600000);
  if (hours >= 2) return `in ${hours} hours`;
  if (hours === 1) return "in 1 hour";
  const minutes = Math.max(1, Math.floor(ms / 60000));
  return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export default function PendingDeletionBanner({ user, effectiveAt, onReactivated, t }) {
  const { showToast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  // Re-render once a minute so the countdown stays fresh.
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  if (dismissed || !effectiveAt) return null;

  const handleReactivate = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ deletion_requested_at: null, deletion_effective_at: null })
        .eq("id", user.id);
      if (error) throw error;
      // Phase 9 hook: also un-cancel the Stripe subscription
      // (`cancel_at_period_end: false`) here for Pro users.
      onReactivated?.();
      showToast("Account reactivated. Welcome back.", "success");
      setConfirming(false);
    } catch (e) {
      showToast(`Couldn't reactivate: ${e.message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const SANS = "'DM Sans', sans-serif";
  const MONO = "'IBM Plex Mono', ui-monospace, monospace";
  return (
    <div
      role="alert"
      style={{
        position: "sticky", top: 0, left: 0, right: 0, zIndex: 1900,
        background: "#F59E0B", color: "#1A1500",
        padding: "12px 18px",
        display: "flex", alignItems: "center", gap: 14,
        fontFamily: SANS, fontSize: 13, fontWeight: 550,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}
    >
      <AlertTriangle size={16} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, lineHeight: 1.35 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.78 }}>
          Deletion pending
        </span>
        <span>
          Your account will be deleted on <strong>{formatDate(effectiveAt)}</strong> · {formatRelative(effectiveAt)}.
        </span>
      </div>
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#1A1500", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 620, fontFamily: SANS, letterSpacing: "0.01em", flexShrink: 0 }}
        >
          Reactivate
        </button>
      ) : (
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.3)", background: "transparent", color: "#1A1500", cursor: busy ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 560, fontFamily: SANS }}
          >
            Keep deletion
          </button>
          <button
            onClick={handleReactivate}
            disabled={busy}
            style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#1A1500", color: "#fff", cursor: busy ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 620, fontFamily: SANS }}
          >
            {busy ? "…" : "Yes, reactivate"}
          </button>
        </div>
      )}
      <button
        aria-label="Dismiss for this session"
        onClick={() => setDismissed(true)}
        style={{ background: "transparent", border: "none", cursor: "pointer", color: "#1A1500", padding: 4, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.55, borderRadius: 6 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
