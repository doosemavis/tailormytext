import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { TRIAL_DAYS } from "../config/constants";
import { supabase } from "../utils/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "./Toast";
import { marketingThemeVars } from "../utils/marketingTheme";
import { formatDate } from "../utils/formatDate";
import { MODAL_OVERLAY_STYLE } from "./Primitives";


const FREE_GRACE_DAYS = 7;
const CONFIRM_PHRASE = "DELETE";

// Compute when the actual hard delete happens, based on the user's plan.
//  - Free: NOW() + 7 days (oops-recovery window)
//  - Trial: trial's natural end (the user gets to finish evaluating)
//  - Pro: end of current paid period (Phase 9 will replace the placeholder
//    with Stripe's real current_period_end via webhook-populated state)
function effectiveDeletionDate(sub) {
  const now = Date.now();
  if (sub.isTrial) {
    return now + sub.trialDaysLeft * 86400000;
  }
  if (sub.isPro) {
    // Placeholder until Phase 9 wires Stripe webhooks. One billing cycle from now.
    const days = sub.billingCycle === "annual" ? 365 : 30;
    return now + days * 86400000;
  }
  return now + FREE_GRACE_DAYS * 86400000;
}

export default function DeleteAccountModal({ open, onOpenChange, sub, t }) {
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const effectiveDate = effectiveDeletionDate(sub);
  const canSubmit = confirmText === CONFIRM_PHRASE && !busy;

  // Tier-specific phrasing for what's about to happen.
  const graceDescription = sub.isTrial
    ? `Your trial continues until ${formatDate(effectiveDate)}. After that, your account and all your data will be permanently deleted.`
    : sub.isPro
    ? `Your Pro access continues until ${formatDate(effectiveDate)} (your current billing period). You won't be charged again. After that, your account and all your data will be permanently deleted.`
    : `You have ${FREE_GRACE_DAYS} days to change your mind. On ${formatDate(effectiveDate)}, your account and all your data will be permanently deleted.`;

  const handleDelete = async () => {
    if (!canSubmit || !user) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          deletion_requested_at: new Date().toISOString(),
          deletion_effective_at: new Date(effectiveDate).toISOString(),
        })
        .eq("id", user.id);
      if (error) throw error;
      // Sign the user out so they hit the reactivation flow on next visit.
      await signOut();
      onOpenChange(false);
      showToast(`Account deletion scheduled for ${formatDate(effectiveDate)}. Sign in before then to cancel.`, "info", 8000);
    } catch (e) {
      showToast(`Couldn't schedule deletion: ${e.message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) setConfirmText(""); onOpenChange(v); }}>
      <Dialog.Portal>
        <Dialog.Overlay style={MODAL_OVERLAY_STYLE} />
        <Dialog.Content
          className="tmt-marketing"
          style={{ ...marketingThemeVars(t), position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "var(--tmt-paper)", borderRadius: 22, maxWidth: 460, width: "calc(100% - 48px)", padding: 32, boxShadow: "0 28px 70px rgba(0,0,0,0.28)", zIndex: 1011, fontFamily: "var(--tmt-sans)" }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22, gap: 12 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontFamily: "var(--tmt-mono)", fontSize: 10.5, fontWeight: 700, color: "#E25C5C", letterSpacing: "0.18em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <AlertTriangle size={13} strokeWidth={2.2} /> Danger zone
              </span>
              <Dialog.Title className="tmt-display" style={{ fontSize: 28, fontWeight: 380, color: "var(--tmt-ink)", margin: 0, letterSpacing: "-0.015em", lineHeight: 1.15 }}>
                Delete your account
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button aria-label="Close" style={{ width: 34, height: 34, borderRadius: 8, border: "none", background: "transparent", color: t.icon, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <X size={16} strokeWidth={2} />
              </button>
            </Dialog.Close>
          </div>

          <div style={{ padding: 16, borderRadius: 12, background: "#E25C5C12", border: "1px solid #E25C5C33", marginBottom: 18 }}>
            <p style={{ fontSize: 13.5, color: "var(--tmt-ink)", margin: 0, lineHeight: 1.55, fontWeight: 580 }}>
              This will permanently delete your account, your saved documents, and all settings.
            </p>
          </div>

          <p style={{ fontFamily: "var(--tmt-serif-body)", fontSize: 15, color: "var(--tmt-ink-soft)", lineHeight: 1.6, margin: "0 0 20px" }}>
            {graceDescription}
          </p>

          <p style={{ fontSize: 12, color: "var(--tmt-ink-muted)", lineHeight: 1.5, margin: "0 0 8px", fontFamily: "var(--tmt-mono)", letterSpacing: "0.04em" }}>
            Type <strong style={{ color: "var(--tmt-ink)" }}>{CONFIRM_PHRASE}</strong> to confirm.
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            aria-label={`Type ${CONFIRM_PHRASE} to confirm account deletion`}
            autoComplete="off"
            spellCheck={false}
            style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `1px solid ${confirmText === CONFIRM_PHRASE ? "#E25C5C" : t.border}`, background: "var(--tmt-paper-card)", color: "var(--tmt-ink)", fontSize: 14, fontFamily: "var(--tmt-mono)", letterSpacing: "0.08em", boxSizing: "border-box", marginBottom: 20, transition: "border-color 0.15s" }}
          />

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => onOpenChange(false)} disabled={busy} className="tmt-btn ghost" style={{ flex: 1, padding: "12px 20px", borderRadius: 12, border: `1px solid ${t.border}`, background: "var(--tmt-paper-card)", color: "var(--tmt-ink)", cursor: busy ? "not-allowed" : "pointer", fontSize: 13.5, fontWeight: 560, fontFamily: "var(--tmt-sans)" }}>
              Cancel
            </button>
            <button onClick={handleDelete} disabled={!canSubmit} className="rf-btn-solid" style={{ flex: 1, padding: "12px 20px", borderRadius: 12, border: "none", background: canSubmit ? "#E25C5C" : t.border, color: canSubmit ? "#fff" : t.fgSoft, cursor: canSubmit ? "pointer" : "not-allowed", fontSize: 13.5, fontWeight: 640, fontFamily: "var(--tmt-sans)", transition: "background 0.15s, color 0.15s" }}>
              {busy ? "Scheduling…" : "Delete my account"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
