import { memo, useMemo, useCallback, useRef, useEffect } from "react";

// All palettes in src/config/constants.js have exactly 5 colors. We bake
// that into a fixed slot count so per-word color picks resolve to a stable
// CSS-var index (`--rf-hue-0` through `--rf-hue-4`) that's independent of
// which palette is active. App.jsx writes the actual palette colors to
// those vars on the doc wrapper, so changing palette is a 5-property write
// on one element instead of a React re-walk of every paragraph.
const HUE_SLOT_COUNT = 5;

// CONTRACT: consumes Section[] per docs/architecture/PARSER_CONTRACT.md.
// Renders the private pseudo-Markdown content language documented in §2
// of that file (`**bold**`, `__italic__`, `- list`, `1. list`, inline
// `##`/`###` sub-headings, `{r:RATIO}` per-line size markers). The
// title/number/titleSizeRatio fallback chains are documented in §5.

// Split a line into segments by markdown-style **bold** and __italic__
// markers. State-machine pass — each marker toggles its flag and emits
// a new segment with the current flag state, so nested markers
// (`**__bold-italic__**`) are handled correctly.
function splitEmphasis(line) {
  const segments = [];
  let bold = false;
  let italic = false;
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) segments.push({ text: buf, bold, italic });
    buf = "";
  };
  while (i < line.length) {
    if (line[i] === "*" && line[i + 1] === "*") {
      flush();
      bold = !bold;
      i += 2;
    } else if (line[i] === "_" && line[i + 1] === "_") {
      flush();
      italic = !italic;
      i += 2;
    } else {
      buf += line[i];
      i += 1;
    }
  }
  flush();
  return segments;
}

// Flatten a line into a token stream of { text, bold, italic } words,
// preserving per-word emphasis so the renderer can re-emphasize whole
// words instead of splitting markup across NeuroDiv anchors.
function lineToWords(line) {
  const segments = splitEmphasis(line);
  const words = [];
  for (const seg of segments) {
    for (const w of seg.text.split(/\s+/).filter(Boolean)) {
      words.push({ text: w, bold: seg.bold, italic: seg.italic });
    }
  }
  return words;
}

const renderWord = (word, wi, total, neuroDivIntensity, isBold = false, isItalic = false) => {
  const cIdx = total > 1 ? Math.floor((wi / (total - 1)) * (HUE_SLOT_COUNT - 1)) : 0;
  const bl = Math.max(1, Math.round(word.length * neuroDivIntensity));
  // Bold/italic apply on the wrapping span and inherit through the
  // NeuroDiv first-portion <strong> anchor inside.
  return (
    <span key={wi} className="rf-word" style={{
      "--hue-color": `var(--rf-hue-${cIdx})`,
      fontWeight: isBold ? 700 : "inherit",
      fontStyle: isItalic ? "italic" : "inherit",
    }}>
      <strong>{word.slice(0, bl)}</strong>{word.slice(bl)}{" "}
    </span>
  );
};

// Typography-driven dimensions read entirely from CSS custom properties set on the wrapper via ref.
const PARA_STYLE = { marginBottom: "calc(var(--rf-line-height, 1.8) * 0.7em)" };
const LINE_STYLE = { margin: "0 0 0.25em 0" };
const DIVIDER_BAR_STYLE = { margin: "calc(var(--rf-line-height, 1.8) * 1.5em) 0", display: "flex", alignItems: "center", gap: 16 };
const DIVIDER_LINE_BASE = { flex: 1, height: 1 };
const DIVIDER_PLAIN_STYLE = { margin: "calc(var(--rf-line-height, 1.8) * 1.5em) 0", height: 1 };
const TITLE_WRAP_STYLE = { marginBottom: "calc(var(--rf-line-height, 1.8) * 0.8em)" };
const TYPE_LABEL_STYLE = { fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" };
const INNER_STYLE = { textAlign: "var(--rf-text-align, left)" };

// Sub-heading styles emitted for `## …` and `### …` lines (parsers add
// these markers when they detect mid-section font-tier headings).
const H2_INLINE_STYLE = {
  fontSize: "calc(var(--rf-font-size, 18px) * 1.3)",
  fontWeight: 740,
  margin: "calc(var(--rf-line-height, 1.8) * 0.8em) 0 calc(var(--rf-line-height, 1.8) * 0.35em)",
  lineHeight: 1.25,
  letterSpacing: "-0.01em",
};
const H3_INLINE_STYLE = {
  fontSize: "calc(var(--rf-font-size, 18px) * 1.12)",
  fontWeight: 700,
  margin: "calc(var(--rf-line-height, 1.8) * 0.6em) 0 calc(var(--rf-line-height, 1.8) * 0.25em)",
  lineHeight: 1.3,
};

// Per-line size ratio marker (`{r:1.45}`) emitted by the PDF parser.
// Captures original-document font-size relative to body so the renderer
// can preserve visual hierarchy across user font-size changes.
const RATIO_RE = /^\{r:([\d.]+)\}/;
function extractRatio(line) {
  const m = RATIO_RE.exec(line);
  if (!m) return { ratio: null, rest: line };
  const ratio = parseFloat(m[1]);
  return { ratio: Number.isFinite(ratio) && ratio > 0 ? ratio : null, rest: line.slice(m[0].length) };
}
function ratioFontSize(ratio) {
  return `calc(var(--rf-font-size, 18px) * ${ratio})`;
}

const UL_STYLE = {
  margin: "calc(var(--rf-line-height, 1.8) * 0.35em) 0",
  paddingLeft: "1.6em",
  listStyleType: "disc",
};
const OL_STYLE = {
  margin: "calc(var(--rf-line-height, 1.8) * 0.35em) 0",
  paddingLeft: "1.6em",
  listStyleType: "decimal",
};
const LI_STYLE = { margin: "0 0 0.25em 0" };

// Group consecutive markdown bullet (`- …`) and numbered (`1. …`) lines
// into list blocks so the renderer can emit a single <ul>/<ol> with one
// <li> per item. Plain text lines pass through as `line` blocks. The
// optional leading `{r:RATIO}` marker is peeled off here so each item
// carries its own size ratio for the renderer to apply.
function groupListBlocks(lines) {
  const blocks = [];
  for (const line of lines) {
    const { ratio, rest } = extractRatio(line);
    const bullet = /^- (.+)/.exec(rest);
    const numbered = /^(\d{1,3})\. (.+)/.exec(rest);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      const item = { text: bullet[1], ratio };
      if (last && last.kind === "ul") last.items.push(item);
      else blocks.push({ kind: "ul", items: [item] });
    } else if (numbered) {
      const item = { text: numbered[2], ratio };
      if (last && last.kind === "ol") last.items.push(item);
      else blocks.push({ kind: "ol", items: [item], start: parseInt(numbered[1], 10) });
    } else {
      blocks.push({ kind: "line", text: line });
    }
  }
  return blocks;
}

const Paragraph = memo(function Paragraph({ para, idx, neuroDivIntensity, onMouseEnter }) {
  const lines = para.split("\n").filter(l => l.trim());
  const blocks = groupListBlocks(lines);
  return (
    <div className="rf-para" data-idx={idx} onMouseEnter={() => onMouseEnter(idx)} style={PARA_STYLE}>
      {blocks.map((block, bi) => {
        if (block.kind === "ul" || block.kind === "ol") {
          const ListTag = block.kind;
          const listStyle = block.kind === "ul" ? UL_STYLE : OL_STYLE;
          return (
            <ListTag key={bi} style={listStyle} start={block.start}>
              {block.items.map((item, ii) => {
                const words = lineToWords(item.text);
                const liStyle = item.ratio
                  ? { ...LI_STYLE, fontSize: ratioFontSize(item.ratio) }
                  : LI_STYLE;
                return (
                  <li key={ii} style={liStyle}>
                    {words.map((w, wi) => renderWord(w.text, wi, words.length, neuroDivIntensity, w.bold, w.italic))}
                  </li>
                );
              })}
            </ListTag>
          );
        }
        // Extract per-line ratio first, then detect inline headings (## / ###).
        // Heading default fontSize gets overridden when an explicit ratio is
        // present, so the original document hierarchy survives font-size
        // changes in the user panel.
        const { ratio, rest } = extractRatio(block.text);
        let El = "p";
        let style = LINE_STYLE;
        let body = rest;
        if (rest.startsWith("### ")) { El = "h3"; style = H3_INLINE_STYLE; body = rest.slice(4); }
        else if (rest.startsWith("## ")) { El = "h2"; style = H2_INLINE_STYLE; body = rest.slice(3); }
        if (ratio != null) style = { ...style, fontSize: ratioFontSize(ratio) };

        const words = lineToWords(body);
        return (
          <El key={bi} style={style}>
            {words.map((w, wi) => renderWord(w.text, wi, words.length, neuroDivIntensity, w.bold, w.italic))}
          </El>
        );
      })}
    </div>
  );
});

const Section = memo(function Section({ section, si, settings, onParaMouseEnter, sectionRefs, titleRefs }) {
  const nodeRef = useRef(null);
  const titleNodeRef = useRef(null);

  useEffect(() => {
    if (sectionRefs) sectionRefs.current[si] = nodeRef.current;
    if (titleRefs) titleRefs.current[si] = titleNodeRef.current;
    return () => {
      if (sectionRefs) sectionRefs.current[si] = null;
      if (titleRefs) titleRefs.current[si] = null;
    };
  }, [si, sectionRefs, titleRefs]);

  const { fg, fgSoft, border, neuroDivIntensity } = settings;
  const isPage = section.type === "page";
  const typeLabel = isPage ? `Page ${section.number}` : null;
  // Prefer the original document's measured ratio so a 2.25× h1 stays
  // 2.25× whatever body size the user picks. Fall back to the default
  // page/chapter scale when the parser couldn't measure (e.g. outline-
  // derived chapter titles that don't correspond to a single line).
  const titleScale = section.titleSizeRatio ?? (isPage ? 1.4 : 1.5);

  // Always show a chapter heading. Three tiers:
  //   1. section.title (set by the parser from TOC or first h1/h2/h3)
  //   2. promote first body line if it matches a chapter-heading pattern
  //      (and strip it from content so we don't render it twice)
  //   3. synthesize "Chapter N" / "Page N" — matches the dropdown label
  // Tier 3 is the fix for poorly-structured EPUBs where the parser
  // couldn't find a title; without it, picking a chapter from the
  // dropdown landed on the first body sentence with no heading visible.
  const { effectiveTitle, effectiveContent } = useMemo(() => {
    if (section.title) {
      return { effectiveTitle: section.title, effectiveContent: section.content };
    }
    const lines = section.content.split(/\n/);
    const firstLine = lines[0]?.trim();
    if (firstLine && /^(chapter|part|section|act|book|volume)\b/i.test(firstLine) && firstLine.length < 80) {
      return {
        effectiveTitle: firstLine,
        effectiveContent: lines.slice(1).join("\n").trim(),
      };
    }
    const num = section.number || si + 1;
    return {
      effectiveTitle: isPage ? `Page ${num}` : `Chapter ${num}`,
      effectiveContent: section.content,
    };
  }, [section.title, section.content, section.number, isPage, si]);

  const paras = useMemo(() => effectiveContent.split(/\n\s*\n/).filter(p => p.trim()), [effectiveContent]);

  return (
    <div ref={nodeRef} className="rf-section">
      {si > 0 && (typeLabel ? (
        <div style={DIVIDER_BAR_STYLE}>
          <div style={{ ...DIVIDER_LINE_BASE, background: border }} />
          <span style={{ ...TYPE_LABEL_STYLE, color: fgSoft }}>{typeLabel}</span>
          <div style={{ ...DIVIDER_LINE_BASE, background: border }} />
        </div>
      ) : (
        <div style={{ ...DIVIDER_PLAIN_STYLE, background: border }} />
      ))}
      <div ref={titleNodeRef} style={TITLE_WRAP_STYLE}>
        {/* Title fade-in is handled by a CSS animation on the wrapper
            (.rf-chapter-reveal in global.css) — plain text, no per-frame
            RAF gradient computation, much cheaper than the prior sweep. */}
        <h2 style={{
          fontSize: `calc(var(--rf-font-size, 18px) * ${titleScale})`,
          fontWeight: isPage ? 740 : 760,
          color: fg,
          margin: 0,
          lineHeight: isPage ? 1.3 : 1.25,
          fontFamily: "var(--rf-font-family, 'Literata', serif)",
          letterSpacing: isPage ? "-0.01em" : "-0.02em",
        }}>{effectiveTitle}</h2>
      </div>
      {paras.map((p, pi) => (
        <Paragraph
          key={pi}
          para={p}
          idx={si * 10000 + pi}
          neuroDivIntensity={neuroDivIntensity}
          onMouseEnter={onParaMouseEnter}
        />
      ))}
    </div>
  );
});

const DocumentBody = memo(function DocumentBody({ text, docSections, hasSections, wrapperRef, featureClassRef, settings, focusModeRef, setFocusPara, sectionRefs, titleRefs }) {
  const { neuroDivIntensity, fg } = settings;

  const onParaMouseEnter = useCallback((idx) => {
    if (focusModeRef.current) setFocusPara(idx);
  }, [focusModeRef, setFocusPara]);

  const paragraphs = useMemo(() => text.split(/\n\s*\n/).filter(p => p.trim()), [text]);

  const wrapperStyle = useMemo(() => ({
    width: "var(--rf-column-width, 95%)",
    margin: "0 auto",
    padding: "48px 8px 120px",
    fontFamily: "var(--rf-font-family, 'Literata', serif)",
    fontSize: "var(--rf-font-size, 18px)",
    lineHeight: "var(--rf-line-height, 1.8)",
    letterSpacing: "var(--rf-letter-spacing, 0px)",
    wordSpacing: "var(--rf-word-spacing, 0px)",
    color: fg,
    transition: "var(--rf-wrapper-width-transition, width 0.3s ease)",
    boxSizing: "border-box",
  }), [fg]);

  return (
    <div ref={wrapperRef} className="rf-doc-wrapper" style={wrapperStyle}>
      <div ref={featureClassRef} style={INNER_STYLE}>
        {hasSections && docSections ? (
          docSections.map((section, si) => (
            <Section
              key={si}
              section={section}
              si={si}
              settings={settings}
              onParaMouseEnter={onParaMouseEnter}
              sectionRefs={sectionRefs}
              titleRefs={titleRefs}
            />
          ))
        ) : (
          paragraphs.map((p, i) => (
            <Paragraph
              key={i}
              para={p}
              idx={i}
              neuroDivIntensity={neuroDivIntensity}
              onMouseEnter={onParaMouseEnter}
            />
          ))
        )}
      </div>
    </div>
  );
});

export default DocumentBody;
