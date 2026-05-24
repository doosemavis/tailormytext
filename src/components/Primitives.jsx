import { useState, useEffect, useRef, memo } from "react";
import { ChevronDown } from "lucide-react";
import { FONTS } from "../config/constants";
import * as Switch from "@radix-ui/react-switch";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { getTooltipColors } from "../config/themeColors";

const DARK_BGS = new Set(["#111116", "#0B0E14", "#100E18", "#080806", "#0D1410"]);

// Shared modal backdrop style. Previously duplicated verbatim in 4 modals
// (Avatar / Delete / Subscription / EditChapters). The other modal overlays
// intentionally diverge (warm tint, blur radius, zIndex layer) and stay
// inline — see the modal files for those.
export const MODAL_OVERLAY_STYLE = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  zIndex: 1010,
};

export const Toggle = memo(function Toggle({ on, onChange, label, icon: Icon, t }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderRadius: 10, cursor: "pointer",
        background: on ? t.accentSoft : "transparent", transition: "all 0.2s ease", boxSizing: "border-box",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 550, color: on ? t.accent : t.fgSoft, fontFamily: "'DM Sans', sans-serif" }}>
        {Icon && <Icon size={15} strokeWidth={2} />}{label}
      </span>
      <Switch.Root
        checked={on}
        onCheckedChange={onChange}
        onClick={e => e.stopPropagation()}
        className="rf-static"
        style={{
          width: 36, height: 20, borderRadius: 10, padding: 2, flexShrink: 0,
          background: on ? (t.switchOn ?? t.accent) : t.border, border: "none", cursor: "pointer",
          transition: "background 0.2s ease", display: "flex", alignItems: "center",
          outline: "none",
        }}
      >
        <Switch.Thumb style={{
          display: "block", width: 16, height: 16, borderRadius: 8,
          background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          transition: "transform 0.2s cubic-bezier(0.4,0,0.2,1)",
          transform: on ? "translateX(16px)" : "translateX(0)",
        }} />
      </Switch.Root>
    </div>
  );
});

// Slider keeps the thumb position in local state during drag so it tracks the cursor at native input
// speed regardless of App's render cost. onChange commits the final value upward only on release.
// onLiveChange (optional) fires every tick — used for direct DOM writes (CSS var on the doc wrapper)
// so the document updates AS the user drags without any App state churn.
export const Slider = memo(function Slider({ value, min, max, step, onChange, onLiveChange, label, format, t }) {
  const [localValue, setLocalValue] = useState(value);
  const draggingRef = useRef(false);

  // Sync external value changes (e.g. theme reset) into local state — but never mid-drag.
  useEffect(() => {
    if (!draggingRef.current) setLocalValue(value);
  }, [value]);

  const display = format ? format(localValue) : localValue;

  return (
    <div style={{ padding: "6px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, alignItems: "baseline" }}>
        <span style={{ fontSize: 12, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 11, color: t.accent, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 500, minWidth: 40, textAlign: "right", letterSpacing: "0.04em" }}>{display}</span>
      </div>
      <SliderPrimitive.Root
        value={[localValue]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => {
          draggingRef.current = true;
          setLocalValue(v);
          if (onLiveChange) onLiveChange(v);
        }}
        onValueCommit={([v]) => {
          draggingRef.current = false;
          onChange(v);
        }}
        style={{ position: "relative", display: "flex", alignItems: "center", userSelect: "none", touchAction: "none", height: 24 }}
      >
        <SliderPrimitive.Track style={{ position: "relative", flexGrow: 1, height: 4, borderRadius: 2, background: t.border }}>
          <SliderPrimitive.Range style={{ position: "absolute", height: "100%", borderRadius: 2, background: t.accent }} />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb style={{
          display: "block", width: 14, height: 14, borderRadius: 7, cursor: "grab",
          background: t.accent, boxShadow: `0 0 0 3px ${t.accentSoft}, 0 2px 6px rgba(0,0,0,0.12)`,
          outline: "none",
        }} />
      </SliderPrimitive.Root>
    </div>
  );
});

export function Tip({ label, children, t, side = "top", themeKey }) {
  const c = getTooltipColors(themeKey ?? t.key);
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          avoidCollisions={false}
          style={{
            background: c.bg, color: c.fg,
            padding: "4px 10px", borderRadius: 6,
            fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            userSelect: "none", zIndex: 9999,
          }}
        >
          {label}
          <TooltipPrimitive.Arrow style={{ fill: c.bg }} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const Segment = memo(function Segment({ options, value, onChange, t }) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={v => { if (v) onChange(v); }}
      style={{ display: "flex", gap: 16 }}
    >
      {options.map(opt => {
        const active = value === opt.value;
        const Icon = opt.icon;
        return (
          <Tip key={opt.value} label={opt.label} t={t}>
            <ToggleGroup.Item
              value={opt.value}
              className={active ? "rf-btn-icon-active" : ""}
              style={{
                width: 34, height: 34, borderRadius: 8, border: "none", cursor: "pointer",
                background: active ? t.accent : "transparent",
                color: active ? "#fff" : t.icon,
                display: "flex", alignItems: "center", justifyContent: "center",
                outline: "none", transition: "background 0.15s ease, color 0.15s ease",
              }}
            >
              {Icon && <Icon size={16} strokeWidth={2} />}
            </ToggleGroup.Item>
          </Tip>
        );
      })}
    </ToggleGroup.Root>
  );
});

export function Section({ title, icon: Icon, children, t, open: defaultOpen = true, active = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} style={{ borderBottom: `1px solid ${t.borderSoft}` }}>
      <Collapsible.Trigger asChild>
        <button className="rf-static" style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 14px", border: "none", cursor: "pointer", background: "transparent", color: t.fg,
          outline: "none",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 10.5, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", color: t.fgSoft }}>
            <Icon size={13} strokeWidth={2.2} style={{ color: t.accent }} />{title}
            {/* Active-setting dot — appears when this section has a toggle
                or non-default state in use, so users can spot it at a glance
                in the collapsed panel without expanding every section to
                find what they left on. Subtle accent ring matches the
                notification-badge metaphor without shouting. */}
            {active && (
              <span
                aria-label="Settings active in this section"
                title="Settings active in this section"
                style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: t.accent,
                  boxShadow: `0 0 0 2px ${t.accentSoft}`,
                  marginLeft: 2,
                  flexShrink: 0,
                }}
              />
            )}
          </span>
          <ChevronDown size={14} style={{ color: t.icon, transform: open ? "rotate(0)" : "rotate(-90deg)", transition: "transform 320ms cubic-bezier(0.4, 0, 0.2, 1)" }} />
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content className="rf-collapsible-content">
        <div style={{ paddingBottom: 10 }}>{children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export function FontPicker({ value, onChange, t }) {
  const cur = FONTS.find(f => f.name === value);
  return (
    <div style={{ padding: "4px 12px" }}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="rf-static" style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface,
            cursor: "pointer", color: t.fg, fontSize: 13, fontFamily: cur?.css, fontWeight: 500,
            boxSizing: "border-box", outline: "none",
          }}>
            {value}
            <ChevronDown size={14} style={{ color: t.icon }} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="center"
            sideOffset={4}
            style={{
              background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, overflow: "hidden",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)", outline: "none",
              minWidth: "var(--radix-dropdown-menu-trigger-width)", zIndex: 200,
            }}
          >
            {FONTS.map(f => (
              <DropdownMenu.Item
                key={f.name}
                onSelect={() => onChange(f.name)}
                onMouseEnter={e => e.currentTarget.style.background = value === f.name ? t.accentSoft : t.surfaceHover}
                onMouseLeave={e => e.currentTarget.style.background = value === f.name ? t.accentSoft : "transparent"}
                style={{
                  padding: "10px 14px", cursor: "pointer", outline: "none", userSelect: "none",
                  background: value === f.name ? t.accentSoft : "transparent",
                  color: value === f.name ? t.accent : t.fg,
                  fontFamily: f.css, fontSize: 14, fontWeight: 500,
                }}
              >
                {f.name}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
