import { LibraryBig, Upload, ArrowUpRight } from "lucide-react";
import { marketingThemeVars } from "../utils/marketingTheme";

// Editorial empty state for the reader scroll area. Shown when the user has
// closed their current doc but stayed in reader view (e.g. tapped the X
// under "Currently Reading"). The recent doc list + bookshelf are visible
// in the sidebar; this view simply prompts the reader to pick what's next.
//
// Wrapped in .tmt-marketing + marketingThemeVars(t) so the editorial
// typography (Fraunces/Newsreader/Plex Mono) renders correctly inside the
// reader chrome, which otherwise uses 'DM Sans'.
export default function ReaderEmptyState({ t, hasLibrary, hasBookshelf, onBrowseLibrary, onUpload, canUpload }) {
  return (
    <div
      className="tmt-marketing"
      style={{
        ...marketingThemeVars(t),
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 32px",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          width: "100%",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
        }}
      >
        <span
          style={{
            fontFamily: "var(--tmt-mono)",
            fontSize: 10.5,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: "var(--tmt-terra)",
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span aria-hidden="true" style={{ width: 22, height: 1, background: "var(--tmt-terra)" }} />
          The Next Chapter
          <span aria-hidden="true" style={{ width: 22, height: 1, background: "var(--tmt-terra)" }} />
        </span>

        <h2
          className="tmt-display"
          style={{
            fontFamily: "var(--tmt-serif-display)",
            fontSize: "clamp(34px, 4.2vw, 52px)",
            fontWeight: 360,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
            color: "var(--tmt-ink)",
            margin: 0,
          }}
        >
          What shall we
          <br />
          read <em style={{ fontStyle: "italic" }}>next?</em>
        </h2>

        <p
          style={{
            fontFamily: "var(--tmt-serif-body)",
            fontSize: 17,
            lineHeight: 1.55,
            color: "var(--tmt-ink-soft)",
            margin: 0,
            maxWidth: 460,
          }}
        >
          {hasBookshelf ? (
            <>
              <span style={{ display: "block" }}>Pick up where you left off, browse the curated library,</span>
              <span style={{ display: "block" }}>or bring in something new.</span>
            </>
          ) : (
            <>
              <span style={{ display: "block" }}>Browse a few classics from the curated library,</span>
              <span style={{ display: "block" }}>or bring in something of your own.</span>
            </>
          )}
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 12,
            marginTop: 6,
          }}
        >
          {hasLibrary && (
            <button
              onClick={onBrowseLibrary}
              className="tmt-btn rf-btn-solid"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <LibraryBig size={15} strokeWidth={2} />
              Browse the Library
              <ArrowUpRight size={13} strokeWidth={2.4} />
            </button>
          )}
          {canUpload && (
            <button
              onClick={onUpload}
              className="tmt-btn ghost"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Upload size={14} strokeWidth={2} />
              Upload a file
            </button>
          )}
        </div>

        <span
          style={{
            fontFamily: "var(--tmt-mono)",
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--tmt-ink-muted)",
            marginTop: 12,
          }}
        >
          {hasBookshelf ? "Your bookshelf is waiting in the sidebar" : "Anything you upload returns here too"}
        </span>
      </div>
    </div>
  );
}
