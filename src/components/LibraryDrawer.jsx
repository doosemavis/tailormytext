import { useState, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Search, BookOpen } from "lucide-react";
import { LibraryGrid } from "./LibrarySection";
import { marketingThemeVars } from "../utils/marketingTheme";

// ─────────────────────────────────────────────────────────────────────────
// LibraryDrawer — in-reader access to the curated library.
//
// Modeled as flipping to a card-catalog appendix at the back of a book:
// the reader stays mounted underneath; the drawer fades in over a paper
// scrim with the same editorial grid the landing page uses. A search box
// at the top filters by title or author; the result count updates live.
//
// Radix Dialog handles focus trap, escape-to-close, scroll lock, and
// portal placement. We re-skin its surface with marketingThemeVars(t) so
// the drawer matches dark themes too.
//
// Trigger lives in the reader sidebar; consumer manages `open` state and
// passes through onOpenChange so a successful book load can close the
// drawer automatically.
// ─────────────────────────────────────────────────────────────────────────

const OVERLAY = {
  position: "fixed",
  inset: 0,
  background: "rgba(31, 24, 18, 0.55)",
  backdropFilter: "blur(10px) saturate(115%)",
  WebkitBackdropFilter: "blur(10px) saturate(115%)",
  zIndex: 1000,
  animation: "tmt-library-overlay-in 220ms cubic-bezier(.22,.61,.36,1)",
};

const CONTENT = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(1080px, calc(100vw - 48px))",
  maxHeight: "calc(100vh - 80px)",
  background: "var(--tmt-paper-card)",
  border: "1px solid var(--tmt-rule)",
  borderRadius: 18,
  boxShadow: "0 40px 100px -24px rgba(31, 24, 18, 0.55), 0 8px 22px -8px rgba(31, 24, 18, 0.22)",
  zIndex: 1001,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  animation: "tmt-library-drawer-in 280ms cubic-bezier(.22,.61,.36,1)",
};

const KEYFRAMES = `
@keyframes tmt-library-overlay-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes tmt-library-drawer-in {
  from { opacity: 0; transform: translate(-50%, -46%) scale(0.985); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes tmt-library-overlay-in { from, to { opacity: 1; } }
  @keyframes tmt-library-drawer-in {
    from, to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
}
`;

export default function LibraryDrawer({ open, onOpenChange, books, isPro, onOpen, t }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return (books || []).filter(b => {
      const title = (b.title || "").toLowerCase();
      const author = (b.author || "").toLowerCase();
      return title.includes(q) || author.includes(q);
    });
  }, [books, query]);

  const total = books?.length || 0;
  const free = (books || []).filter(b => b.tier_required !== "pro").length;

  // Closes the drawer the instant a load begins — user shouldn't have to
  // dismiss the drawer themselves once they've chosen a book. The actual
  // EPUB parse + state hand-off happens in the parent (openLibraryBook in
  // App.jsx). If the parent surfaces the PricingModal (gated) the drawer
  // still closes; both modals coexist without overlap because PricingModal
  // renders on top.
  const handleOpen = (book) => {
    onOpenChange(false);
    onOpen(book);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <style>{KEYFRAMES}</style>
        <Dialog.Overlay style={OVERLAY} />
        <Dialog.Content
          className="tmt-marketing"
          style={{
            ...marketingThemeVars(t),
            ...CONTENT,
          }}
        >
          {/* HEADER — editorial title bar with a search field. */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 32,
              padding: "26px 30px 22px",
              borderBottom: "1px solid var(--tmt-rule)",
              background: "var(--tmt-paper-card)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <span
                style={{
                  fontFamily: "var(--tmt-mono)",
                  fontSize: 10.5,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--tmt-terra)",
                  fontWeight: 700,
                }}
              >
                The Reading Room
              </span>
              <Dialog.Title
                style={{
                  fontFamily: "var(--tmt-serif-display)",
                  fontSize: 28,
                  fontWeight: 380,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.05,
                  color: "var(--tmt-ink)",
                  margin: 0,
                }}
              >
                Browse the library
              </Dialog.Title>
              <p
                style={{
                  fontFamily: "var(--tmt-mono)",
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--tmt-ink-muted)",
                  margin: 0,
                }}
              >
                {isPro ? `${total} volumes · all unlocked` : `${free} free · ${total - free} reserved for Pro`}
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 14px",
                  borderRadius: 999,
                  border: "1px solid var(--tmt-rule)",
                  background: "var(--tmt-paper)",
                  minWidth: 240,
                }}
              >
                <Search size={14} strokeWidth={2} style={{ color: "var(--tmt-ink-muted)", flexShrink: 0 }} />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by title or author"
                  aria-label="Search the library"
                  style={{
                    border: "none",
                    background: "transparent",
                    fontFamily: "var(--tmt-serif-body)",
                    fontSize: 14,
                    // lineHeight: 1 collapses the input's line-box to the
                    // font-size so the caret stays compact (not floor-to-
                    // ceiling); translateY then drops the glyph baseline so
                    // the text bottom sits inline with the icon stem bottom.
                    // The two pull in opposite directions inside one line-
                    // box — this config prioritizes icon alignment.
                    lineHeight: 1,
                    transform: "translateY(2px)",
                    color: "var(--tmt-ink)",
                    width: "100%",
                    padding: 0,
                    display: "block",
                  }}
                />
              </label>
              <Dialog.Close asChild>
                <button
                  aria-label="Close the library"
                  className="tmt-static"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    border: "1px solid var(--tmt-rule)",
                    background: "var(--tmt-paper)",
                    color: "var(--tmt-ink-soft)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* GRID — scrollable region; reuses LibraryGrid so the visual
              treatment matches the landing page exactly. */}
          <div
            style={{
              padding: "24px 30px 30px",
              overflowY: "auto",
              flex: 1,
              minHeight: 0,
              background:
                "radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.35), transparent 50%), var(--tmt-paper-card)",
            }}
          >
            {filtered.length > 0 ? (
              <LibraryGrid books={filtered} isPro={isPro} onOpen={handleOpen} minColumn={300} />
            ) : (
              <div
                role="status"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 14,
                  padding: "80px 24px",
                  textAlign: "center",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 999,
                    background: "rgba(176, 81, 46, 0.10)",
                    border: "1px solid rgba(176, 81, 46, 0.3)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--tmt-terra-deep)",
                  }}
                >
                  <BookOpen size={20} strokeWidth={1.8} />
                </span>
                <p
                  style={{
                    fontFamily: "var(--tmt-serif-display)",
                    fontSize: 20,
                    fontWeight: 420,
                    color: "var(--tmt-ink)",
                    margin: 0,
                  }}
                >
                  Nothing on the shelf matches &ldquo;{query}&rdquo;.
                </p>
                <p
                  style={{
                    fontFamily: "var(--tmt-serif-body)",
                    fontStyle: "italic",
                    fontSize: 14,
                    color: "var(--tmt-ink-muted)",
                    margin: 0,
                  }}
                >
                  Try a different title or author.
                </p>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
