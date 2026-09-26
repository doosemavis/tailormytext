// Phone (< 768px) reader top bar (spec §6.1):
// [panel] [chapter menu + badge] [tools] [account]. Pure layout: every slot
// is an element built in App and shared with the desktop top bar.
export default function PhoneReaderToolbar({ panelButton, chapterMenu, uncertaintyBadge, tools, userMenu, t }) {
  return (
    <div
      className="rf-reader-chrome rf-phone-toolbar"
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: `1px solid ${t.borderSoft}`, minHeight: 44, background: t.bg }}
    >
      {panelButton}
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
        {chapterMenu}
        {uncertaintyBadge}
      </div>
      {tools}
      {userMenu}
    </div>
  );
}
