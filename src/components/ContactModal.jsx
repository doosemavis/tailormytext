import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Mail, Copy, Check, ExternalLink } from "lucide-react";
import { marketingThemeVars } from "../utils/marketingTheme";

const SUPPORT_EMAIL = "support@tailormytext.com";

const OVERLAY = {
  position: "fixed", inset: 0,
  background: "rgba(31, 24, 18, 0.55)",
  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  zIndex: 1010,
};

// Click "Contact" in the footer → this modal. Avoids the mailto:-silently-
// fails-when-no-default-mail-client problem; gives the user the address as
// plain text + a Copy button + an explicit Open-in-mail-client link.
export default function ContactModal({ open, onOpenChange, t }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API blocked (insecure context, permissions). User can
      // still select-and-copy from the input below; just don't show the
      // confirmation animation.
    }
  };

  const mailLink = {
    display: "inline-flex", alignItems: "center", gap: 4,
    color: "var(--tmt-ink-soft)", textDecoration: "none",
    fontFamily: "var(--tmt-serif-body)", fontStyle: "italic",
    transition: "color 0.2s ease",
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
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
            borderRadius: 22,
            maxWidth: 440, width: "calc(100% - 48px)",
            padding: "28px 28px 24px",
            boxShadow: "0 28px 80px -20px rgba(31, 24, 18, 0.45), 0 6px 16px -8px rgba(31, 24, 18, 0.2)",
            zIndex: 1011,
          }}
        >
          <Dialog.Close asChild>
            <button aria-label="Close" className="rf-static" style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 8, border: "none", background: "transparent", color: "var(--tmt-ink-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "none" }}>
              <X size={16} strokeWidth={2} />
            </button>
          </Dialog.Close>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(176, 81, 46, 0.15)", border: "1px solid rgba(176, 81, 46, 0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Mail size={18} style={{ color: "var(--tmt-terra)" }} />
            </div>
            <div>
              <div style={{ marginBottom: 2 }}>
                <span className="tmt-eyebrow lead">Contact</span>
              </div>
              <Dialog.Title className="tmt-display" style={{ fontSize: 22, fontWeight: 400, letterSpacing: "-0.015em", margin: 0 }}>
                Get in touch
              </Dialog.Title>
            </div>
          </div>

          <p style={{ fontFamily: "var(--tmt-serif-body)", fontSize: 14.5, color: "var(--tmt-ink-soft)", margin: "14px 0 18px", lineHeight: 1.55 }}>
            Questions, feedback, billing issues, or feature requests &mdash; email us and we'll get back to you as soon as we can.
          </p>

          <div style={{ display: "flex", alignItems: "stretch", gap: 8, marginBottom: 14 }}>
            <input
              type="text"
              value={SUPPORT_EMAIL}
              readOnly
              onFocus={e => e.target.select()}
              style={{
                flex: 1, padding: "11px 14px",
                borderRadius: 10, border: "1px solid var(--tmt-rule)",
                background: "var(--tmt-paper)", color: "var(--tmt-ink)",
                fontFamily: "var(--tmt-mono)", fontSize: 13,
                outline: "none", boxSizing: "border-box",
              }}
            />
            <button
              onClick={handleCopy}
              className="rf-btn-solid tmt-btn"
              style={{
                padding: "0 16px",
                background: copied ? "var(--tmt-sage)" : "var(--tmt-terra)",
              }}
            >
              {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", fontFamily: "var(--tmt-mono)", fontSize: 11, color: "var(--tmt-ink-muted)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            <span>Or open in</span>
            <a
              href={`https://mail.google.com/mail/?view=cm&fs=1&to=${SUPPORT_EMAIL}`}
              target="_blank"
              rel="noopener noreferrer"
              style={mailLink}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--tmt-terra)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--tmt-ink-soft)")}
            >
              Gmail <ExternalLink size={11} />
            </a>
            <span aria-hidden="true" style={{ color: "var(--tmt-rule)" }}>·</span>
            <a
              href={`https://outlook.live.com/owa/?path=/mail/action/compose&to=${SUPPORT_EMAIL}`}
              target="_blank"
              rel="noopener noreferrer"
              style={mailLink}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--tmt-terra)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--tmt-ink-soft)")}
            >
              Outlook <ExternalLink size={11} />
            </a>
            <span aria-hidden="true" style={{ color: "var(--tmt-rule)" }}>·</span>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              style={mailLink}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--tmt-terra)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--tmt-ink-soft)")}
            >
              Default Mail App <ExternalLink size={11} />
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
