export const THEMES = {
  // Light themes — accents darkened for 4.5:1+ contrast; fgSoft deepened for legibility under monochromacy
  // switchOn: color-wheel complement of accent, used for switch track when toggled on
  warm:     { bg: "#FDFAF5", reader: "#FFFCF7", fg: "#1C0C04", fgSoft: "#5A4030", accent: "#A85E14", accentSoft: "#A85E1422", surface: "#F5EDE0", surfaceHover: "#EDE3D2", border: "#E8DCC8", borderSoft: "#F0E8D8", icon: "#7A6040", switchOn: "#1478A8" },
  cool:     { bg: "#F6F8FB", reader: "#FAFBFD", fg: "#0C1220", fgSoft: "#3A5068", accent: "#1556A8", accentSoft: "#1556A822", surface: "#EBF0F7", surfaceHover: "#DCE4EF", border: "#D0DAE7", borderSoft: "#E4EAF2", icon: "#4A6A8A", switchOn: "#A85714" },
  sepia:    { bg: "#F1EADB", reader: "#F7F1E4", fg: "#281606", fgSoft: "#5A4830", accent: "#6A4A08", accentSoft: "#6A4A0822", surface: "#E8DFCC", surfaceHover: "#DDD2BC", border: "#D4C5A9", borderSoft: "#E0D6C0", icon: "#7A6445", switchOn: "#08406A" },
  // forest: pure green → teal-shifted so deuteranopes (green→yellow) still distinguish it from warm/sepia
  forest:   { bg: "#F2F7F2", reader: "#F7FAF7", fg: "#081808", fgSoft: "#2E542E", accent: "#006652", accentSoft: "#00665222", surface: "#E4EEE4", surfaceHover: "#D5E7D5", border: "#C3D9C3", borderSoft: "#D8E8D8", icon: "#3A7060", switchOn: "#660014" },
  // crimson: pure red → vermilion so protanopes (red→near-black) can still see it via orange luminance
  crimson:  { bg: "#FBF5F5", reader: "#FEF9F9", fg: "#180404", fgSoft: "#582020", accent: "#B83000", accentSoft: "#B8300022", surface: "#F2E4E4", surfaceHover: "#EAD5D5", border: "#DFC0C0", borderSoft: "#ECCECE", icon: "#804040", switchOn: "#0088B8" },
  // Dark themes — fgSoft lightened so achromats perceive sufficient luminance step from bg
  // switchOn colors brightened for visibility on dark backgrounds
  phosphor: { bg: "#080806", reader: "#0D0D09", fg: "#EAE2A8", fgSoft: "#B0A878", accent: "#00C132", accentSoft: "#00C13222", surface: "#141410", surfaceHover: "#1C1C14", border: "#2A2818", borderSoft: "#1E1C10", icon: "#989060", switchOn: "#C43298" },
  // jungle: pure bright green → teal so deuteranopes distinguish it from phosphor's yellow-shifted green
  jungle:   { bg: "#0D1410", reader: "#111A14", fg: "#D4E8D4", fgSoft: "#90B890", accent: "#00C4A0", accentSoft: "#00C4A022", surface: "#172019", surfaceHover: "#1E2C20", border: "#243428", borderSoft: "#1C2A1E", icon: "#5A9880", switchOn: "#D6405A" },
  dark:     { bg: "#111116", reader: "#18181E", fg: "#ECEAE4", fgSoft: "#A8A4B4", accent: "#E8A94E", accentSoft: "#E8A94E22", surface: "#222230", surfaceHover: "#2E2E3E", border: "#2E2E3E", borderSoft: "#252535", icon: "#8A8898", switchOn: "#5590E0" },
  midnight: { bg: "#0B0E14", reader: "#0F1219", fg: "#D8E2EA", fgSoft: "#8EA8BE", accent: "#58A6FF", accentSoft: "#58A6FF22", surface: "#161B22", surfaceHover: "#1C2230", border: "#21262D", borderSoft: "#1A1F27", icon: "#5A7898", switchOn: "#E09040" },
  obsidian: { bg: "#100E18", reader: "#15131F", fg: "#E8E4F8", fgSoft: "#ACA4C8", accent: "#A78BFA", accentSoft: "#A78BFA22", surface: "#1E1A2E", surfaceHover: "#272340", border: "#2E2844", borderSoft: "#231F38", icon: "#8878B0", switchOn: "#90C020" },
};

export const PALETTES = {
  sunset:   { label: "Sunset",   colors: ["#FF6B6B","#FF8E53","#FFC853","#FFE66D","#A8E6CF"] },
  ocean:    { label: "Ocean",    colors: ["#0077B6","#00B4D8","#48CAE4","#90E0EF","#ADE8F4"] },
  forest:   { label: "Forest",   colors: ["#2D6A4F","#40916C","#52B788","#74C69D","#B7E4C7"] },
  lavender: { label: "Lavender", colors: ["#7B2D8E","#9B59B6","#BB8FCE","#D2B4DE","#EBDEF0"] },
  ember:    { label: "Ember",    colors: ["#D62828","#E85D04","#F48C06","#FAA307","#FCBF49"] },
  mono:     { label: "Mono",     colors: ["#333","#555","#777","#999","#BBB"] },
  // Colorblind-safe gradients sampled from established CVD-friendly
  // colormaps. Each stays distinguishable across deuteranopia,
  // protanopia, and tritanopia by combining hue shift with monotonic
  // luminance — so even when hue collapses for a given vision type,
  // the lightness gradient still cues word position across a line.
  aurora:   { label: "Aurora",   colors: ["#440154","#3B528B","#21918C","#5EC962","#FDE725"], cvdSafe: true }, // Viridis
  beacon:   { label: "Beacon",   colors: ["#00224E","#404C6B","#7C7B78","#B6A565","#FEE838"], cvdSafe: true }, // Cividis
  prism:    { label: "Prism",    colors: ["#0072B2","#56B4E9","#009E73","#F0E442","#E69F00"], cvdSafe: true }, // Okabe-Ito
  vivid:    { label: "Vivid",    colors: ["#4477AA","#66CCEE","#228833","#CCBB44","#EE6677"], cvdSafe: true }, // Tol Bright
};

export const GUIDE_COLORS = {
  yellow: { label: "Yellow", highlight: "rgba(255,235,59,0.38)", underline: "#FFD600", dot: "#FFD600" },
  blue:   { label: "Blue",   highlight: "rgba(66,165,245,0.32)",  underline: "#42A5F5", dot: "#42A5F5" },
  green:  { label: "Green",  highlight: "rgba(102,187,106,0.32)", underline: "#66BB6A", dot: "#66BB6A" },
  pink:   { label: "Pink",   highlight: "rgba(236,64,122,0.28)",  underline: "#EC407A", dot: "#EC407A" },
  orange: { label: "Orange", highlight: "rgba(255,167,38,0.35)",  underline: "#FFA726", dot: "#FFA726" },
  purple: { label: "Purple", highlight: "rgba(171,71,188,0.30)",  underline: "#AB47BC", dot: "#AB47BC" },
  accent: { label: "Theme",  highlight: null, underline: null, dot: null },
};

export const FONTS = [
  { name: "Literata",              css: "'Literata', Georgia, serif",         href: "Literata:ital,wght@0,400;0,600;0,700;1,400" },
  { name: "Atkinson Hyperlegible", css: "'Atkinson Hyperlegible', sans-serif", href: "Atkinson+Hyperlegible:wght@400;700" },
  { name: "IBM Plex Serif",       css: "'IBM Plex Serif', serif",            href: "IBM+Plex+Serif:ital,wght@0,400;0,600;0,700;1,400" },
  { name: "Source Sans 3",        css: "'Source Sans 3', sans-serif",         href: "Source+Sans+3:wght@400;600;700" },
  { name: "Merriweather",         css: "'Merriweather', serif",              href: "Merriweather:ital,wght@0,400;0,700;1,400" },
  { name: "OpenDyslexic",         css: "'OpenDyslexic', sans-serif",          href: null },
  { name: "Arial",                css: "Arial, 'Helvetica Neue', Helvetica, sans-serif", href: null },
  { name: "Helvetica",            css: "'Helvetica Neue', Helvetica, Arial, sans-serif", href: null },
  { name: "Verdana",              css: "Verdana, Geneva, Tahoma, sans-serif", href: null },
  { name: "Geist Mono",           css: "'Geist Mono', ui-monospace, monospace", href: "Geist+Mono:wght@400;500;600;700" },
];

export const FREE_UPLOAD_LIMIT = 3;
export const TRIAL_DAYS = 14;
export const MAX_RECENT_DOCS = 5;

// Sidebar panel geometry. The inner content wrapper is sized to fit beside the
// thin scrollbar (see .rf-side-scroll in global.css) so nothing clips on the
// right when the scrollbar is present; the 1px accounts for the panel border.
export const SIDEBAR_WIDTH = 296;
export const SIDEBAR_SCROLLBAR_WIDTH = 6;
export const SIDEBAR_CONTENT_WIDTH = SIDEBAR_WIDTH - 1 - SIDEBAR_SCROLLBAR_WIDTH;

// Phase 3 of the parser rewrite. When true, .md uploads go through
// parseMarkdownTokens (marked.lexer + adapter). When false, they go
// through the legacy parseMarkdownStructured (regex preprocessor +
// detectTextStructure). Both paths emit the same Section[] shape per
// PARSER_CONTRACT.md so the renderer is unaffected by the flip.
//
// Flag exists to allow a fast rollback if the new parser regresses on
// real-world Markdown after deploy. Task 3.4 (deferred) removes the
// legacy path after a soak period with the flag on.
export const USE_MARKDOWN_TOKEN_PARSER = true;

// Supabase plan caps for the AdminPanel capacity widgets. Bump together
// when promoting Free → Pro (1 GB → 100 GB storage; 500 MB → 8 GB DB).
//
// Storage:  Free 1 * 1024**3 = 1073741824
//           Pro  100 * 1024**3 = 107374182400
// Database: Free 500 * 1024**2 = 524288000
//           Pro  8 * 1024**3 = 8589934592
export const SUPABASE_STORAGE_LIMIT_BYTES = 1 * 1024 * 1024 * 1024;
export const SUPABASE_STORAGE_PLAN_LABEL = "Free (1 GB)";
export const SUPABASE_DB_LIMIT_BYTES = 500 * 1024 * 1024;
export const SUPABASE_DB_PLAN_LABEL = "Free (500 MB)";

// Pro tier pricing. Single source of truth — used by PricingModal,
// SubscriptionModal, and any future Stripe Price ID mapping in Phase 9.
// `effectiveMonthly` is just for the marketing string ("billed annually").
export const PRICING = {
  monthly: { amount: 5,  period: "month", label: "$5/month",  display: "$5",  unit: "month" },
  annual:  { amount: 45, period: "year",  label: "$45/year",  display: "$45", unit: "year",  effectiveMonthly: "$3.75/mo" },
};

export const DEMO_TEXT = `Chapter 1: The Science of Reading

In an age of constant digital distraction, the ability to read deeply and attentively has become one of the most valuable skills a person can cultivate. Deep reading is not merely the act of scanning words on a page — it is an immersive cognitive experience that engages memory, imagination, and critical analysis simultaneously.

Research in cognitive neuroscience has shown that sustained reading activates complex neural networks across both hemispheres of the brain. The left hemisphere processes language and logic, while the right hemisphere contributes emotional understanding and visual imagination. Together, they create a rich internal experience that no other medium can replicate.

Chapter 2: Visual Anchoring

The concept of "bionic reading" — where the first portion of each word is bolded to create visual anchors — emerged from research into how the eye moves during reading. Our eyes don't flow smoothly across text; instead, they make rapid jumps called saccades, landing on fixation points roughly every seven to nine characters.

Color-gradient line tracking is another technique rooted in accessibility research. By subtly shifting hue across each line of text, readers gain an additional spatial cue that helps prevent line-skipping.

Chapter 3: Typography and Comfort

Typography itself plays a crucial role in reading comfort. Line height, letter spacing, and column width all affect how easily the eye can track across and between lines. Research suggests that optimal line length falls between 50 and 75 characters.

Focus modes that dim surrounding paragraphs leverage a psychological principle called selective attention. By reducing visual noise around the current paragraph, the reader's cognitive resources can be more fully directed toward comprehension.

Chapter 4: The Future of Reading

The future of reading technology lies not in replacing the book, but in making the reading experience more accessible and adaptable. Every reader's brain is different, and the best reading tools are those that bend to the reader — not the other way around.`;
