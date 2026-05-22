import mammoth from "mammoth";
import { detectTextStructure, parseHTMLStructured } from "./detectStructure.js";

// CONTRACT: emits Section[] per docs/architecture/PARSER_CONTRACT.md.
// Currently emits type:"section" — Phase 4 of the parser-rewrite plan
// harmonizes to type:"chapter". title from h1-h3 textContent (null if
// no heading present in section), sequential number, content in the
// private pseudo-Markdown format.
//
// NOTE: parseDOCX stays on main thread (same reasoning as parseEPUB).
// Uses `new DOMParser().parseFromString(...)` to walk mammoth's HTML output;
// DOMParser isn't available in standard Web Workers. DOCX files are
// typically small (<5MB) and the parse runs fast (~50-200ms on a typical
// memo), so the cost-benefit of a parse5-based worker rewrite doesn't
// justify the effort right now. Tracked alongside EPUB as a deferred
// optimization in TAILORMYTEXT_LAUNCH_PLAN.md.

// mammoth's input shape differs by environment: the browser bundle wants
// `arrayBuffer:`, the Node entry wants `buffer:` (a Node Buffer). Pick the
// shape based on Buffer availability so parseDOCX works in both contexts
// (production browser + eval harness in Node).
function mammothInputForBuf(buf) {
  if (typeof Buffer !== "undefined") return { buffer: Buffer.from(buf) };
  return { arrayBuffer: buf };
}

export async function parseDOCX(file) {
  const buf = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(mammothInputForBuf(buf));

  // mammoth surfaces problems via result.messages. Warnings are common
  // (unsupported style mapping, unknown smart-tags) and we just log them.
  // An error-typed message means mammoth couldn't process some hard part
  // of the doc — fail loudly so App.jsx shows a real error.
  if (Array.isArray(result.messages) && result.messages.length > 0) {
    const errors = result.messages.filter((m) => m.type === "error");
    const warnings = result.messages.filter((m) => m.type === "warning");
    if (warnings.length > 0) {
      console.warn("[parseDOCX] mammoth warnings:", warnings.map((m) => m.message));
    }
    if (errors.length > 0) {
      throw new Error(`DOCX conversion failed: ${errors[0].message}`);
    }
  }

  // Delegate the section-detection walk to parseHTMLStructured. mammoth
  // already converted the DOCX into HTML; the HTML parser owns the
  // dynamic-depth rule, transparent container recursion, h1-h6 detection,
  // script/style/footer stripping, and the type harmonization to
  // "chapter". Keeping one walker means DOCX gets every HTML improvement
  // for free.
  // parseHTMLStructured returns { sections, confidence }; binary parsers
  // return Section[] per the contract, so we discard confidence here.
  const { sections } = parseHTMLStructured(result.value);

  // Treat single-section-with-no-title as "no structure" — that's what
  // happens when mammoth produced a body with no headings at all.
  const looksUnstructured = sections.length === 1 && !sections[0].title;
  if (sections.length === 0 || looksUnstructured) {
    console.warn("[parseDOCX] no headings detected — falling back to extractRawText (structure lost)");
    const raw = (await mammoth.extractRawText(mammothInputForBuf(buf))).value;
    const { sections: fallbackSections } = detectTextStructure(raw);
    return fallbackSections;
  }
  return sections;
}
