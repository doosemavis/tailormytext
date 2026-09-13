import { memo, useState } from "react";
import { ArrowUpRight, Lock } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────
// THE READING ROOM
//
// Curated Project Gutenberg catalog, designed as an editorial card-catalog
// instead of a generic SaaS card grid. Each book is a numbered "index card"
// with a colored spine accent (cycling through the brand palette so the grid
// reads like an actual shelf of books — different spines, not 20 clones).
//
// Three exports:
//   - LibraryGrid     — bare auto-fill grid of cards. Used by both the
//                       landing-page section and the in-reader drawer.
//   - LibraryCard     — single book card. Numbered, spine-accented, with
//                       hover affordance + "RESERVED" treatment for Pro.
//   - LibrarySection  — landing-page wrapper (eyebrow + display header +
//                       supporting copy + LibraryGrid).
//
// Memory references:
//   - project_library_no_covers: typography-only, no cover art
//   - feedback_radix_first: Radix preferred for interactive primitives
// ─────────────────────────────────────────────────────────────────────────

// Spine palette — five hues drawn from the brand vars. Books are assigned
// a spine color by ERA of publication (chronological gradient: older =
// darker leather-bound binding; newer = lighter cloth/paper). Falls back
// to a rank-based cycle for books with no publication_date so the grid
// still reads like a shelf of mismatched bindings instead of monochrome.
//
// Colors live here instead of inline so the palette stays editorial
// (no risk of a generic rainbow gradient creeping in).
const SPINES = {
  ink:       { fill: "var(--tmt-ink)",        muted: "rgba(31, 24, 18, 0.35)"   },
  terraDeep: { fill: "var(--tmt-terra-deep)", muted: "rgba(138, 62, 34, 0.35)"  },
  terra:     { fill: "var(--tmt-terra)",      muted: "rgba(176, 81, 46, 0.35)"  },
  sage:      { fill: "var(--tmt-sage)",       muted: "rgba(79, 113, 86, 0.35)"  },
  sand:      { fill: "var(--tmt-sand)",       muted: "rgba(217, 176, 127, 0.45)"},
};

// Era buckets — half-century granularity. Pre-1700 reserved for the
// rare ancient text; most Gutenberg classics fall in the 1700-1900s range.
const FALLBACK_CYCLE = [SPINES.terra, SPINES.sage, SPINES.sand, SPINES.terraDeep, SPINES.ink];

function spineFor(book, index) {
  const year = (() => {
    const d = book?.publication_date;
    if (!d) return null;
    const m = String(d).match(/\d{4}/);
    return m ? parseInt(m[0], 10) : null;
  })();

  if (year != null && !Number.isNaN(year)) {
    if (year < 1700) return SPINES.ink;        // antiquarian
    if (year < 1800) return SPINES.terraDeep;  // 18th c.
    if (year < 1850) return SPINES.terra;      // early 19th c.
    if (year < 1900) return SPINES.sage;       // late 19th c.
    return SPINES.sand;                        // 20th c. onward
  }

  // No publication date — fall back to a stable cycle keyed by rank/index
  // so the card still gets a spine color (and the same one across renders).
  const seed = typeof book?.popularity_rank === "number"
    ? book.popularity_rank - 1
    : (typeof index === "number" ? index : 0);
  return FALLBACK_CYCLE[Math.abs(seed) % FALLBACK_CYCLE.length];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fmtReadingTime(min) {
  if (!min) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fmtYear(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/\d{4}/);
  // "Pub." (published) — bibliographic abbreviation that pairs cleanly with
  // the duration + word-count tokens around it, and matches the library
  // card-catalog voice. The parent strip applies text-transform: uppercase
  // so this renders as "PUB. 1925".
  return m ? `Pub. ${m[0]}` : null;
}

function fmtWords(n) {
  if (!n) return null;
  if (n < 1000) return `${n} words`;
  return `${Math.round(n / 1000)}K words`;
}

export const LibraryCard = memo(function LibraryCard({ book, locked, onOpen, index }) {
  const [hover, setHover] = useState(false);
  const spine = spineFor(book, index);
  const year = fmtYear(book.publication_date);
  const reading = fmtReadingTime(book.reading_time_min);
  const words = fmtWords(book.word_count);
  const author = book.author || "Unknown";
  const rankLabel = pad2(book.popularity_rank ?? (typeof index === "number" ? index + 1 : 0));

  // Locked Pro: spine drops to muted, content fades a touch, and a top-right
  // "RESERVED · PRO" eyebrow takes the place of any standard "Pro" pill.
  // Click is still wired — parent surfaces the gate (PricingModal).
  const spineColor = locked ? spine.muted : spine.fill;

  return (
    <button
      onClick={() => onOpen(book)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className="tmt-static"
      aria-label={`${book.title} by ${author}${locked ? " — Reserved for Pro members" : ""}`}
      style={{
        position: "relative",
        textAlign: "left",
        background: "var(--tmt-paper-card)",
        border: `1px solid ${hover ? "var(--tmt-ink-muted)" : "var(--tmt-rule)"}`,
        borderRadius: 4,
        padding: 0,
        cursor: "pointer",
        display: "flex",
        minHeight: 232,
        overflow: "hidden",
        boxShadow: hover
          ? "0 18px 38px -22px rgba(31,24,18,0.42), 0 2px 0 rgba(31,24,18,0.05), 0 1px 0 rgba(255,255,255,0.5) inset"
          : "0 1px 0 rgba(255,255,255,0.5) inset, 0 1px 0 rgba(31,24,18,0.04)",
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        transition: "transform 0.22s var(--tmt-easing, ease), box-shadow 0.22s var(--tmt-easing, ease), border-color 0.22s ease",
        outline: "none",
        font: "inherit",
        opacity: locked ? 0.92 : 1,
      }}
    >
      {/* SPINE — left edge color band. Grows from 5px to 8px on hover,
          referencing the visual mass of an actual book spine on a shelf. */}
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: hover ? 8 : 5,
          alignSelf: "stretch",
          background: spineColor,
          transition: "width 0.22s var(--tmt-easing, ease), background 0.22s ease",
          // Subtle inner highlight runs the length of the spine — gives it
          // a leather-bound feel rather than a flat color block.
          boxShadow: locked
            ? "none"
            : "inset 1px 0 0 rgba(255,255,255,0.18), inset -1px 0 0 rgba(0,0,0,0.12)",
        }}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "18px 20px 16px", minWidth: 0 }}>
        {/* TOP META ROW — card-catalog number (left) and Pro/Reserved label
            (right when locked). Always present so cards keep a stable grid. */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 16,
            fontFamily: "var(--tmt-mono)",
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--tmt-ink-muted)",
          }}
        >
          <span>
            <span aria-hidden="true" style={{ color: "var(--tmt-ink-soft)" }}>№</span>
            <span style={{ marginLeft: 4 }}>{rankLabel}</span>
            {book.gutenberg_id != null && (
              <>
                <span aria-hidden="true" style={{ margin: "0 6px", opacity: 0.45 }}>·</span>
                <span>PG #{book.gutenberg_id}</span>
              </>
            )}
          </span>
          {/* TOP-RIGHT STATUS / ACTION CELL — two labels share this slot:
              the static state badge ("Free reading" / "Reserved · Pro") and
              the hover action ("Open" / "Unlock"). They sit on top of each
              other and cross-fade on hover, so the card always has an
              indicator in the corner without ever colliding with the
              bottom metadata strip. */}
          <span
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              minHeight: 18,
            }}
          >
            <span
              aria-hidden={hover ? "true" : undefined}
              style={{
                opacity: hover ? 0 : 1,
                transition: "opacity 0.22s ease",
                ...(locked
                  ? {
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      color: "var(--tmt-terra-deep)",
                      background: "rgba(176,81,46,0.08)",
                      border: "1px solid rgba(176,81,46,0.3)",
                      padding: "2px 7px 2px 6px",
                      borderRadius: 3,
                      letterSpacing: "0.14em",
                      fontSize: 9,
                    }
                  : {
                      color: "var(--tmt-ink-muted)",
                    }),
              }}
            >
              {locked ? (
                <>
                  <Lock size={8} strokeWidth={2.8} />
                  Reserved · Pro
                </>
              ) : (
                "Free reading"
              )}
            </span>
            <span
              aria-hidden={hover ? undefined : "true"}
              style={{
                position: "absolute",
                top: "50%",
                right: 0,
                transform: `translateY(-50%) translateX(${hover ? 0 : 4}px)`,
                opacity: hover ? 1 : 0,
                transition: "opacity 0.22s ease, transform 0.22s var(--tmt-easing, ease)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: locked ? "var(--tmt-terra-deep)" : "var(--tmt-terra)",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {locked ? "Unlock" : "Open"}
              <ArrowUpRight size={11} strokeWidth={2.4} />
            </span>
          </span>
        </div>

        {/* TITLE — Fraunces, generous size, tight leading. Allowed up to
            three lines before truncation; long classical titles deserve
            the room. */}
        <h3
          style={{
            fontFamily: "var(--tmt-serif-display)",
            fontSize: 23,
            fontWeight: 460,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: "var(--tmt-ink)",
            margin: 0,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            wordBreak: "break-word",
          }}
        >
          {book.title}
        </h3>

        {/* AUTHOR — italic body serif, with a hairline em-dash flourish in
            front (book-flap copy convention). */}
        <p
          style={{
            fontFamily: "var(--tmt-serif-body)",
            fontStyle: "italic",
            fontSize: 14.5,
            lineHeight: 1.4,
            color: "var(--tmt-ink-soft)",
            margin: "10px 0 0",
          }}
        >
          <span aria-hidden="true" style={{ display: "inline-block", width: 14, height: 1, background: "var(--tmt-ink-soft)", verticalAlign: "middle", marginRight: 8, opacity: 0.55 }} />
          {author}
        </p>

        {/* SPACER pushes the metadata strip to the bottom of the card */}
        <div style={{ flex: 1 }} />

        {/* BOTTOM METADATA — hairline rule + mono-caps tabular strip. The
            hover action lives in the top-right of the card (status corner),
            so this strip stays full-width and never collides with it. */}
        <div
          style={{
            marginTop: 18,
            paddingTop: 12,
            borderTop: "1px solid var(--tmt-rule)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--tmt-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--tmt-ink-muted)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {reading && <span>{reading}</span>}
          {reading && (year || words) && <span aria-hidden="true" style={{ opacity: 0.4 }}>·</span>}
          {year && <span>{year}</span>}
          {year && words && <span aria-hidden="true" style={{ opacity: 0.4 }}>·</span>}
          {words && <span>{words}</span>}
        </div>
      </div>
    </button>
  );
});

// LibraryGrid — bare grid of cards, no header. Used both by the landing
// page's LibrarySection and by the in-reader LibraryDrawer.
export const LibraryGrid = memo(function LibraryGrid({ books, isPro, onOpen, minColumn = 320 }) {
  if (!books?.length) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${minColumn}px, 1fr))`,
        gap: 18,
        width: "100%",
      }}
    >
      {books.map((book, i) => (
        <LibraryCard
          key={book.id}
          book={book}
          index={i}
          locked={!isPro && book.tier_required === "pro"}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
});

// LibrarySection — landing-page wrapper with editorial header. Two-column
// header layout (eyebrow + headline left, supporting copy right) so the
// section announces itself like a magazine feature opener rather than a
// titled card list.
export const LibrarySection = memo(function LibrarySection({ books, isPro, onOpen }) {
  if (!books?.length) return null;
  const total = books.length;
  const free = books.filter(b => b.tier_required !== "pro").length;

  return (
    <section
      aria-labelledby="tmt-library-heading"
      style={{
        width: "100%",
        maxWidth: 1180,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 36,
      }}
    >
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)",
          gap: 48,
          alignItems: "end",
          paddingBottom: 8,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <span className="tmt-eyebrow">
            <span style={{ fontWeight: 700, letterSpacing: "0.22em" }}>The Reading Room</span>
            <span aria-hidden="true" style={{ margin: "0 10px", opacity: 0.5 }}>·</span>
            <span style={{ color: "var(--tmt-ink-muted)" }}>Vol. I</span>
          </span>
          <h2
            id="tmt-library-heading"
            className="tmt-display"
            style={{
              fontSize: "clamp(34px, 4vw, 52px)",
              fontWeight: 360,
              letterSpacing: "-0.02em",
              lineHeight: 1.02,
              color: "var(--tmt-ink)",
              margin: 0,
            }}
          >
            A small, careful shelf
            <br />
            of <em style={{ fontStyle: "italic" }}>public-domain</em> classics.
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 6 }}>
          <p
            style={{
              fontFamily: "var(--tmt-serif-body)",
              fontSize: 16,
              lineHeight: 1.6,
              color: "var(--tmt-ink-soft)",
              margin: 0,
              maxWidth: 460,
            }}
          >
            {isPro ? (
              <>
                <span style={{ display: "block" }}>All {total} volumes are yours.</span>
                <span style={{ display: "block" }}>Pick one up and we&rsquo;ll keep your place across every device you read on.</span>
              </>
            ) : (
              <>
                <span style={{ display: "block" }}>{free} on the house, the rest unlock with Pro.</span>
                <span style={{ display: "block" }}>Your reading position follows you across every device.</span>
              </>
            )}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "var(--tmt-mono)", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--tmt-ink-muted)" }}>
            <span>Project Gutenberg</span>
            <span aria-hidden="true" style={{ width: 18, height: 1, background: "var(--tmt-rule)" }} />
            <span>Curated quarterly</span>
          </div>
        </div>
      </header>

      <LibraryGrid books={books} isPro={isPro} onOpen={onOpen} />
    </section>
  );
});

export default LibrarySection;
