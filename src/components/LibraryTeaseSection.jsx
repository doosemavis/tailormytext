import { memo } from "react";
import { ArrowUpRight } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────
// LibraryTeaseSection — anonymous-visitor tease for the Curated Library.
//
// Anonymous landing slot (where the authed Reading Room sits for members).
// Shows a private shelf glimpsed from a distance: 21 abstract spines in the
// era-classified palette the authed cards use, but no titles, no authors
// on the spines, no grid. The library exists, the visitor can see its
// shape, but the door is closed until they get a library card (sign up).
//
// Design: "The Shelf at Distance" — title plates left blank (just two
// hairline bands where the gilt lettering would sit), tiny roman numerals
// at the base for ornament, one spine breathes slowly to draw the eye.
//
// Copy strategy: name a few classic AUTHORS (Brontë, Wilde, Shelley,
// Dostoyevsky) to anchor the era + canon, but never the BOOKS — that's
// what's reserved for the sign-in surprise.
// ─────────────────────────────────────────────────────────────────────────

// Spine palette mirrors src/components/LibrarySection.jsx era buckets so
// the silhouette matches what authed users actually see post-sign-in.
const SPINE_PALETTE = {
  ink:       { fill: "var(--tmt-ink)",        band: "rgba(217, 176, 127, 0.45)" }, // pre-1700
  terraDeep: { fill: "var(--tmt-terra-deep)", band: "rgba(217, 176, 127, 0.55)" }, // 1700s
  terra:     { fill: "var(--tmt-terra)",      band: "rgba(255, 240, 210, 0.55)" }, // 1800-1849
  sage:      { fill: "var(--tmt-sage)",       band: "rgba(217, 176, 127, 0.55)" }, // 1850-1899
  sand:      { fill: "var(--tmt-sand)",       band: "rgba(31, 24, 18, 0.20)"   }, // 1900+
};

// Hand-tuned shelf — distribution mirrors the actual 21-book era spread:
// 2 pre-1700 · 2 1700s · 4 early-19th · 8 late-19th · 5 20th. Heights
// and widths vary like real bound volumes. The order is shuffled (not
// chronological) so the eye reads the shelf as a found object, not a
// timeline. A few spines lean slightly; one breathes.
const SHELF = [
  { c: "sage",      h: 168, w: 18, lean:  0.6 },
  { c: "terra",     h: 184, w: 22, lean: -0.4, breathe: true },
  { c: "ink",       h: 158, w: 16, lean:  0   },
  { c: "sand",      h: 176, w: 24, lean:  0.8 },
  { c: "sage",      h: 192, w: 19, lean: -0.6 },
  { c: "terra",     h: 164, w: 21, lean:  0   },
  { c: "terraDeep", h: 198, w: 23, lean:  0.4 },
  { c: "sage",      h: 154, w: 17, lean: -0.8 },
  { c: "sand",      h: 188, w: 20, lean:  0   },
  { c: "terra",     h: 178, w: 26, lean:  0.6 },
  { c: "sage",      h: 166, w: 18, lean: -0.3 },
  { c: "ink",       h: 196, w: 22, lean:  0   },
  { c: "sage",      h: 172, w: 19, lean:  0.5 },
  { c: "sand",      h: 158, w: 24, lean: -0.7 },
  { c: "sage",      h: 184, w: 17, lean:  0.2 },
  { c: "terra",     h: 168, w: 20, lean:  0   },
  { c: "sand",      h: 192, w: 25, lean:  0.4 },
  { c: "sage",      h: 162, w: 18, lean: -0.5 },
  { c: "terraDeep", h: 176, w: 21, lean:  0   },
  { c: "sage",      h: 188, w: 19, lean:  0.7 },
  { c: "sand",      h: 154, w: 23, lean: -0.3 },
];

// Roman numerals for the tiny ornaments at the base of each spine. NOT
// book numbers — purely decorative typography, like the imprint mark on
// a real binding. Never reveals which book is which.
const ROMAN = [
  "I","II","III","IV","V","VI","VII","VIII","IX","X",
  "XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX","XXI",
];

const KEYFRAMES = `
@keyframes tmt-tease-spine-rise {
  from { opacity: 0; transform: translateY(18px) rotate(0deg); }
  to   { opacity: 1; }
}
@keyframes tmt-tease-spine-breathe {
  0%, 100% { filter: brightness(1); }
  50%      { filter: brightness(1.18); }
}
`;

const Spine = memo(function Spine({ idx, def }) {
  const palette = SPINE_PALETTE[def.c];
  // Mount stagger: 24ms per spine, capped so the whole shelf settles in
  // under ~600ms (no late stragglers).
  const delay = `${30 + idx * 24}ms`;
  const tilt = `${def.lean}deg`;

  return (
    <span
      aria-hidden="true"
      style={{
        position: "relative",
        flexShrink: 0,
        display: "block",
        width: def.w,
        height: def.h,
        background: palette.fill,
        borderRadius: "2px 2px 1px 1px",
        transform: `rotate(${tilt})`,
        transformOrigin: "bottom center",
        opacity: 0,
        boxShadow:
          "inset 1px 0 0 rgba(255,255,255,0.18), inset -1px 0 0 rgba(0,0,0,0.18), 0 1px 0 rgba(31,24,18,0.18)",
        animation: `tmt-tease-spine-rise 0.55s cubic-bezier(.22,.61,.36,1) ${delay} both${
          def.breathe ? ", tmt-tease-spine-breathe 5.2s ease-in-out 1.4s infinite" : ""
        }`,
      }}
    >
      {/* Top gilt band — sits where the embossed title block would be */}
      <span
        style={{
          position: "absolute",
          left: 2,
          right: 2,
          top: "15%",
          height: 1,
          background: palette.band,
          opacity: 0.85,
        }}
      />
      {/* Empty title plate — a slightly indented rectangle, the size you'd
          stamp a title onto, but blank. This is the "you can't read it
          from here" detail. */}
      <span
        style={{
          position: "absolute",
          left: 2,
          right: 2,
          top: "30%",
          height: "26%",
          background: "rgba(0,0,0,0.10)",
          borderTop: "1px solid rgba(255,255,255,0.10)",
          borderBottom: "1px solid rgba(0,0,0,0.12)",
        }}
      />
      {/* Bottom gilt band */}
      <span
        style={{
          position: "absolute",
          left: 2,
          right: 2,
          bottom: "18%",
          height: 1,
          background: palette.band,
          opacity: 0.7,
        }}
      />
      {/* Tiny mono roman numeral at the base — decorative, low opacity */}
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 4,
          textAlign: "center",
          fontFamily: "var(--tmt-mono)",
          fontSize: 6.5,
          letterSpacing: "0.08em",
          color: def.c === "sand" ? "rgba(31,24,18,0.45)" : "rgba(255,240,210,0.55)",
          lineHeight: 1,
        }}
      >
        {ROMAN[idx] || ""}
      </span>
    </span>
  );
});

export default function LibraryTeaseSection({ onSignUp /*, t */ }) {
  // Renders inside the .tmt-marketing scope on App.jsx's landing return,
  // so var(--tmt-*) tokens resolve from the parent without us spreading
  // marketingThemeVars(t) again here.
  return (
    <section
      aria-labelledby="tmt-tease-heading"
      style={{
        position: "relative",
        zIndex: 2,
        padding: "100px 24px 80px",
        borderTop: "1px solid var(--tmt-rule)",
        maxWidth: 1240,
        width: "100%",
        margin: "0 auto",
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* HEADER — same column rhythm as the conditions grid below it
          (1fr / 1.4fr), so the page reads as one editorial spread. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.4fr",
          gap: 60,
          alignItems: "end",
          marginBottom: 56,
        }}
      >
        <div>
          <div style={{ marginBottom: 14 }}>
            <span className="tmt-eyebrow">The Reading Room &middot; Members&rsquo; Wing</span>
          </div>
          <h2
            id="tmt-tease-heading"
            className="tmt-display"
            style={{
              fontSize: "clamp(34px, 4.2vw, 56px)",
              fontWeight: 350,
              letterSpacing: "-0.02em",
              lineHeight: 1.02,
              margin: 0,
            }}
          >
            Twenty-one classics,
            <br />
            <em style={{ fontStyle: "italic" }}>kept warm</em> for members.
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingBottom: 6 }}>
          <p
            style={{
              fontFamily: "var(--tmt-serif-body)",
              fontSize: 18,
              lineHeight: 1.55,
              color: "var(--tmt-ink-soft)",
              margin: 0,
              maxWidth: 520,
            }}
          >
            From Shakespeare to Fitzgerald &mdash; era-spanning, hand-picked,
            kept on a small shelf for members of the Reading Room. Bront&euml;
            sits beside Wilde, Shelley keeps Dostoyevsky company.{" "}
            <span style={{ color: "var(--tmt-ink)" }}>Five on the house when you join.</span>{" "}
            The rest are part of Pro.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onSignUp}
              className="tmt-btn rf-btn-solid"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              Get a library card
              <ArrowUpRight size={14} strokeWidth={2.4} />
            </button>
            <span
              style={{
                fontFamily: "var(--tmt-mono)",
                fontSize: 10.5,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--tmt-ink-muted)",
              }}
            >
              No card required to peek
            </span>
          </div>
        </div>
      </div>

      {/* SHELF — atmospheric band. Top rule = shelf edge; spines stand on
          it. Bottom shadow suggests wood grain below. */}
      <div style={{ position: "relative" }}>
        {/* Shelf-edge rule */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 1,
            background: "var(--tmt-ink)",
            opacity: 0.65,
            zIndex: 2,
          }}
        />
        {/* Shelf-thickness shadow (the wooden front) */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "100%",
            height: 14,
            background:
              "linear-gradient(to bottom, rgba(31,24,18,0.22), rgba(31,24,18,0))",
            zIndex: 1,
            pointerEvents: "none",
          }}
        />

        {/* Spine row */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: 4,
            padding: "0 8px",
            minHeight: 220,
            background:
              "linear-gradient(to bottom, rgba(176,81,46,0.04) 0%, transparent 55%)",
            zIndex: 3,
          }}
        >
          {SHELF.map((def, i) => (
            <Spine key={i} idx={i} def={def} />
          ))}
        </div>
      </div>

      {/* CAPTION — paper-thin epigraph beneath the shelf */}
      <p
        style={{
          marginTop: 36,
          textAlign: "center",
          fontFamily: "var(--tmt-serif-body)",
          fontStyle: "italic",
          fontSize: 15,
          color: "var(--tmt-ink-muted)",
          letterSpacing: "0.01em",
        }}
      >
        Twenty-one volumes &middot; era-classified bindings &middot; revealed once you&rsquo;ve signed in.
      </p>
    </section>
  );
}
