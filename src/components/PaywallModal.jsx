import { useEffect } from "react";
import { Lock, Crown } from "lucide-react";
import { FREE_UPLOAD_LIMIT } from "../config/constants";
import * as Dialog from "@radix-ui/react-dialog";
import PulsatingButton from "./PulsatingButton";
import { track } from "../utils/track";
import { marketingThemeVars } from "../utils/marketingTheme";

const OVERLAY = {
  position: "fixed", inset: 0,
  background: "rgba(31, 24, 18, 0.55)",
  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  zIndex: 1000,
};

// `uploadsUsed` accepted for API compatibility but unused — copy uses
// FREE_UPLOAD_LIMIT directly. `t` is spread as CSS custom properties so
// the modal re-skins to the active theme.
export default function PaywallModal({ uploadsUsed: _uploadsUsed, onUpgrade, onClose, t }) {
  useEffect(() => { track("paywall_view"); }, []);

  return (
    <Dialog.Root open onOpenChange={o => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay style={OVERLAY} />
        <Dialog.Content
          aria-describedby={undefined}
          className="tmt-marketing"
          style={{
            ...marketingThemeVars(t),
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            background: "var(--tmt-paper-card)",
            border: "1px solid var(--tmt-rule)",
            borderRadius: 24,
            maxWidth: 440, width: "calc(100% - 48px)",
            padding: "44px 36px 32px",
            textAlign: "center",
            boxShadow: "0 32px 80px -20px rgba(31, 24, 18, 0.45), 0 6px 16px -8px rgba(31, 24, 18, 0.2)",
            zIndex: 1001,
          }}
        >
          <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(176, 81, 46, 0.15)", border: "1px solid rgba(176, 81, 46, 0.3)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 22 }}>
            <Lock size={28} style={{ color: "var(--tmt-terra)" }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <span className="tmt-eyebrow lead">Free limit reached</span>
          </div>
          <Dialog.Title className="tmt-display" style={{ fontSize: 28, fontWeight: 380, letterSpacing: "-0.02em", margin: "0 0 14px", lineHeight: 1.1 }}>
            You've read your <em>first {FREE_UPLOAD_LIMIT}</em>.
          </Dialog.Title>
          <p style={{ fontFamily: "var(--tmt-serif-body)", fontSize: 16, color: "var(--tmt-ink-soft)", margin: "0 0 8px", lineHeight: 1.55 }}>
            That was your monthly free quota of {FREE_UPLOAD_LIMIT} documents.
          </p>
          <p style={{ fontFamily: "var(--tmt-serif-body)", fontSize: 15, color: "var(--tmt-ink-muted)", margin: "0 0 28px", lineHeight: 1.55, fontStyle: "italic" }}>
            Upgrade to Pro for unlimited uploads — from $3.75&thinsp;/&thinsp;mo on the annual plan.
          </p>
          <PulsatingButton
            variant="ripple"
            pulseColor="rgba(176, 81, 46, 0.55)"
            duration="1.6s"
            distance="10px"
            onClick={onUpgrade}
            className="rf-btn-solid tmt-btn"
            style={{ width: "100%", justifyContent: "center", marginBottom: 12 }}
          >
            <Crown size={15} /> See plans &amp; pricing
          </PulsatingButton>
          <Dialog.Close asChild>
            <button className="tmt-btn ghost" style={{ width: "100%", justifyContent: "center" }}>
              Maybe later
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
