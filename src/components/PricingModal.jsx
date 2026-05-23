import { useState } from "react";
import { X, Crown, Check, Gift, ArrowRight } from "lucide-react";
import { FREE_UPLOAD_LIMIT, TRIAL_DAYS, PRICING } from "../config/constants";
import * as Dialog from "@radix-ui/react-dialog";
import PulsatingButton from "./PulsatingButton";
import { marketingThemeVars } from "../utils/marketingTheme";

const OVERLAY = {
  position: "fixed", inset: 0,
  background: "rgba(31, 24, 18, 0.55)",
  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  zIndex: 1000,
};

// `t` (active theme tokens) is spread as CSS custom properties on the
// Dialog.Content via marketingThemeVars, so the modal re-skins itself
// to the active theme while keeping editorial typography.
//
// Spacing + sizing intentionally compact so the full modal — header,
// billing toggle, both plan cards, CTAs, and trust strip — fits inside
// a ~700px viewport without scrolling. The maxHeight cap + overflowY
// auto stay as safety for ultra-short viewports.
export default function PricingModal({ onClose, onSelectPlan, hasUsedTrial, t }) {
  const [billing, setBilling] = useState("annual");

  return (
    <Dialog.Root open onOpenChange={o => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay style={OVERLAY} />
        <Dialog.Content
          className="tmt-marketing"
          style={{
            ...marketingThemeVars(t),
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            background: "var(--tmt-paper-card)",
            border: "1px solid var(--tmt-rule)",
            borderRadius: 26,
            maxWidth: 720, width: "calc(100% - 48px)",
            // Fixed 720px target height. The cap (`min(720, viewport - 32px)`)
            // means on viewports < 752px the modal shrinks gracefully and
            // overflow-y: auto kicks in. On viewports ≥ 752px it sits at the
            // 720px target with breathing room top + bottom.
            height: "min(720px, calc(100vh - 32px))",
            overflowY: "auto",
            boxShadow: "0 32px 100px -20px rgba(31, 24, 18, 0.45), 0 6px 16px -8px rgba(31, 24, 18, 0.2)",
            zIndex: 1001,
          }}
        >
          {/* Header */}
          <div style={{ padding: "26px 36px 18px", borderBottom: "1px solid var(--tmt-rule)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ marginBottom: 8 }}>
                <span className="tmt-eyebrow lead">Pricing</span>
              </div>
              <Dialog.Title className="tmt-display" style={{ fontSize: 30, fontWeight: 380, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.1 }}>
                Start free. <em>Upgrade</em> only if it earns it.
              </Dialog.Title>
              <p style={{ fontFamily: "var(--tmt-serif-body)", fontSize: 15, color: "var(--tmt-ink-soft)", margin: "10px 0 0", lineHeight: 1.55 }}>
                Unlimited documents, every accessibility tool, one reader built for you.
              </p>
            </div>
            <Dialog.Close asChild>
              <button aria-label="Close" style={{ width: 34, height: 34, borderRadius: 8, border: "none", background: "transparent", color: "var(--tmt-ink-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <X size={16} strokeWidth={2} />
              </button>
            </Dialog.Close>
          </div>

          {/* Billing toggle */}
          <div style={{ padding: "20px 36px 0", display: "flex", justifyContent: "center" }}>
            <div style={{ display: "inline-flex", background: "var(--tmt-paper-deep)", borderRadius: 999, padding: 4, gap: 2 }}>
              {[{ key: "monthly", label: "Monthly" }, { key: "annual", label: "Annual", badge: "Save 25%" }].map(b => (
                <button
                  key={b.key}
                  onClick={() => setBilling(b.key)}
                  className="rf-static"
                  style={{
                    padding: "8px 20px", borderRadius: 999, border: "none", cursor: "pointer",
                    background: billing === b.key ? "var(--tmt-ink)" : "transparent",
                    color:      billing === b.key ? "var(--tmt-paper)" : "var(--tmt-ink-soft)",
                    fontFamily: "var(--tmt-mono)", fontSize: 12, fontWeight: 500,
                    textTransform: "uppercase", letterSpacing: "0.12em",
                    display: "flex", alignItems: "center", gap: 8,
                    transition: "background 0.2s, color 0.2s",
                    boxShadow: "none",
                  }}
                >
                  {b.label}
                  {b.badge && (
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      color: billing === b.key ? "var(--tmt-sand)" : "var(--tmt-sage)",
                      letterSpacing: "0.06em",
                    }}>
                      {b.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Plan cards */}
          <div style={{ padding: "18px 36px 22px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* FREE — lifted surface so the card stays visible on every theme
                (var(--tmt-paper) would equal page-bg on dark themes). */}
            <div style={{
              borderRadius: 16, padding: "20px 22px 20px",
              border: "1px solid var(--tmt-rule)",
              background: "var(--tmt-paper-card)",
              display: "flex", flexDirection: "column",
            }}>
              <span className="tmt-label" style={{ marginBottom: 10 }}>Free</span>
              <div className="tmt-display" style={{ fontSize: 23, fontWeight: 400, letterSpacing: "-0.015em", marginBottom: 12, lineHeight: 1.15 }}>
                A reader's first chapter
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 16 }}>
                <span className="tmt-display" style={{ fontSize: 40, fontWeight: 320, letterSpacing: "-0.03em", lineHeight: 1 }}>$0</span>
                <span style={{ fontFamily: "var(--tmt-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--tmt-ink-muted)" }}>forever</span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                {[`${FREE_UPLOAD_LIMIT} document uploads / month`, "7-day private storage", "4 themes + all 6 fonts", "PDF, EPUB, DOCX & all formats"].map((f, i) => (
                  <li key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", fontFamily: "var(--tmt-serif-body)", fontSize: 14, color: "var(--tmt-ink-soft)", lineHeight: 1.45 }}>
                    <span style={{ color: "var(--tmt-terra)", fontSize: 11, transform: "translateY(-1px)" }}>✦</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={onClose}
                className="tmt-btn ghost"
                style={{ width: "100%", justifyContent: "center", marginTop: 12, padding: "11px 20px" }}
              >
                Stay on Free
              </button>
            </div>

            {/* PRO — uses the theme accent as background so the "premium" card
                is recognizably branded on every theme (terracotta on warm,
                blue on midnight, teal on forest, etc.). Text + icons stay
                white for legibility across all accent colors. */}
            <div style={{
              position: "relative",
              borderRadius: 16, padding: "20px 22px 20px",
              background: "var(--tmt-terra)",
              color: "#fff",
              display: "flex", flexDirection: "column",
              boxShadow: "0 18px 48px -22px rgba(31, 24, 18, 0.55)",
            }}>
              <div style={{
                position: "absolute", top: -1, right: 20,
                background: "var(--tmt-ink)", color: "var(--tmt-paper)",
                fontFamily: "var(--tmt-mono)", fontSize: 10, fontWeight: 500,
                padding: "5px 12px", borderRadius: "0 0 10px 10px",
                letterSpacing: "0.14em", textTransform: "uppercase",
              }}>
                Recommended
              </div>
              <span className="tmt-label" style={{ color: "rgba(255,255,255,0.85)", marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Crown size={11} /> Pro &middot; most readers
              </span>
              <div className="tmt-display" style={{ fontSize: 23, fontWeight: 400, letterSpacing: "-0.015em", marginBottom: 12, color: "#fff", lineHeight: 1.15 }}>
                Everything, properly tailored
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                <span className="tmt-display" style={{ fontSize: 40, fontWeight: 320, letterSpacing: "-0.03em", lineHeight: 1, color: "#fff" }}>{PRICING[billing].display}</span>
                <span style={{ fontFamily: "var(--tmt-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(255,255,255,0.78)" }}>/ {PRICING[billing].unit}</span>
              </div>
              <div style={{ minHeight: 18, display: "flex", alignItems: "center", marginBottom: 12 }}>
                {billing === "annual" && PRICING.annual.effectiveMonthly && (
                  <p style={{ fontFamily: "var(--tmt-mono)", fontSize: 10.5, color: "rgba(255,255,255,0.78)", textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>
                    {PRICING.annual.effectiveMonthly} — save ${PRICING.monthly.amount * 12 - PRICING.annual.amount}/yr
                  </p>
                )}
              </div>
              {!hasUsedTrial && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 11px", borderRadius: 9, background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.28)", marginBottom: 12, alignSelf: "flex-start" }}>
                  <Gift size={12} style={{ color: "#fff" }} />
                  <span style={{ fontFamily: "var(--tmt-mono)", fontSize: 10.5, fontWeight: 500, color: "#fff", textTransform: "uppercase", letterSpacing: "0.12em" }}>{TRIAL_DAYS}-day free trial included</span>
                </div>
              )}
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                {["Unlimited document uploads", "30-day document storage", "All 10 themes & color palettes", "Custom avatar uploads", "50 MB max file size"].map((f, i) => (
                  <li key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", fontFamily: "var(--tmt-serif-body)", fontSize: 14, color: "rgba(255, 255, 255, 0.92)", lineHeight: 1.45 }}>
                    <span style={{ color: "#fff", fontSize: 11, transform: "translateY(-1px)" }}>✦</span>
                    {f}
                  </li>
                ))}
              </ul>
              <PulsatingButton
                variant="ripple"
                pulseColor="rgba(255, 255, 255, 0.45)"
                duration="1.6s"
                distance="10px"
                onClick={() => onSelectPlan(billing)}
                className="rf-btn-solid tmt-btn"
                style={{
                  // Button bg is hardcoded white so text must also be
                  // hardcoded dark — var(--tmt-ink) flips to light on dark
                  // themes and becomes unreadable on the white surface.
                  width: "100%", justifyContent: "center", marginTop: 12,
                  background: "#fff", color: "#1F1812",
                  padding: "11px 20px",
                }}
              >
                {hasUsedTrial ? "Subscribe now" : `Start ${TRIAL_DAYS}-day free trial`}<ArrowRight size={13} />
              </PulsatingButton>
            </div>
          </div>

          {/* Footer trust strip */}
          <div style={{ padding: "12px 36px 14px", borderTop: "1px solid var(--tmt-rule)", display: "flex", alignItems: "center", justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
            {["Cancel anytime", "Secure checkout via Stripe", "No hidden fees"].map((s, i) => (
              <span key={i} style={{ fontFamily: "var(--tmt-mono)", fontSize: 10.5, color: "var(--tmt-ink-muted)", textTransform: "uppercase", letterSpacing: "0.14em", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Check size={11} style={{ color: "var(--tmt-sage)" }} /> {s}
              </span>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
