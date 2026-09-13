import { memo, useMemo, useCallback, useRef, useEffect } from "react";
import { paragraphHtml } from "../utils/paragraphHtml";
import { registerSection, unregisterSection } from "../utils/sectionMaterializer";

// CONTRACT: consumes Section[] per docs/architecture/PARSER_CONTRACT.md.
// Paragraph markup (words, emphasis, lists, inline headings, size ratios) is
// built as an HTML string by utils/paragraphHtml.js and written once per
// paragraph via innerHTML. React therefore holds one fiber per paragraph
// rather than one per word: on Don Quixote that is ~8,400 fibers instead of
// ~1.5M, which is what kept the JS heap at ~400MB and made every garbage
// collection a multi-second stall. NeuroDiv, HueGuide and the pacer all
// read and mutate that markup through the DOM, never through React.

const DIVIDER_BAR_STYLE = { margin: "calc(var(--rf-line-height, 1.8) * 1.5em) 0", display: "flex", alignItems: "center", gap: 16 };
const DIVIDER_LINE_BASE = { flex: 1, height: 1 };
const DIVIDER_PLAIN_STYLE = { margin: "calc(var(--rf-line-height, 1.8) * 1.5em) 0", height: 1 };
const TITLE_WRAP_STYLE = { marginBottom: "calc(var(--rf-line-height, 1.8) * 0.8em)" };
const TYPE_LABEL_STYLE = { fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" };
const INNER_STYLE = { textAlign: "var(--rf-text-align, left)" };

// neuroDivIntensity is read from `intensityRef.current` (stable ref identity)
// instead of being passed as a prop, so the memo'd Paragraph never re-renders
// on intensity changes — useEnhancements pushes new bold slices to the DOM.
//
// The markup is written through a ref callback rather than
// dangerouslySetInnerHTML so React never retains the generated string in
// props (~50MB across a 420K-word book); it is garbage the moment it lands
// in the DOM. `renderedSource` remembers which paragraph text an element
// currently shows, so a changed `para` (chapter-break edits) re-renders it.
const renderedSource = new WeakMap();
const Paragraph = memo(function Paragraph({ para, idx, intensityRef }) {
  const attach = useCallback((el) => {
    if (!el || renderedSource.get(el) === para) return;
    el.innerHTML = paragraphHtml(para, intensityRef.current);
    renderedSource.set(el, para);
  }, [para, intensityRef]);
  return <div className="rf-para" data-idx={idx} ref={attach} />;
});

const Section = memo(function Section({ section, si, settings, intensityRef, sectionRefs, titleRefs }) {
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

  const { fg, fgSoft, border } = settings;
  const isPage = section.type === "page";
  const typeLabel = isPage ? `Page ${section.number}` : null;
  // Prefer the original document's measured ratio so a 2.25× h1 stays
  // 2.25× whatever body size the user picks. Fall back to the default
  // page/chapter scale when the parser couldn't measure.
  const titleScale = section.titleSizeRatio ?? (isPage ? 1.4 : 1.5);

  // Always show a chapter heading. Three tiers:
  //   1. section.title (set by the parser from TOC or first h1/h2/h3)
  //   2. promote first body line if it matches a chapter-heading pattern
  //      (and strip it from content so we don't render it twice)
  //   3. synthesize "Chapter N" / "Page N" — matches the dropdown label
  const { effectiveTitle, effectiveContent } = useMemo(() => {
    if (section.title) {
      return { effectiveTitle: section.title, effectiveContent: section.content };
    }
    const lines = section.content.split(/\n/);
    const firstLine = lines[0]?.trim();
    if (firstLine && /^(chapter|part|section|act|book|volume)\b/i.test(firstLine) && firstLine.length < 80) {
      return { effectiveTitle: firstLine, effectiveContent: lines.slice(1).join("\n").trim() };
    }
    const num = section.number || si + 1;
    return { effectiveTitle: isPage ? `Page ${num}` : `Chapter ${num}`, effectiveContent: section.content };
  }, [section.title, section.content, section.number, isPage, si]);

  const paras = useMemo(() => effectiveContent.split(/\n\s*\n/).filter(p => p.trim()), [effectiveContent]);

  // Windowed body: paragraphs are written into bodyRef by the materializer
  // only while this section is near the viewport (see sectionMaterializer).
  const bodyRef = useRef(null);
  useEffect(() => {
    const sectionEl = nodeRef.current;
    const bodyEl = bodyRef.current;
    if (!sectionEl || !bodyEl) return;
    registerSection({ sectionEl, bodyEl, paras, baseIdx: si * 10000, getIntensity: () => intensityRef.current });
    return () => unregisterSection(sectionEl);
  }, [paras, si, intensityRef]);

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
        {/* Title fade-in is a CSS animation on the wrapper (.rf-chapter-reveal). */}
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
      <div ref={bodyRef} className="rf-section-body" />
    </div>
  );
});

const DocumentBody = memo(function DocumentBody({ text, docSections, hasSections, wrapperRef, featureClassRef, settings, intensityRef, focusModeRef, setFocusPara, sectionRefs, titleRefs }) {
  const { fg } = settings;

  // Focus mode: one delegated listener instead of a handler per paragraph.
  // mouseover fires for every element the pointer crosses, so de-duplicate
  // on the paragraph index to match the old per-paragraph mouseenter.
  const lastHoverIdxRef = useRef(-1);
  const onMouseOver = useCallback((e) => {
    if (!focusModeRef.current) return;
    const target = e.target;
    const para = target && typeof target.closest === "function" ? target.closest(".rf-para") : null;
    if (!para) return;
    const idx = Number(para.dataset.idx);
    if (!Number.isFinite(idx) || idx === lastHoverIdxRef.current) return;
    lastHoverIdxRef.current = idx;
    setFocusPara(idx);
  }, [focusModeRef, setFocusPara]);
  const onMouseLeave = useCallback(() => { lastHoverIdxRef.current = -1; }, []);

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
      <div ref={featureClassRef} style={INNER_STYLE} onMouseOver={onMouseOver} onMouseLeave={onMouseLeave}>
        {hasSections && docSections ? (
          docSections.map((section, si) => (
            <Section
              key={si}
              section={section}
              si={si}
              settings={settings}
              intensityRef={intensityRef}
              sectionRefs={sectionRefs}
              titleRefs={titleRefs}
            />
          ))
        ) : (
          paragraphs.map((p, i) => (
            <Paragraph key={i} para={p} idx={i} intensityRef={intensityRef} />
          ))
        )}
      </div>
    </div>
  );
});

export default DocumentBody;
