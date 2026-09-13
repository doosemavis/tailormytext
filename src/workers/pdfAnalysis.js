// CONTRACT: produces Section[] per docs/architecture/PARSER_CONTRACT.md.
// type:"chapter" (outline-derived) or "page" (per-page fallback).
// Sets titleSizeRatio when measurable. Embeds {r:RATIO} line markers
// in content so the renderer preserves font-size hierarchy.
//
// Worker-side PDF analysis. Imported by src/workers/parser.worker.js.
//
// Same heuristics as the original (main-thread) parsePDF.js — column
// histograms, font tier analysis, line stitching, hyphenation, page-chrome
// stripping — but NO pdf.js orchestration. Main thread does pdf.js (load
// lib, getDocument, page.getTextContent, outline destination resolution) and
// posts raw text-content data here for analysis. Keeps the heavy regex/loop
// work off the main thread so the loader animation doesn't stutter.
//
// Entry point: `analyzePDF({ rawPages, resolvedOutline, debug })`.
//
// pdf.js text-content items expose:
//   item.str        — the text fragment
//   item.transform  — affine matrix; transform[4] = x, transform[5] = y
//   item.height     — font height in user units (≈ font size)
//   item.width      — text width in user units
//   item.fontName   — internal font ID (resolves via tc.styles[fontName])
// Items aren't always in reading order, so we group by line (same y) and
// sort within page before stitching.

const TITLE_FONT_RATIO = 1.35;
const PARAGRAPH_GAP_RATIO = 1.7;
const SAME_LINE_Y_TOLERANCE = 1.5;
const HEADER_FOOTER_THRESHOLD = 0.3;       // text on ≥30% of pages = running header/footer
const MIN_PAGES_FOR_REPEAT_DETECTION = 2;  // even 2-page docs benefit from repeat-stripping
const MIN_REPEAT_PAGES = 2;                // text must appear on ≥2 pages to be flagged
const COL_HISTOGRAM_BIN = 10;              // pt per histogram bin for column detection
const COL_MIN_PEAK_PCT = 0.10;             // a column-start peak must contain ≥10% of items
const COL_MIN_GAP = 50;                    // peaks closer than this aren't separate columns
const BANNER_WIDTH_RATIO = 1.5;            // item wider than column × this = page-spanning banner
const BOLD_LINE_PCT = 0.6;                 // ≥60% of items bold → treat the whole line as bold
const SUBHEAD_SIZE_RATIO = 1.01;           // bold line ≥1% larger than body counts as a sub-heading
const SHORT_BOLD_MAX_WORDS = 12;           // body-size mostly-bold line ≤N words → also a sub-heading
const SHORT_BOLD_MIN_RATIO = 0.7;          // …and ≥70% of its characters must be bold
const INDENT_BULLET_MIN = 8;               // pt past body-baseline = bullet item
const INDENT_BULLET_MAX = 80;              // beyond this it's probably a separate column, not a bullet
const BASELINE_MIN_REPEATS = 3;            // a left-x must occur ≥N times to qualify as the body baseline

// Bullet glyphs PDFs use for unordered list items. Pdf.js usually emits
// the bullet as its own text item, so by the time the line is stitched
// it appears as a leading character followed by the body text.
const BULLET_GLYPH_RE = /^\s*([•·‣⁃◦▪▫■□○●◌◯◆◇★☆►▸▶❖✦✧♦])\s+/;
const ASCII_BULLET_RE = /^\s*([*+])\s+/;
const NUMBERED_LIST_RE = /^\s*(\d{1,3})[.)]\s+/;

function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─────────────────────────────────────────────────────────────────────
// Item enrichment — attaches isBold from font metadata
// ─────────────────────────────────────────────────────────────────────

// Identify bold/semibold runs by font family name. Most PDFs use
// "Times-Bold", "Helvetica-Bold", "Arial,Bold" etc. Web-to-PDF tools
// also use weight numbers like "OpenSans-700" or "Roboto-Medium".
// We treat weight ≥ 500 as "bold enough" for sub-heading detection —
// designers commonly use Medium/SemiBold for in-paragraph hierarchy.
const BOLD_FONT_RE = /(\bbold\b|\bbd\b|\bheavy\b|\bblack\b|\b(500|600|700|800|900)\b|extrabold|ultrabold|extra-?bold|ultra-?bold|semibold|semi-?bold|demibold|demi-?bold|\bmedium\b)/i;
// Italic / oblique. Folded into the same isBold flag downstream because
// our renderer currently treats both as "emphasized" — keeping visual
// distinction is more important than the bold-vs-italic semantic.
const ITALIC_FONT_RE = /(italic|oblique|\bit\b)/i;

function isEmphasisFont(fontFamily, fontName) {
  return BOLD_FONT_RE.test(fontFamily) || BOLD_FONT_RE.test(fontName)
      || ITALIC_FONT_RE.test(fontFamily) || ITALIC_FONT_RE.test(fontName);
}

// Transform matrix: [scaleX, skewY, skewX, scaleY, tx, ty]. PDFs that
// fake italic by skewing upright glyphs leave a non-zero skewX (~0.2
// for ~11° slant). True italic fonts have skewX≈0 — they slant via
// glyph outlines instead.
const ITALIC_SKEW_THRESHOLD = 0.05;

function detectItemEmphasis(it, styles) {
  const style = styles?.[it.fontName];
  const fontFamily = style?.fontFamily || "";
  const fontName = it.fontName || "";
  const isBold = BOLD_FONT_RE.test(fontFamily) || BOLD_FONT_RE.test(fontName);
  const skewX = Math.abs(it.transform?.[2] || 0);
  const isItalic = ITALIC_FONT_RE.test(fontFamily) || ITALIC_FONT_RE.test(fontName) || skewX > ITALIC_SKEW_THRESHOLD;
  return { isBold, isItalic };
}

function enrichItems(items, styles) {
  return items.map(it => ({ ...it, ...detectItemEmphasis(it, styles) }));
}

// Document-wide font usage. PDFs that hide bold/italic in custom font
// subsets (so the name doesn't contain "Bold"/"Italic") still expose
// the variant as a *different* fontName. The font that owns the most
// characters is the body face; minority fonts at body size are the
// emphasis variants — mark their items as bold so they re-emphasize.
function analyzeFontUsage(rawPageData) {
  const fontChars = new Map();
  for (const pd of rawPageData) {
    for (const line of pd.lines) {
      for (const it of line.items) {
        if (!it.fontName) continue;
        fontChars.set(it.fontName, (fontChars.get(it.fontName) || 0) + (it.str?.length || 0));
      }
    }
  }
  const sorted = [...fontChars.entries()].sort((a, b) => b[1] - a[1]);
  return { primary: sorted[0]?.[0] || null, primaryCount: sorted[0]?.[1] || 0, all: fontChars };
}

export function markMinorityFontsAsEmphasis(rawPageData, fontUsage) {
  const { primary, primaryCount, all } = fontUsage;
  if (!primary || primaryCount === 0) return rawPageData;
  const MINORITY_RATIO = 0.5; // a font used <50% as much as primary = emphasis variant
  return rawPageData.map((pd) => ({
    ...pd,
    lines: pd.lines.map((line) => ({
      ...line,
      items: line.items.map((it) => {
        // Already classified by regex/skew — don't overwrite italic with bold.
        if (it.isBold || it.isItalic) return it;
        if (!it.fontName || it.fontName === primary) return it;
        const usage = all.get(it.fontName) || 0;
        if (usage / primaryCount < MINORITY_RATIO) return { ...it, isBold: true };
        return it;
      }),
    })),
  }));
}

// ─────────────────────────────────────────────────────────────────────
// Multi-column detection — histogram of left x-coords identifies the
// start of each column. Page-spanning items (e.g. article headlines)
// are detected by abnormal item width and emitted as a banner block
// before column processing.
// ─────────────────────────────────────────────────────────────────────

function detectColumns(items, pageWidth) {
  const meaningful = items.filter(it => it.str && it.str.trim().length >= 2);
  if (meaningful.length < 12) return [{ start: 0, end: pageWidth }];

  const bins = new Map();
  for (const it of meaningful) {
    const bin = Math.floor(it.transform[4] / COL_HISTOGRAM_BIN) * COL_HISTOGRAM_BIN;
    bins.set(bin, (bins.get(bin) || 0) + 1);
  }
  const sorted = [...bins.entries()].sort((a, b) => a[0] - b[0]);
  const minHeight = Math.max(3, meaningful.length * COL_MIN_PEAK_PCT);

  const peaks = [];
  for (let i = 0; i < sorted.length; i++) {
    const [x, count] = sorted[i];
    if (count < minHeight) continue;
    const prev = i > 0 ? sorted[i - 1][1] : 0;
    const next = i < sorted.length - 1 ? sorted[i + 1][1] : 0;
    if (count >= prev && count >= next) peaks.push(x);
  }

  // Collapse peaks that are too close to be different columns.
  const cols = [];
  for (const x of peaks) {
    if (cols.length === 0 || x - cols[cols.length - 1] >= COL_MIN_GAP) cols.push(x);
  }

  if (cols.length <= 1) return [{ start: 0, end: pageWidth }];

  return cols.map((c, i) => ({
    start: c,
    end: i + 1 < cols.length ? cols[i + 1] - 5 : pageWidth,
  }));
}

// Sort items into per-column buckets + a banner bucket (page-spanning
// items wider than a column × BANNER_WIDTH_RATIO go up top, processed
// before any column).
function bucketItemsByColumn(items, columns) {
  if (columns.length <= 1) return { banner: [], columns: [items] };

  const columnWidth = (columns[0].end - columns[0].start);
  const bannerWidthThreshold = columnWidth * BANNER_WIDTH_RATIO;

  const banner = [];
  const buckets = columns.map(() => []);
  for (const it of items) {
    if ((it.width || 0) > bannerWidthThreshold) {
      banner.push(it);
      continue;
    }
    const cx = it.transform[4] + (it.width || 0) / 2;
    let assigned = false;
    for (let i = 0; i < columns.length; i++) {
      if (cx >= columns[i].start && cx < columns[i].end) {
        buckets[i].push(it);
        assigned = true;
        break;
      }
    }
    if (!assigned) buckets[0].push(it); // fallback to leftmost
  }
  return { banner, columns: buckets };
}

// ─────────────────────────────────────────────────────────────────────
// Line grouping + stitching
// ─────────────────────────────────────────────────────────────────────

function groupIntoLines(items) {
  const buckets = [];
  for (const item of items) {
    if (item.str === undefined) continue;
    const y = item.transform[5];
    let bucket = buckets.find(b => Math.abs(b.y - y) <= SAME_LINE_Y_TOLERANCE);
    if (!bucket) { bucket = { y, items: [] }; buckets.push(bucket); }
    bucket.items.push(item);
  }
  for (const b of buckets) b.items.sort((a, c) => a.transform[4] - c.transform[4]);
  buckets.sort((a, b) => b.y - a.y);
  return buckets;
}

function medianLineGap(lines) {
  const gaps = [];
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i - 1].y - lines[i].y;
    if (gap > 0) gaps.push(gap);
  }
  return median(gaps);
}

// Compute the per-line "word break" gap threshold. PDFs that use char-
// level positioning (each glyph a separate item with small kerning gaps)
// would false-trigger our space insertion if the threshold is constant.
// Scale the threshold to the line's font height so letter-spaced display
// text (e.g. "N E W  Y O R K" with 1pt letter-spacing) doesn't get a
// space inserted between every character.
function wordBreakThreshold(line) {
  const h = lineFontHeight(line);
  return Math.max(0.5, h * 0.22); // ~22% of font height ≈ width of a normal space
}

// Plain text — no formatting markers. Used for title detection and
// repeating-line dedup (so "**Title**" matches "Title").
function lineText(line) {
  const threshold = wordBreakThreshold(line);
  let out = "";
  let prev = null;
  for (const item of line.items) {
    if (prev) {
      const prevEnd = prev.transform[4] + (prev.width || 0);
      const gap = item.transform[4] - prevEnd;
      if (gap > threshold && !out.endsWith(" ") && !item.str.startsWith(" ")) out += " ";
    }
    out += item.str;
    prev = item;
  }
  return out.trim();
}

// Same as lineText but wraps consecutive bold items in **…** and
// italic items in __…__ so the renderer can re-emphasize them. Bold
// is the outer marker, italic the inner — toggle close in reverse
// order to keep the nesting balanced (`**__text__**`).
function lineTextWithBold(line) {
  const threshold = wordBreakThreshold(line);
  let out = "";
  let inBold = false;
  let inItalic = false;
  let prev = null;
  const closeIfDone = (item) => {
    if (inItalic && !item.isItalic) { out += "__"; inItalic = false; }
    if (inBold && !item.isBold) { out += "**"; inBold = false; }
  };
  const openIfNew = (item) => {
    if (item.isBold && !inBold) { out += "**"; inBold = true; }
    if (item.isItalic && !inItalic) { out += "__"; inItalic = true; }
  };
  for (const item of line.items) {
    if (prev) {
      const prevEnd = prev.transform[4] + (prev.width || 0);
      const gap = item.transform[4] - prevEnd;
      if (gap > threshold && !out.endsWith(" ") && !item.str.startsWith(" ")) {
        closeIfDone(item);
        out += " ";
      }
    }
    closeIfDone(item);
    openIfNew(item);
    out += item.str;
    prev = item;
  }
  if (inItalic) out += "__";
  if (inBold) out += "**";
  return out.trim();
}

function lineFontHeight(line) {
  // Filter out zero-height items. pdf-lib (and many real-world PDF
  // exporters) emit empty zero-height "spacer" runs between paragraphs;
  // letting them into the median deflates the line height and makes
  // body text look like a heading by comparison.
  const heights = line.items.map((i) => i.height || 0).filter((h) => h > 0);
  if (heights.length === 0) return 0;
  return median(heights);
}

// X-coord of the leftmost text item on a line. Used for indent-based
// bullet detection (PDFs that draw bullet glyphs as vector shapes
// don't include them in the text stream — the only signal we get is
// that the line starts indented from the body margin).
function lineLeftX(line) {
  let min = Infinity;
  for (const it of line.items) {
    const x = it.transform[4];
    if (x < min) min = x;
  }
  return min === Infinity ? 0 : min;
}

// Per-page body left-margin. Picks the leftmost x-coord that ≥N lines
// share — body text dominates the leftmost column, so the leftmost
// frequent position is the baseline. Indented bullets, blockquotes,
// or right-column text appear as separate, more-indented x positions.
function pageBaselineX(lines) {
  const counts = new Map();
  for (const line of lines) {
    const x = Math.round(lineLeftX(line));
    counts.set(x, (counts.get(x) || 0) + 1);
  }
  const frequent = [...counts.entries()]
    .filter(([, c]) => c >= BASELINE_MIN_REPEATS)
    .sort((a, b) => a[0] - b[0]);
  return frequent[0]?.[0] ?? null;
}

// Character-weighted bold ratio. Some PDFs split a single word into
// per-glyph items; an item-count ratio underweights the actual bold
// span when bold glyphs are individually emitted. Weighting by
// character count gives the visual fraction of bold text on the line.
function lineBoldRatio(line) {
  let totalChars = 0;
  let boldChars = 0;
  for (const it of line.items) {
    const len = (it.str || "").length;
    totalChars += len;
    if (it.isBold) boldChars += len;
  }
  return totalChars > 0 ? boldChars / totalChars : 0;
}

function isLikelyPageNumber(text) {
  return /^(page\s+)?\d{1,4}(\s*[/-]\s*\d{1,4})?$/i.test(text.trim());
}

// ─────────────────────────────────────────────────────────────────────
// Document-wide font tier analysis (improvement #2)
// Build a font-size histogram weighted by character count to find the
// document's body font, then derive heading thresholds from it.
// ─────────────────────────────────────────────────────────────────────

function analyzeDocumentFonts(pageData) {
  const sizeChars = new Map();
  for (const pd of pageData) {
    for (const line of pd.lines) {
      const size = Math.round(lineFontHeight(line) * 10) / 10; // 0.1 pt resolution
      const chars = lineText(line).length;
      sizeChars.set(size, (sizeChars.get(size) || 0) + chars);
    }
  }
  const sorted = [...sizeChars.entries()].sort((a, b) => b[1] - a[1]);
  const body = sorted[0]?.[0] || 12;
  return { body, h1: body * 1.5, h2: body * 1.25, h3: body * 1.1 };
}

// Decide a line's role from its size + bold ratio against the document
// font tiers. Used in the per-page fallback to upgrade subheadings into
// detected titles.
//
// Word count (not item count) drives the "short bold line" check —
// PDF.js may split a single word into per-glyph items, which would
// otherwise inflate `line.items.length` and miss the sub-heading.
function classifyLine(line, tiers) {
  const size = lineFontHeight(line);
  const boldRatio = lineBoldRatio(line);
  const text = lineText(line);
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  if (size >= tiers.h1 * 0.95) return "h1";
  if (size >= tiers.h2 * 0.95) return "h2";
  // Size alone is sufficient when the line is clearly larger than body
  // (≈10%+ bump). Many PDFs export sub-headings as a different font
  // family rather than a bold weight on the body font, so PDF.js's
  // bold flag is unreliable — trust size when the gap is unambiguous.
  if (size >= tiers.h3 * 0.95) return "h3";
  // Smaller size bump but the bold flag was detected — still a heading.
  if (size >= tiers.body * SUBHEAD_SIZE_RATIO && boldRatio >= BOLD_LINE_PCT) return "h3";
  // Body-size but standalone & mostly-bold (e.g. "About Us" in a doc
  // that DOES expose bold) — bounded word count avoids promoting
  // paragraphs that just start with a bold word.
  if (boldRatio >= SHORT_BOLD_MIN_RATIO && wordCount > 0 && wordCount <= SHORT_BOLD_MAX_WORDS) return "h3";
  return "body";
}

// Convert a leading bullet glyph or numbered marker to markdown form so
// the renderer can group consecutive list items into <ul>/<ol>. Leaves
// the rest of the text — including any **bold** spans — intact.
function normalizeListMarker(text) {
  // Some PDFs wrap the bullet glyph itself in bold; unwrap before matching.
  const unwrapped = text.replace(
    /^\*\*\s*([•·‣⁃◦▪▫■□○●◌◯◆◇★☆►▸▶❖✦✧♦])\s*\*\*\s+/,
    "$1 ",
  );
  if (BULLET_GLYPH_RE.test(unwrapped)) return unwrapped.replace(BULLET_GLYPH_RE, "- ");
  if (ASCII_BULLET_RE.test(unwrapped)) return unwrapped.replace(ASCII_BULLET_RE, "- ");
  const num = unwrapped.match(NUMBERED_LIST_RE);
  if (num) return num[1] + ". " + unwrapped.slice(num[0].length);
  return unwrapped;
}

// ─────────────────────────────────────────────────────────────────────
// Repeating-text detection — strips running headers/footers and page
// numbers (improvement #3, retained from prior version)
// ─────────────────────────────────────────────────────────────────────

// Normalize trailing pagination ("foo 1/12" → "foo") and any leading
// page index ("3/12 foo" → "foo") so per-page footer URLs that differ
// only in their N/M suffix collapse to the same string for repeat detection.
function normalizeChromeText(text) {
  return text
    .replace(/\s*\d{1,4}\s*\/\s*\d{1,4}\s*$/, "")
    .replace(/^\s*\d{1,4}\s*\/\s*\d{1,4}\s+/, "")
    .trim();
}

function detectRepeatingLines(pageData) {
  if (pageData.length < MIN_PAGES_FOR_REPEAT_DETECTION) return new Set();
  const counts = new Map();
  const TOP_BOTTOM_N = 2;
  for (const pd of pageData) {
    if (pd.lines.length === 0) continue;
    const sample = [...pd.lines.slice(0, TOP_BOTTOM_N), ...pd.lines.slice(-TOP_BOTTOM_N)];
    for (const line of sample) {
      const text = normalizeChromeText(lineText(line));
      if (!text || text.length > 120) continue;
      counts.set(text, (counts.get(text) || 0) + 1);
    }
  }
  const threshold = Math.max(MIN_REPEAT_PAGES, Math.ceil(pageData.length * HEADER_FOOTER_THRESHOLD));
  const repeating = new Set();
  for (const [text, count] of counts.entries()) {
    if (count >= threshold) repeating.add(text);
  }
  return repeating;
}

function stripPageChrome(lines, repeatingSet) {
  return lines.filter((line, idx) => {
    const text = lineText(line);
    if (!text) return false;
    if (repeatingSet.has(normalizeChromeText(text))) return false;
    const isTopOrBottom = idx === 0 || idx === lines.length - 1;
    if (isTopOrBottom && isLikelyPageNumber(text)) return false;
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────
// Hyphenation join (improvement #4)
// ─────────────────────────────────────────────────────────────────────

function joinHyphenated(text) {
  return text.replace(/([a-zA-Z])-\n([a-z])/g, "$1$2");
}

// ─────────────────────────────────────────────────────────────────────
// Page → content string. Inserts paragraph breaks based on line gap,
// preserves bold via markdown markers, optionally upgrades font-tier
// subheadings to inline ## markdown headings.
// ─────────────────────────────────────────────────────────────────────

// Visual wrap of a bullet's text continues with a lowercase letter
// (because the wrap broke mid-sentence). A new bullet starts with an
// uppercase letter, digit, or punctuation. This is the most reliable
// signal we have because PDF.js doesn't see Lever's drawn bullet glyphs
// — without it, the gap heuristic alone merges every bullet into one.
function isContinuationStart(text) {
  const stripped = text.replace(/^[*_]+/, "").trimStart();
  return /^[a-z]/.test(stripped);
}

// Per-line size marker. Lines within ±3% of body height get no marker
// (they render at the user's chosen body size). Anything outside that
// dead zone gets a `{r:RATIO}` prefix so the renderer can apply
// `font-size: calc(var(--rf-font-size) * RATIO)` and preserve the
// original document's visual hierarchy across user font-size changes.
function sizeRatioMarker(line, fontTiers) {
  if (!fontTiers || !fontTiers.body) return "";
  const h = lineFontHeight(line);
  if (!h) return "";
  const ratio = h / fontTiers.body;
  if (ratio >= 0.97 && ratio <= 1.03) return "";
  return `{r:${ratio.toFixed(2)}}`;
}

function buildPageContent(lines, startLine, pageMedianGap, fontTiers, baselineX) {
  const parts = [];
  // Holds the current bullet's accumulated text. Continuation lines
  // (indented body lines starting lowercase) get appended to it instead
  // of becoming new bullets, so a wrapped bullet renders as one <li>
  // instead of N.
  let bulletBuf = null;
  const flushBullet = () => {
    if (bulletBuf != null) { parts.push(bulletBuf); bulletBuf = null; }
  };

  for (let li = startLine; li < lines.length; li++) {
    const line = lines[li];
    const text = lineTextWithBold(line);
    if (!text) continue;
    const role = fontTiers ? classifyLine(line, fontTiers) : "body";
    const indent = baselineX != null ? lineLeftX(line) - baselineX : 0;
    const indented = baselineX != null && indent > INDENT_BULLET_MIN && indent < INDENT_BULLET_MAX;
    const prev = li > 0 ? lines[li - 1] : null;
    const gap = prev ? prev.y - line.y : 0;
    const isParaBreak = pageMedianGap > 0 && gap > pageMedianGap * PARAGRAPH_GAP_RATIO;

    // Continuation of the current bullet — only when the line starts
    // mid-sentence (lowercase). Uppercase/punctuation/digit starts a
    // new bullet so the next branch handles it.
    if (bulletBuf != null && indented && role === "body" && !isParaBreak && isContinuationStart(text)) {
      bulletBuf += " " + text;
      continue;
    }

    flushBullet();

    if (parts.length > 0) {
      parts.push(isParaBreak || role !== "body" ? "\n\n" : "\n");
    }

    const stripMarkers = (s) => s.replace(/^(\*\*|__)+|(\*\*|__)+$/g, "");
    const ratioMarker = sizeRatioMarker(line, fontTiers);
    if (role === "h2") parts.push(ratioMarker + "## " + stripMarkers(text));
    else if (role === "h3") parts.push(ratioMarker + "### " + stripMarkers(text));
    else if (indented && role === "body") {
      // Strip any glyph-emitted leading bullet, then re-emit as markdown
      // so the renderer can group consecutive items into a single <ul>.
      const cleaned = normalizeListMarker(text).replace(/^- /, "");
      bulletBuf = ratioMarker + "- " + cleaned;
    } else {
      parts.push(ratioMarker + normalizeListMarker(text));
    }
  }
  flushBullet();
  return parts.join("").trim();
}

// ─────────────────────────────────────────────────────────────────────
// PDF outline → flat section list (improvement #1 + #5)
//
// Outline destination resolution (string → page index) requires pdf.js's
// `doc.getDestination` / `doc.getPageIndex` calls, which only work on the
// main thread. The orchestrator there resolves destinations and passes us
// the already-resolved `{ title, page, depth }` entries — this function
// just builds sections from them.
// ─────────────────────────────────────────────────────────────────────

function buildOutlineSections(resolvedOutline, pageData, fontTiers) {
  if (!resolvedOutline || resolvedOutline.length === 0) return null;
  const entries = resolvedOutline.filter(e => e.page !== null && e.page !== undefined).sort((a, b) => a.page - b.page);
  if (entries.length === 0) return null;

  const sections = [];
  for (let e = 0; e < entries.length; e++) {
    const entry = entries[e];
    const startPage = entry.page;
    const endPage = e + 1 < entries.length ? entries[e + 1].page - 1 : pageData.length;

    const contentParts = [];
    for (let p = startPage; p <= endPage; p++) {
      const pd = pageData[p - 1];
      if (!pd) continue;

      let startLine = 0;
      const firstText = pd.lines[0] ? lineText(pd.lines[0]) : "";
      if (p === startPage && firstText && firstText.toLowerCase() === entry.title.toLowerCase()) {
        startLine = 1;
      }
      const baselineX = pageBaselineX(pd.lines);
      const pageContent = buildPageContent(pd.lines, startLine, pd.medianGap, fontTiers, baselineX);
      if (pageContent) contentParts.push(pageContent);
    }

    const content = joinHyphenated(contentParts.join("\n\n").trim());
    if (content) sections.push({ type: "chapter", title: entry.title, number: e + 1, content });
  }
  return sections.length > 0 ? sections : null;
}

// ─────────────────────────────────────────────────────────────────────
// Per-page fallback (no outline available)
// ─────────────────────────────────────────────────────────────────────

function buildPerPageSections(pageData, fontTiers) {
  const sections = [];
  for (const pd of pageData) {
    if (pd.lines.length === 0) continue;

    let title = null;
    let titleSizeRatio = null;
    let bodyStartIdx = 0;
    if (fontTiers) {
      const role = classifyLine(pd.lines[0], fontTiers);
      if (role === "h1" || role === "h2") {
        title = lineText(pd.lines[0]);
        titleSizeRatio = lineFontHeight(pd.lines[0]) / fontTiers.body;
        bodyStartIdx = 1;
      }
    }
    if (!title && pd.lines[bodyStartIdx]) {
      const firstBody = lineText(pd.lines[bodyStartIdx]);
      const m = firstBody.match(/^(chapter\s+[\divxlc]+[.:—\-\s]*.*|part\s+[\divxlc]+[.:—\-\s]*.*|section\s+[\divxlc]+[.:—\-\s]*.*)$/i);
      if (m) { title = m[1].trim(); bodyStartIdx++; }
    }

    const baselineX = pageBaselineX(pd.lines);
    const content = joinHyphenated(buildPageContent(pd.lines, bodyStartIdx, pd.medianGap, fontTiers, baselineX));
    if (!content.trim()) continue;
    sections.push({
      type: "page", title, number: pd.pageNum, content,
      ...(titleSizeRatio != null && { titleSizeRatio }),
    });
  }
  return sections;
}

// ─────────────────────────────────────────────────────────────────────
// Worker entry point
//
// Input shape (posted by main thread):
//   rawPages: [
//     {
//       pageNum: 1,
//       items: [...],          // pdf.js TextContent.items (str, transform, width, height, fontName, hasEOL)
//       styles: {...},         // pdf.js TextContent.styles (fontName → { fontFamily, ... })
//       viewport: { width, height },  // pdf.js viewport @ scale 1
//     }, ...
//   ]
//   resolvedOutline: [
//     { title: "Chapter 1", page: 3, depth: 0 }, ...
//   ] | null
//   debug: boolean (mirrors localStorage 'rf-pdf-debug' on main thread; the
//          worker has no localStorage access of its own)
//
// Returns: same sections[] shape the rest of the app expects
//   [{ type: "chapter" | "page", title, number, content }]
// ─────────────────────────────────────────────────────────────────────

export function analyzePDF({ rawPages, resolvedOutline, debug }) {
  // ── Pre-scan all pages (with bold info + multi-column awareness) ──
  let rawPageData = [];
  for (const raw of rawPages) {
    const items = enrichItems(raw.items, raw.styles);

    const columns = detectColumns(items, raw.viewport.width);
    const { banner, columns: columnBuckets } = bucketItemsByColumn(items, columns);

    // Banner first, then each column sequentially. Each chunk gets its
    // own line grouping/sort so reading order matches the visual flow.
    const bannerLines = groupIntoLines(banner).filter(l => lineText(l));
    const columnLines = columnBuckets.flatMap(b => groupIntoLines(b).filter(l => lineText(l)));
    const lines = [...bannerLines, ...columnLines];

    rawPageData.push({ pageNum: raw.pageNum, lines, medianGap: medianLineGap(lines) });
  }

  // ── Document-wide font usage; mark minority-font items as bold ──
  // Runs before chrome-stripping so the analysis sees every item the
  // PDF emitted (including footers we'll discard for content).
  const fontUsage = analyzeFontUsage(rawPageData);
  rawPageData = markMinorityFontsAsEmphasis(rawPageData, fontUsage);

  // ── Strip running headers/footers + page numbers ──
  const repeatingSet = detectRepeatingLines(rawPageData);
  const pageData = rawPageData.map(pd => ({
    ...pd,
    lines: stripPageChrome(pd.lines, repeatingSet),
  }));

  // ── Document-wide font tiers (used by both outline + fallback paths) ──
  const fontTiers = analyzeDocumentFonts(pageData);

  // ── Optional per-line diagnostics. Worker has no localStorage, so the main
  //    thread reads the flag and passes `debug: true/false` in the message.
  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[rf-pdf] tiers", fontTiers, "primary font:", fontUsage.primary);
    // eslint-disable-next-line no-console
    console.log("[rf-pdf] font usage", Object.fromEntries(fontUsage.all));
    for (const pd of pageData) {
      const baselineX = pageBaselineX(pd.lines);
      const rows = pd.lines.map(line => {
        const x = lineLeftX(line);
        return {
          page: pd.pageNum,
          size: +lineFontHeight(line).toFixed(2),
          vsBody: +(lineFontHeight(line) / fontTiers.body).toFixed(2),
          bold: +lineBoldRatio(line).toFixed(2),
          x: +x.toFixed(0),
          indent: baselineX != null ? +(x - baselineX).toFixed(0) : null,
          role: classifyLine(line, fontTiers),
          text: lineText(line).slice(0, 80),
        };
      });
      // eslint-disable-next-line no-console
      console.log(`[rf-pdf] page ${pd.pageNum} baselineX=${baselineX}`);
      // eslint-disable-next-line no-console
      console.table(rows);
    }
  }

  // ── Prefer the PDF outline when present ──
  if (resolvedOutline && resolvedOutline.length > 0) {
    const outlineSections = buildOutlineSections(resolvedOutline, pageData, fontTiers);
    if (outlineSections) return outlineSections;
  }

  const sections = buildPerPageSections(pageData, fontTiers);
  if (sections.length > 0) return sections;

  // Contract guarantee: never return an empty Section[] (PARSER_CONTRACT.md
  // §1 invariant #1). When every page got stripped to nothing — usually
  // because the PDF only has page-chrome text or the body fell below
  // detection thresholds — synthesize a single "document" section so the
  // reader still has something to show and the upload doesn't silently
  // disappear.
  const fallback = pageData
    .flatMap((pd) => pd.lines.map((line) => lineText(line)))
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return [
    {
      type: "document",
      title: null,
      number: 1,
      content: fallback || "(no readable text)",
    },
  ];
}
