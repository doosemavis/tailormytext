// marketingThemeVars(t) — maps an active theme token object (the shape
// from THEMES[key] in src/config/constants.js) into the CSS custom
// properties that the .tmt-marketing scope reads from.
//
// Spread the result into a .tmt-marketing wrapper's `style` prop and
// the editorial design (Fraunces/Newsreader/Plex Mono typography,
// paper-card surfaces, terra/sage/sand accents) re-skins itself to
// the active theme's colors. Without this, .tmt-marketing falls back
// to the fixed cream palette defined in global.css.
//
// Usage:
//   <Dialog.Content
//     className="tmt-marketing"
//     style={{ ...marketingThemeVars(t), background: "var(--tmt-paper-card)", ... }}
//   >
//
// The function returns a fresh object so React style-prop equality
// doesn't trip; cheap enough that memoizing isn't worth the complexity.
export function marketingThemeVars(t) {
  return {
    "--tmt-paper":      t.bg,
    "--tmt-paper-deep": t.surface,
    "--tmt-paper-card": t.surface,
    "--tmt-ink":        t.fg,
    "--tmt-ink-soft":   t.fgSoft,
    "--tmt-ink-muted":  t.icon,
    "--tmt-rule":       t.border,
    "--tmt-terra":      t.accent,
    "--tmt-terra-deep": t.accent,
  };
}
