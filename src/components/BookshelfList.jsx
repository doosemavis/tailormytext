import { memo } from "react";
import { X, BookOpen } from "lucide-react";

// "Your Bookshelf" — library books the user has previously opened. Mirrors
// the RecentDocsList shape (landing pill strip + sidebar list) but carries
// a different mental model: borrowed-from-the-library books, not your own
// uploads. Entries dispatch onOpen(entry), which the parent routes through
// cloudOpenLibraryBook (re-downloads the EPUB and restores saved position).

function timeAgo(ts) {
  const d = Date.now() - ts, m = Math.floor(d / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const LandingBookshelf = memo(function LandingBookshelf({ bookshelfList, onOpen, t }) {
  if (!bookshelfList?.length) return null;
  const list = bookshelfList.slice(0, 6);
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <span className="tmt-label">Your Bookshelf</span>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, maxWidth: 900 }}>
        {list.map(e => (
          <button
            key={e.id}
            onClick={() => onOpen(e)}
            onMouseEnter={ev => {
              ev.currentTarget.style.transform = "translateY(-2px)";
              ev.currentTarget.style.borderColor = t.accent;
              ev.currentTarget.style.boxShadow = `0 12px 28px -16px ${t.accent}55, 0 1px 0 rgba(255,255,255,0.6) inset`;
            }}
            onMouseLeave={ev => {
              ev.currentTarget.style.transform = "translateY(0)";
              ev.currentTarget.style.borderColor = "var(--tmt-rule)";
              ev.currentTarget.style.boxShadow = "0 1px 0 rgba(255,255,255,0.6) inset";
            }}
            title={`${e.name} · ${timeAgo(e.timestamp)}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 16px 9px 10px",
              borderRadius: 999,
              border: "1px solid var(--tmt-rule)",
              background: "var(--tmt-paper-card)",
              cursor: "pointer",
              transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
              maxWidth: 280,
              boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset",
              outline: "none",
              font: "inherit",
            }}
          >
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              borderRadius: 6,
              background: "rgba(176,81,46,0.10)",
              color: "var(--tmt-terra-deep)",
              flexShrink: 0,
            }}>
              <BookOpen size={11} strokeWidth={2.2} />
            </span>
            <span style={{
              fontFamily: "var(--tmt-serif-display)",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--tmt-ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>{e.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
});

export const SidebarBookshelf = memo(function SidebarBookshelf({ bookshelfList, fileName, onOpen, onRemove, t }) {
  // Hide the currently-open book from this list — it's already shown in the
  // "Currently Reading" section above.
  const list = bookshelfList.filter(e => e.name !== fileName).slice(0, 5);
  if (!list.length) return null;
  return (
    <div style={{ padding: "0 14px 14px" }}>
      <p style={{ fontSize: 11, fontWeight: 650, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 8px", padding: "0 2px" }}>Your Bookshelf</p>
      <div style={{ borderRadius: 10, border: `1px solid ${t.borderSoft}`, overflow: "hidden" }}>
        {list.map((e, i) => (
          <div key={e.id} onClick={() => onOpen(e)}
            onMouseEnter={ev => (ev.currentTarget.style.background = t.surfaceHover)}
            onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderBottom: i < list.length - 1 ? `1px solid ${t.borderSoft}` : "none", background: "transparent", cursor: "pointer", transition: "background 0.15s" }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: t.surface, display: "flex", alignItems: "center", justifyContent: "center", color: t.fgSoft, flexShrink: 0 }}>
              <BookOpen size={14} strokeWidth={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 580, color: t.fg, fontFamily: "'DM Sans', sans-serif", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</p>
              <p style={{ fontSize: 10, color: t.fgSoft, margin: "2px 0 0", fontFamily: "'DM Sans', sans-serif" }}>Library · {timeAgo(e.timestamp)}</p>
            </div>
            <button aria-label="Remove from bookshelf" onClick={ev => { ev.stopPropagation(); onRemove(e.id); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: t.icon, borderRadius: 8, flexShrink: 0, width: 34, height: 34, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}><X size={16} strokeWidth={2} /></button>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10, color: t.icon, fontFamily: "'DM Sans', sans-serif", margin: "6px 0 0", textAlign: "center" }}>
        Reading positions sync across devices
      </p>
    </div>
  );
});
