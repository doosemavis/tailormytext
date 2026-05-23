import { useState } from "react";
import { X, Crown, Calendar, CreditCard, TrendingUp } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { TRIAL_DAYS, PRICING } from "../config/constants";
import { useToast } from "./Toast";
import { Tip } from "./Primitives";
import PulsatingButton from "./PulsatingButton";
import { supabase } from "../utils/supabase";
import { marketingThemeVars } from "../utils/marketingTheme";

const OVERLAY = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", zIndex: 1010 };

// Format an absolute date as a friendly "Month D, YYYY" string.
function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function SubscriptionModal({ open, onOpenChange, sub, onShowPricing, t }) {
  const { showToast } = useToast();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  const isFree = !sub.isPro;
  const isTrial = sub.isTrial;
  const isPro = sub.isPro && !sub.isTrial;

  // billingCycle can be null (admin bypass). Display logic treats null as
  // "monthly", so the upgrade button must use the same convention.
  const isAnnual = sub.billingCycle === "annual";
  const isMonthly = !isAnnual;
  const cyclePricing = PRICING[sub.billingCycle] ?? PRICING.monthly;

  const trialEnd = sub.trialDaysLeft != null && sub.isTrial
    ? Date.now() + sub.trialDaysLeft * 86400000
    : null;
  // current_period_end is set by the webhook from Stripe; null for admin bypass.
  const proPeriodEnd = isPro ? sub.currentPeriodEnd : null;

  const handleCancelTrial = async () => {
    setBusy(true);
    try {
      await sub.cancelSubscription();
      showToast("Trial cancelled. You're back on the free plan.", "info");
      setConfirmingCancel(false);
      onOpenChange(false);
    } catch (err) {
      showToast(err.message || "Cancellation failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleCancelPro = async () => {
    setBusy(true);
    try {
      await sub.cancelSubscription();
      showToast("Subscription cancelled. You'll keep Pro until the end of your billing period.", "info");
      setConfirmingCancel(false);
      onOpenChange(false);
    } catch (err) {
      showToast(err.message || "Cancellation failed", "error");
    } finally {
      setBusy(false);
    }
  };

  // Swaps the Stripe subscription's price from monthly to annual. Stripe
  // prorates automatically; the webhook updates the row + UI within ~1s.
  const handleUpgradeToAnnual = async () => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-subscription-plan`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ billingCycle: "annual" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upgrade failed");
      showToast("Switched to annual billing. Welcome to the long game.", "success");
      onOpenChange(false);
    } catch (err) {
      showToast(err.message || "Upgrade failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={OVERLAY} />
        <Dialog.Content
          className="tmt-marketing"
          style={{ ...marketingThemeVars(t), position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "var(--tmt-paper)", borderRadius: 22, maxWidth: 440, width: "calc(100% - 48px)", padding: 32, boxShadow: "0 28px 70px rgba(0,0,0,0.28)", zIndex: 1011, fontFamily: "var(--tmt-sans)" }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22, gap: 12 }}>
            <div style={{ flex: 1 }}>
              <span className="tmt-label" style={{ display: "block", marginBottom: 8 }}>Account · Subscription</span>
              <Dialog.Title className="tmt-display" style={{ fontSize: 28, fontWeight: 380, color: "var(--tmt-ink)", margin: 0, letterSpacing: "-0.015em", lineHeight: 1.15 }}>
                Your plan
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button aria-label="Close" style={{ width: 34, height: 34, borderRadius: 8, border: "none", background: "transparent", color: t.icon, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <X size={16} strokeWidth={2} />
              </button>
            </Dialog.Close>
          </div>

          {/* Free user */}
          {isFree && (
            <>
              <div style={{ padding: 18, borderRadius: 14, background: "var(--tmt-paper-card)", border: `1px solid ${t.borderSoft}`, marginBottom: 18 }}>
                <span style={{ fontFamily: "var(--tmt-mono)", fontSize: 10, fontWeight: 600, color: "var(--tmt-ink-muted)", letterSpacing: "0.14em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Current plan</span>
                <p className="tmt-display" style={{ fontSize: 22, fontWeight: 380, color: "var(--tmt-ink)", margin: 0, letterSpacing: "-0.01em" }}>Free</p>
              </div>
              <p style={{ fontFamily: "var(--tmt-serif-body)", fontSize: 15, color: "var(--tmt-ink-soft)", lineHeight: 1.6, margin: "0 0 18px" }}>
                Unlock unlimited uploads, every theme, and the full feature set with TailorMyText Pro. Subscribe for {PRICING.monthly.label} or {PRICING.annual.label} and save 25%.
              </p>
              <button onClick={() => { onOpenChange(false); onShowPricing(); }} className="rf-btn-solid tmt-btn" style={{ width: "100%", padding: "12px 24px", borderRadius: 12, border: "none", background: t.accent, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 670, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Crown size={15} /> See Pro plans
              </button>
            </>
          )}

          {/* Trial user */}
          {isTrial && (
            <>
              <div style={{ padding: 18, borderRadius: 14, background: `${t.accent}14`, border: `1px solid ${t.accent}40`, marginBottom: 18 }}>
                <span style={{ fontFamily: "var(--tmt-mono)", fontSize: 10, fontWeight: 700, color: t.accent, letterSpacing: "0.14em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Current plan · Trial</span>
                <p className="tmt-display" style={{ fontSize: 22, fontWeight: 380, color: "var(--tmt-ink)", margin: "0 0 14px", letterSpacing: "-0.01em" }}>{TRIAL_DAYS}-day Pro trial</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--tmt-ink-soft)", marginBottom: 6 }}>
                  <Calendar size={13} style={{ color: t.icon }} />
                  Trial ends {formatDate(trialEnd)} · {sub.trialDaysLeft} day{sub.trialDaysLeft === 1 ? "" : "s"} left
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--tmt-ink-soft)" }}>
                  <CreditCard size={13} style={{ color: t.icon }} />
                  After trial: {cyclePricing.label}{sub.billingCycle === "annual" && cyclePricing.effectiveMonthly ? ` (${cyclePricing.effectiveMonthly} effective)` : ""}
                </div>
              </div>
              {!confirmingCancel ? (
                <div style={{ display: "flex", gap: 8 }}>
                  {isMonthly && (
                    <Tip label="25% off!" t={t} side="top">
                      <PulsatingButton
                        variant="ripple"
                        pulseColor={t.accent}
                        duration="1.6s"
                        distance="10px"
                        onClick={handleUpgradeToAnnual}
                        disabled={busy}
                        className="rf-btn-solid"
                        style={{ flex: 1, minWidth: 0, padding: "11px 16px", borderRadius: 12, border: "none", background: t.accent, color: "#fff", cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 660, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: busy ? 0.7 : 1 }}
                      >
                        <TrendingUp size={14} /> {busy ? "Switching…" : "Upgrade to Annual"}
                      </PulsatingButton>
                    </Tip>
                  )}
                  <button onClick={() => setConfirmingCancel(true)} style={{ flex: 1, minWidth: 0, padding: "11px 16px", borderRadius: 12, border: `1px solid ${t.border}`, background: "transparent", color: t.fg, cursor: "pointer", fontSize: 13, fontWeight: 580, fontFamily: "'DM Sans', sans-serif" }}>
                    Cancel trial
                  </button>
                </div>
              ) : (
                <div style={{ padding: 14, borderRadius: 12, background: "#E25C5C12", border: "1px solid #E25C5C33", marginBottom: 0 }}>
                  <p style={{ fontSize: 13, color: t.fg, margin: "0 0 12px", lineHeight: 1.5 }}>
                    Cancel your trial? You'll lose Pro features and return to the free plan immediately.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setConfirmingCancel(false)} style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: `1px solid ${t.border}`, background: "transparent", color: t.fg, cursor: "pointer", fontSize: 13, fontWeight: 550 }}>Keep trial</button>
                    <button onClick={handleCancelTrial} disabled={busy} style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: "none", background: "#E25C5C", color: "#fff", cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: busy ? 0.7 : 1 }}>{busy ? "Cancelling…" : "Cancel trial"}</button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Paid Pro user */}
          {isPro && (
            <>
              <div style={{ padding: 18, borderRadius: 14, background: `${t.accent}14`, border: `1px solid ${t.accent}40`, marginBottom: 18 }}>
                <span style={{ fontFamily: "var(--tmt-mono)", fontSize: 10, fontWeight: 700, color: t.accent, letterSpacing: "0.14em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Current plan · Pro</span>
                <p className="tmt-display" style={{ fontSize: 22, fontWeight: 380, color: "var(--tmt-ink)", margin: "0 0 14px", letterSpacing: "-0.01em" }}>
                  {sub.hasStripeHistory
                    ? `${sub.billingCycle === "annual" ? "Annual" : "Monthly"} · ${cyclePricing.label}`
                    : "Admin bypass"}
                </p>
                {sub.hasStripeHistory && proPeriodEnd && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--tmt-ink-soft)", marginBottom: 4 }}>
                    <CreditCard size={13} style={{ color: t.icon }} />
                    Next billing: {cyclePricing.display} on {formatDate(proPeriodEnd)}
                  </div>
                )}
              </div>
              {!sub.hasStripeHistory ? (
                <div style={{ padding: 14, borderRadius: 12, background: t.surface, fontSize: 13, color: t.fgSoft, lineHeight: 1.55 }}>
                  Admin bypass is{" "}
                  <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, background: "#10B98118", color: "#10B981", border: "1px solid #10B98144", fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>active</span>
                  {" "}— there's no real Stripe subscription to manage.{" "}
                  <a
                    href="#start-test-subscription"
                    onClick={(e) => { e.preventDefault(); onOpenChange(false); onShowPricing(); }}
                    style={{ color: t.accent, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", textDecoration: "underline", cursor: "pointer" }}
                  >
                    Start a test subscription
                  </a>{" "}to try the upgrade & cancel flows.
                </div>
              ) : !confirmingCancel ? (
                <div style={{ display: "flex", gap: 8 }}>
                  {isMonthly && (
                    <Tip label="25% off!" t={t} side="top">
                      <PulsatingButton
                        variant="ripple"
                        pulseColor={t.accent}
                        duration="1.6s"
                        distance="10px"
                        onClick={handleUpgradeToAnnual}
                        disabled={busy}
                        className="rf-btn-solid"
                        style={{ flex: 1, minWidth: 0, padding: "11px 16px", borderRadius: 12, border: "none", background: t.accent, color: "#fff", cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 660, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: busy ? 0.7 : 1 }}
                      >
                        <TrendingUp size={14} /> {busy ? "Switching…" : "Upgrade to Annual"}
                      </PulsatingButton>
                    </Tip>
                  )}
                  <button onClick={() => setConfirmingCancel(true)} style={{ flex: 1, minWidth: 0, padding: "11px 16px", borderRadius: 12, border: `1px solid ${t.border}`, background: "transparent", color: t.fg, cursor: "pointer", fontSize: 13, fontWeight: 580, fontFamily: "'DM Sans', sans-serif" }}>
                    Cancel subscription
                  </button>
                </div>
              ) : (
                <div style={{ padding: 14, borderRadius: 12, background: "#E25C5C12", border: "1px solid #E25C5C33" }}>
                  <p style={{ fontSize: 13, color: t.fg, margin: "0 0 12px", lineHeight: 1.5 }}>
                    Cancel your subscription? You'll keep Pro features until {formatDate(proPeriodEnd)}, then return to the free plan. You won't be charged again.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setConfirmingCancel(false)} style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: `1px solid ${t.border}`, background: "transparent", color: t.fg, cursor: "pointer", fontSize: 13, fontWeight: 550 }}>Keep subscription</button>
                    <button onClick={handleCancelPro} disabled={busy} style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: "none", background: "#E25C5C", color: "#fff", cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: busy ? 0.7 : 1 }}>{busy ? "Cancelling…" : "Cancel subscription"}</button>
                  </div>
                </div>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
