import { Lock } from "lucide-react";
import { formatDate } from "../utils/formatDate";

// Persistent top-of-app banner shown to users whose email is within the
// 6-month post-deletion lockout window. They can sign in / sign up but
// can't use Free-tier features — only path forward is subscribing. There's
// no dismiss for this one (unlike PendingDeletionBanner) — the lockout is
// a hard gate, not a heads-up.

export default function PostDeletionLockoutBanner({ lockoutUntil, onSubscribe }) {
  if (!lockoutUntil) return null;
  const SANS = "'DM Sans', sans-serif";
  const MONO = "'IBM Plex Mono', ui-monospace, monospace";
  return (
    <div
      role="alert"
      style={{
        position: "sticky", top: 0, left: 0, right: 0, zIndex: 1900,
        background: "#7C3AED", color: "#fff",
        padding: "12px 18px",
        display: "flex", alignItems: "center", gap: 14,
        fontFamily: SANS, fontSize: 13, fontWeight: 550,
        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
      }}
    >
      <Lock size={16} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, lineHeight: 1.35 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.8 }}>
          Account locked
        </span>
        <span>
          Free-tier benefits are paused until <strong>{formatDate(lockoutUntil)}</strong> because this account was previously deleted.
        </span>
      </div>
      <button
        onClick={onSubscribe}
        style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#fff", color: "#5B21B6", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: SANS, flexShrink: 0, letterSpacing: "0.01em" }}
      >
        Subscribe
      </button>
    </div>
  );
}
