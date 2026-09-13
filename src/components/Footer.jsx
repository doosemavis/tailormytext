import { useState } from "react";
import { Link } from "react-router-dom";
import ContactModal from "./ContactModal";
import { marketingThemeVars } from "../utils/marketingTheme";

// Editorial global footer rendered on every non-reader route. Locks to
// the marketing aesthetic (cream paper, ink + terra) for consistency
// across landing, legal pages, and account chrome.
//
// Contact opens a modal (not a mailto: link) because mailto silently fails
// when the user has no default mail client configured — the modal shows
// the address as plain text + a Copy button + an Open-in-mail-client link
// for users who *do* have one set up.

// Padding + inline-block expands tap target to ≈44px tall without making
// the visible text any bigger (a11y target, especially on mobile).
const NAV_LINK = {
  color: "var(--tmt-ink-soft)",
  textDecoration: "none",
  background: "none",
  border: "none",
  padding: "13px 12px",
  display: "inline-block",
  fontFamily: "var(--tmt-mono)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  cursor: "pointer",
  transition: "color 0.2s ease",
};

// `t` (active theme tokens) is spread as CSS custom properties so the
// editorial footer re-skins to whatever theme is active.
export default function Footer({ t }) {
  const year = new Date().getFullYear();
  const [showContact, setShowContact] = useState(false);
  // Tracks which footer link is hovered so we can apply the terra color
  // without needing inline :hover. State is the simplest route here.
  const [hoveredKey, setHoveredKey] = useState(null);

  const linkColor = (key) => hoveredKey === key ? "var(--tmt-terra)" : "var(--tmt-ink-soft)";

  return (
    <>
      <footer
        className="tmt-marketing"
        style={{
          ...marketingThemeVars(t),
          position: "relative",
          zIndex: 2,
          borderTop: "1px solid var(--tmt-rule)",
          padding: "0 28px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "transparent",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 0" }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, var(--tmt-sand) 0%, var(--tmt-terra) 55%, var(--tmt-terra-deep) 100%)", boxShadow: "inset -1px -2px 4px rgba(0,0,0,0.2)" }} />
          <span style={{ fontFamily: "var(--tmt-mono)", fontSize: 11, color: "var(--tmt-ink-muted)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            &copy; {year} TailorMyText
          </span>
          <span aria-hidden="true" style={{ color: "var(--tmt-rule)", fontFamily: "var(--tmt-mono)", fontSize: 11 }}>·</span>
          <span style={{ fontFamily: "var(--tmt-serif-body)", fontStyle: "italic", fontSize: 13, color: "var(--tmt-ink-muted)" }}>
            Made for readers. Tailored to you.
          </span>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Link
            to="/privacy"
            onMouseEnter={() => setHoveredKey("privacy")}
            onMouseLeave={() => setHoveredKey(null)}
            style={{ ...NAV_LINK, color: linkColor("privacy") }}
          >Privacy</Link>
          <span aria-hidden="true" style={{ color: "var(--tmt-rule)" }}>·</span>
          <Link
            to="/terms"
            onMouseEnter={() => setHoveredKey("terms")}
            onMouseLeave={() => setHoveredKey(null)}
            style={{ ...NAV_LINK, color: linkColor("terms") }}
          >Terms</Link>
          <span aria-hidden="true" style={{ color: "var(--tmt-rule)" }}>·</span>
          <a
            href="#contact"
            onClick={(e) => { e.preventDefault(); setShowContact(true); }}
            onMouseEnter={() => setHoveredKey("contact")}
            onMouseLeave={() => setHoveredKey(null)}
            style={{ ...NAV_LINK, color: linkColor("contact") }}
          >
            Contact
          </a>
        </nav>
      </footer>
      <ContactModal open={showContact} onOpenChange={setShowContact} t={t} />
    </>
  );
}
