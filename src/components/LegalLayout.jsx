import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Footer from "./Footer";
import { marketingThemeVars } from "../utils/marketingTheme";

// Shared layout for static legal pages (Privacy, Terms). Renders a slim
// header (logo + back link), a max-width prose column, and the global
// Footer. Locks to the marketing aesthetic so legal pages read as part of
// the editorial brand world rather than as a reader-themed surface.
// `t` is accepted for caller compatibility but unused.

const LINK_STYLE_RESET = { color: "inherit", textDecoration: "none" };

export default function LegalLayout({ t, title, lastUpdated, children }) {
  return (
    <div className="tmt-marketing" style={{ ...marketingThemeVars(t), minHeight: "100vh", background: "var(--tmt-paper)", color: "var(--tmt-ink)", display: "flex", flexDirection: "column", position: "relative" }}>
      {/* Subtle atmosphere — no blobs here (would distract from prose),
          just the paper grain for warmth. */}
      <div className="tmt-grain" aria-hidden="true" />

      {/* Header */}
      <header style={{ position: "relative", zIndex: 2, borderBottom: "1px solid var(--tmt-rule)", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link to="/" style={{ ...LINK_STYLE_RESET, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, var(--tmt-sand) 0%, var(--tmt-terra) 55%, var(--tmt-terra-deep) 100%)", boxShadow: "inset -2px -3px 6px rgba(0,0,0,0.2)" }} />
          <span style={{ fontFamily: "var(--tmt-serif-display)", fontSize: 18, fontWeight: 500, color: "var(--tmt-ink)", letterSpacing: "-0.01em", fontVariationSettings: '"opsz" 144, "SOFT" 60' }}>TailorMyText</span>
        </Link>
        <Link to="/" className="tmt-btn ghost rf-link-btn" style={{ padding: "10px 16px", fontSize: 11 }}>
          <ArrowLeft size={12} /> Back to Reader
        </Link>
      </header>

      {/* Main prose */}
      <main style={{ position: "relative", zIndex: 2, flex: 1, padding: "56px 24px 80px", display: "flex", justifyContent: "center" }}>
        <article
          className="tmt-legal-prose"
          style={{
            maxWidth: 720,
            width: "100%",
            color: "var(--tmt-ink-soft)",
            fontFamily: "var(--tmt-serif-body)",
            fontSize: 17,
            lineHeight: 1.7,
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <span className="tmt-eyebrow lead">Legal</span>
          </div>
          <h1 className="tmt-display" style={{ fontSize: "clamp(36px, 5vw, 52px)", fontWeight: 380, color: "var(--tmt-ink)", margin: "0 0 14px", letterSpacing: "-0.025em", lineHeight: 1.05 }}>{title}</h1>
          <p style={{ fontFamily: "var(--tmt-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--tmt-ink-muted)", margin: "0 0 40px" }}>Last updated &middot; {lastUpdated}</p>
          <style>{`
            .tmt-legal-prose h2 {
              font-family: var(--tmt-serif-display);
              font-size: 28px;
              font-weight: 420;
              color: var(--tmt-ink);
              margin: 48px 0 14px;
              letter-spacing: -0.015em;
              font-variation-settings: "opsz" 144, "SOFT" 80;
              line-height: 1.15;
            }
            .tmt-legal-prose h3 {
              font-family: var(--tmt-serif-display);
              font-size: 19px;
              font-weight: 480;
              color: var(--tmt-ink);
              margin: 28px 0 8px;
              letter-spacing: -0.01em;
            }
            .tmt-legal-prose p {
              margin: 0 0 16px;
              color: var(--tmt-ink-soft);
            }
            .tmt-legal-prose ul {
              list-style: none;
              padding-left: 0;
              margin: 0 0 16px;
              color: var(--tmt-ink-soft);
            }
            .tmt-legal-prose li {
              position: relative;
              padding-left: 22px;
              margin-bottom: 10px;
            }
            /* Editorial bullet — book-open glyph in terra. Inlined SVG uses
               hard-coded #B0512E since data URIs can't reference CSS vars. */
            .tmt-legal-prose li::before {
              content: '';
              position: absolute;
              left: 0;
              top: 0.48em;
              width: 14px;
              height: 14px;
              background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23B0512E' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 7v14'/%3E%3Cpath d='M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'/%3E%3C/svg%3E");
              background-size: contain;
              background-repeat: no-repeat;
            }
            .tmt-legal-prose strong {
              color: var(--tmt-ink);
              font-weight: 600;
            }
            .tmt-legal-prose em { font-style: italic; }
            .tmt-legal-prose code {
              font-family: var(--tmt-mono);
              font-size: 14px;
              padding: 1px 6px;
              border-radius: 4px;
              background: var(--tmt-paper-deep);
              color: var(--tmt-ink);
            }
            .tmt-legal-prose a {
              color: var(--tmt-terra);
              text-decoration: underline;
              text-decoration-color: var(--tmt-rule);
              text-underline-offset: 3px;
              transition: text-decoration-color 0.2s ease;
            }
            .tmt-legal-prose a:hover {
              text-decoration-color: var(--tmt-terra);
            }
          `}</style>
          {children}
        </article>
      </main>

      <Footer t={t} />
    </div>
  );
}
