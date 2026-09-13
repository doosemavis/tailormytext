import { memo } from "react";
import { X, ArrowRight, Library } from "lucide-react";

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

export const SidebarRecentDocs = memo(function SidebarRecentDocs({ recentList, fileName, onLoad, onRemove, isPro, t }) {
  // Hide the currently-open doc from this list — it's already shown in the
  // "Currently Reading" section above.
  const list = recentList.filter(e => e.name !== fileName).slice(0, 5);
  if (!list.length) return null;
  return (
    <div style={{ padding: "0 14px 14px" }}>
      <p style={{ fontSize: 11, fontWeight: 650, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 8px", padding: "0 2px" }}>Recent Documents</p>
      <div style={{ borderRadius: 10, border: `1px solid ${t.borderSoft}`, overflow: "hidden" }}>
        {list.map((e, i) => {
          const ext = e.name.split(".").pop().toUpperCase();
          return (
            <div key={e.id} onClick={() => onLoad(e)}
              onMouseEnter={ev => (ev.currentTarget.style.background = t.surfaceHover)}
              onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderBottom: i < list.length - 1 ? `1px solid ${t.borderSoft}` : "none", background: "transparent", cursor: "pointer", transition: "background 0.15s" }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: t.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 750, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>{ext}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 580, color: t.fg, fontFamily: "'DM Sans', sans-serif", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</p>
                <p style={{ fontSize: 10, color: t.fgSoft, margin: "2px 0 0", fontFamily: "'DM Sans', sans-serif" }}>{timeAgo(e.timestamp)}</p>
              </div>
              <button aria-label="Remove from recent" onClick={ev => { ev.stopPropagation(); onRemove(e.id); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: t.icon, borderRadius: 8, flexShrink: 0, width: 34, height: 34, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}><X size={16} strokeWidth={2} /></button>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 10, color: t.icon, fontFamily: "'DM Sans', sans-serif", margin: "6px 0 0", textAlign: "center" }}>
        {isPro
          ? "Documents are removed after 7 days of inactivity"
          : "Reopening saved docs won't use a free upload"}
      </p>
    </div>
  );
});

// Landing-page "Continue Reading" — rendered as a centered horizontal pill
// strip so it visually balances with the centered theme-picker band below
// it (instead of stacking inside the right hero column, where it pulled
// the whole hero out of balance). Hidden entirely when the library is
// empty — the drop zone above already invites the first upload.
export const LandingRecentDocs = memo(function LandingRecentDocs({ recentList, onLoad, isPro, t }) {
  if (!recentList.length) return null;
  const list = recentList.slice(0, 5);
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <span className="tmt-label">Continue Reading</span>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, maxWidth: 900 }}>
        {list.map(e => {
          const ext = e.name.split(".").pop().toUpperCase();
          const baseName = e.name.replace(/\.[^.]+$/, "");
          return (
            <button
              key={e.id}
              onClick={() => onLoad(e)}
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
                fontFamily: "var(--tmt-mono)",
                fontSize: 9.5,
                fontWeight: 700,
                color: "var(--tmt-ink-muted)",
                background: "rgba(0,0,0,0.05)",
                padding: "3px 7px",
                borderRadius: 6,
                letterSpacing: "0.08em",
                flexShrink: 0,
              }}>{ext}</span>
              <span style={{
                fontFamily: "var(--tmt-display)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--tmt-ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>{baseName}</span>
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: 11, color: "var(--tmt-ink-muted)", fontFamily: "var(--tmt-mono)", letterSpacing: "0.04em" }}>
        {isPro
          ? "Documents are removed after 7 days of inactivity"
          : "Reopening saved docs won't use a free upload"}
      </span>
    </div>
  );
});
