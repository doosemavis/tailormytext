// Apply user-saved chapter break overrides to a Section[] from the parser.
// See docs/architecture/PARSER_CONTRACT.md for the Section shape.
//
// This is the render-path mirror of EditChaptersModal's interactive editor.
// Both derive the paragraph stream via the same buildParagraphs function so
// the saved break indices (which index into THAT stream) remain valid here.

import { buildParagraphs } from "./paragraphStream";

// applyChapterOverrides(sections, overrides) → Section[]
//
// sections  — parser output, Section[]
// overrides — { breaks: number[], titles: { [paragraphIdx]: string } }
//             Both fields are optional; null/undefined overrides → identity.
//
// Returns a new Section[] shaped per the renderer contract, or the original
// sections array (=== identity) when overrides are absent so callers can use
// reference equality to skip re-renders.
export function applyChapterOverrides(sections, overrides) {
  if (!overrides || !overrides.breaks) return sections;

  const paras = buildParagraphs(sections);
  if (!paras.length) return sections;

  const paraCount = paras.length;
  const titles = overrides.titles ?? {};

  // Clamp and deduplicate breaks: index 0 is implicit chapter start (not a break),
  // and indices >= paraCount are beyond the stream.
  const breakSet = new Set(
    overrides.breaks.filter((b) => b > 0 && b < paraCount),
  );

  // Build sorted split-point list: chapter i spans [splitPoints[i], splitPoints[i+1]).
  const splitPoints = [0, ...Array.from(breakSet).sort((a, b) => a - b)];

  return splitPoints.map((startIdx, ci) => {
    const endIdx = splitPoints[ci + 1] ?? paraCount;
    const slice = paras.slice(startIdx, endIdx);

    // Title resolution:
    // 1. Explicit override (non-empty after trim) wins.
    // 2. isTitle para is hoisted ONLY when it's the slice's first paragraph —
    //    a mid-slice isTitle (from a section boundary crossed by the break)
    //    must stay in content, otherwise we'd label the chapter with a title
    //    that belongs to a later section.
    // 3. Fallback to "Chapter N".
    const explicitTitle =
      typeof titles[startIdx] === "string" ? titles[startIdx].trim() : "";

    const hoistFirstTitle = slice[0]?.isTitle === true;

    let chapterTitle;
    if (explicitTitle) {
      chapterTitle = explicitTitle;
    } else if (hoistFirstTitle) {
      chapterTitle = slice[0].text;
    } else {
      chapterTitle = `Chapter ${ci + 1}`;
    }

    // Content: drop the leading isTitle paragraph when it was hoisted (or
    // would have been hoisted absent an explicit override). Mid-slice isTitle
    // paragraphs stay so their text isn't silently dropped.
    const bodyParas = hoistFirstTitle ? slice.slice(1) : slice;

    const content = bodyParas.map((p) => p.text).join("\n\n");

    return {
      type: "chapter",
      title: chapterTitle,
      number: ci + 1,
      content,
    };
  });
}
