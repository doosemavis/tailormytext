// Cosmetic features that are gated behind Pro. Free users see them but
// can't apply them — clicking opens the PricingModal instead.
//
// Accessibility-impacting features (fonts) are intentionally NOT gated.
// Atkinson Hyperlegible and OpenDyslexic exist to help users with reading
// difficulties; locking them behind a paywall would be discriminatory.

export const FREE_THEMES = ["warm", "cool", "dark", "midnight"];
export const FREE_PALETTES = ["mono", "sunset"];
export const FREE_GUIDE_COLORS = ["yellow", "blue", "accent"];

export const isThemeFree = (key) => FREE_THEMES.includes(key);
export const isPaletteFree = (key) => FREE_PALETTES.includes(key);
export const isGuideColorFree = (key) => FREE_GUIDE_COLORS.includes(key);

// WPM Pacer is free for everyone up to this ceiling; faster is Pro. The
// pacer itself is an accessibility aid, so the feature is never gated —
// only the top of the speed range is.
export const PACER_FREE_MAX_WPM = 400;
export const clampWpmForTier = (wpm, isPro) =>
  isPro ? wpm : Math.min(wpm, PACER_FREE_MAX_WPM);
