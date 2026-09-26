import * as Popover from "@radix-ui/react-popover";
import { SlidersHorizontal } from "lucide-react";
import FeatureToggleButton from "../FeatureToggleButton";

// Phone-only home for the four reader feature toggles (spec §6.1). Renders
// the same FeatureToggleButton components with the same handlers as the
// desktop top bar; only placement differs. Radix Popover is non-modal by
// default (no <body> pointer-events cost).
export default function ReaderToolsPopover({ items, t }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label="Reader tools"
          className="rf-static"
          style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.icon, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <SlidersHorizontal size={16} strokeWidth={2} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          // Radix's default onMountAutoFocus moves focus onto the first
          // toggle button when the popover opens. That focus (not a
          // pointer interaction) trips the button's own Tip/Tooltip open
          // trigger, and the resulting tooltip can overlap and intercept
          // clicks on an adjacent toggle in this 2-column grid. Popovers
          // opened by tap/click don't need focus moved into them, so we
          // keep focus on the trigger instead.
          onOpenAutoFocus={(e) => e.preventDefault()}
          style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: "0 12px 36px rgba(0,0,0,0.18)", padding: 10, zIndex: 999, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
        >
          {items.map(({ label, on, Icon, onToggle }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FeatureToggleButton on={on} label={label} Icon={Icon} accent={t.accent} iconColor={t.icon} onToggle={onToggle} t={t} />
              <span style={{ fontSize: 13, color: t.fg, fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
            </div>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
