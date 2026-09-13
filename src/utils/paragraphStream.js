// Shared paragraph-stream derivation used by EditChaptersModal (for the
// interactive editor) and applyChapterOverrides (for the render path).
// Both must use the IDENTICAL split so saved break indices remain valid.
// See docs/architecture/PARSER_CONTRACT.md for the Section shape.

// Extract flat paragraphs from docSections. Each section contributes its
// content split on blank lines; section title is prepended if present.
// Returns [{ text, sectionIdx, isTitle }].
export function buildParagraphs(docSections) {
  if (!docSections?.length) return [];
  const paras = [];
  for (let si = 0; si < docSections.length; si++) {
    const sec = docSections[si];
    if (sec.title) {
      paras.push({ text: sec.title, sectionIdx: si, isTitle: true });
    }
    const chunks = (sec.content || "").split(/\n{2,}/);
    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (trimmed) {
        paras.push({ text: trimmed, sectionIdx: si, isTitle: false });
      }
    }
  }
  return paras;
}
