import { useEffect, useState } from "react";
import { X, Lock, BookOpen, AlertCircle } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import BookLoader from "./BookLoader";
import { supabase } from "../utils/supabase";
import { marketingThemeVars } from "../utils/marketingTheme";

const OVERLAY = {
  position: "fixed", inset: 0,
  background: "rgba(31, 24, 18, 0.55)",
  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  zIndex: 1100,
};

// Thin "redirecting to Stripe" loader. The actual card form, payment method
// pickers, 3DS handling, etc. all live on Stripe's hosted Checkout page.
// On mount we ask the create-checkout-session edge function for a Session
// URL and then full-page-navigate the browser there.
export default function CheckoutModal({ billing, onClose, t }) {
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Please sign in first");

        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            billingCycle: billing,
            returnUrl: window.location.origin,
          }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Checkout failed");
        if (cancelled) return;

        window.location.href = json.url;
      } catch (err) {
        if (cancelled) return;
        setError(err.message || "Something went wrong");
      }
    })();

    return () => { cancelled = true; };
  }, [billing]);

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
            maxWidth: 400, width: "calc(100% - 48px)",
            boxShadow: "0 32px 80px -20px rgba(31, 24, 18, 0.45), 0 6px 16px -8px rgba(31, 24, 18, 0.2)",
            overflow: "hidden",
            zIndex: 1101,
          }}
        >
          {/* Header — TailorMyText Pro context strip */}
          <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid var(--tmt-rule)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(176, 81, 46, 0.15)", border: "1px solid rgba(176, 81, 46, 0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <BookOpen size={17} style={{ color: "var(--tmt-terra)" }} />
              </div>
              <div>
                <Dialog.Title style={{ fontFamily: "var(--tmt-serif-display)", fontSize: 17, fontWeight: 450, color: "var(--tmt-ink)", margin: 0, letterSpacing: "-0.01em" }}>TailorMyText Pro</Dialog.Title>
                <p style={{ fontFamily: "var(--tmt-mono)", fontSize: 10.5, color: "var(--tmt-ink-muted)", margin: "2px 0 0", textTransform: "uppercase", letterSpacing: "0.14em" }}>{billing === "monthly" ? "Monthly" : "Annual"} subscription</p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button aria-label="Close" className="rf-static" style={{ width: 34, height: 34, borderRadius: 8, border: "none", background: "transparent", color: "var(--tmt-ink-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "none" }}>
                <X size={16} strokeWidth={2} />
              </button>
            </Dialog.Close>
          </div>

          {/* Body — loader or error */}
          <div style={{ padding: "44px 28px 36px", textAlign: "center" }}>
            {error ? (
              <>
                <div style={{ width: 60, height: 60, borderRadius: 18, background: "rgba(176, 81, 46, 0.15)", border: "1px solid rgba(176, 81, 46, 0.3)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                  <AlertCircle size={28} style={{ color: "var(--tmt-terra)" }} />
                </div>
                <p style={{ fontFamily: "var(--tmt-serif-display)", fontSize: 19, fontWeight: 450, color: "var(--tmt-ink)", margin: "0 0 8px", letterSpacing: "-0.01em" }}>Couldn't start checkout</p>
                <p style={{ fontFamily: "var(--tmt-serif-body)", fontSize: 14.5, color: "var(--tmt-ink-soft)", margin: "0 0 24px", lineHeight: 1.55, fontStyle: "italic" }}>{error}</p>
                <button onClick={onClose} className="tmt-btn ghost" style={{ justifyContent: "center" }}>
                  Close
                </button>
              </>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <BookLoader size={48} t={t} />
                </div>
                <p style={{ fontFamily: "var(--tmt-serif-display)", fontSize: 18, fontWeight: 450, color: "var(--tmt-ink)", margin: "18px 0 8px", letterSpacing: "-0.01em" }}>Redirecting to secure checkout&hellip;</p>
                <p style={{ fontFamily: "var(--tmt-mono)", fontSize: 10.5, color: "var(--tmt-ink-muted)", margin: 0, textTransform: "uppercase", letterSpacing: "0.14em", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Lock size={10} /> Powered by Stripe
                </p>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
