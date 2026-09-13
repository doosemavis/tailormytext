import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

// Generic React error boundary. Catches render-time exceptions in its
// subtree, shows a friendly fallback, exposes a Reset button that re-mounts
// the children. Used in two places:
//   1. Around <DocumentBody> — a parser bug or malformed file's render
//      crashes the reader without taking down the whole app.
//   2. Around the entire app tree (in main.jsx) — last-resort catch for
//      anything we didn't anticipate.
//
// React 19 still requires a class component for componentDidCatch / static
// getDerivedStateFromError; there's no hook equivalent.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log to console for now. When we add a remote error tracker (Sentry /
    // Highlight / etc.) in a later phase, swap this for a network call.
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;

    // If a custom fallback render prop was passed, defer to it.
    if (typeof this.props.fallback === "function") {
      return this.props.fallback({ error: this.state.error, reset: this.reset });
    }

    const t = this.props.t ?? {
      bg: "#fff", fg: "#1a1a1a", fgSoft: "#666", surface: "#f5f5f5",
      border: "#ddd", accent: "#3B82F6", accentSoft: "#3B82F622",
    };

    return (
      <div style={{ padding: 48, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center", color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", maxWidth: 540, margin: "0 auto" }}>
        <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10.5, fontWeight: 700, color: "#EF4444", letterSpacing: "0.18em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={13} strokeWidth={2.2} /> Render error
        </span>
        <div>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 360, color: t.fg, margin: "0 0 8px", letterSpacing: "-0.015em", lineHeight: 1.15 }}>
            {this.props.title ?? "Something went wrong"}
          </h2>
          <p style={{ fontFamily: "'Newsreader', serif", fontSize: 16, fontStyle: "italic", color: t.fgSoft, margin: 0, lineHeight: 1.6 }}>
            {this.props.description ?? "TailorMyText hit an unexpected error rendering this. You can reset and try again."}
          </p>
        </div>
        <button
          onClick={this.reset}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 12, border: `1px solid ${t.border}`, background: t.surface, color: t.fg, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
        >
          <RefreshCw size={13} /> Reset
        </button>
      </div>
    );
  }
}
