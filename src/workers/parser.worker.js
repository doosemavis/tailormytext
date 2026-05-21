// CONTRACT (Task D2): posts back { id, sections, confidence? } per
// docs/architecture/PARSER_CONTRACT.md. Text parsers (parse-text, parse-md)
// now return { sections, confidence }; binary parsers (parse-pdf) return
// Section[]. The worker normalizes both shapes into a consistent postMessage
// payload so the main-thread wrapper (parserWorker.js) can pass through the
// full shape without knowing which parser ran.
//
// Parser Worker (Phase 2: text + Markdown only).
//
// Runs the worker-safe parsers off the main thread so document parsing
// doesn't starve the loader's animation. The worker is intentionally minimal:
// one message type per parser, request-id correlation for promise resolution,
// errors marshaled as { id, error: string } so the main thread can re-throw.
//
// Worker-safe = no DOMParser, no window, no document. detectStructure.js's
// `detectTextStructure` and `parseMarkdownStructured` are pure-JS; they
// import without touching DOM. `parseHTMLStructured` from the same file uses
// DOMParser and must stay on the main thread (or get a polyfill — Phase 3
// territory if we want it in the worker).
//
// Why named imports: tree-shaking. If we imported the whole module, the
// `parseHTMLStructured` symbol would land in the worker bundle as dead
// code referencing `DOMParser`. Vite *should* tree-shake it, but the
// explicit import keeps the dependency clear at the file boundary.

import { detectTextStructure, parseMarkdownStructured } from "../utils/detectStructure";
import { parseMarkdownTokens } from "../utils/parseMarkdownTokens";
import { analyzePDF } from "./pdfAnalysis";
import { USE_MARKDOWN_TOKEN_PARSER } from "../config/constants";

self.onmessage = (e) => {
  const { id, type, payload } = e.data || {};
  if (typeof id !== "number") return; // ignore malformed messages

  try {
    switch (type) {
      case "parse-text": {
        // detectTextStructure returns { sections, confidence } (Task D2).
        const result = detectTextStructure(payload);
        self.postMessage({ id, sections: result.sections, confidence: result.confidence });
        break;
      }
      case "parse-md": {
        // Phase 3: flag selects between marked.lexer + adapter (default)
        // and the legacy regex preprocessor. Both now return { sections, confidence }.
        const result = USE_MARKDOWN_TOKEN_PARSER
          ? parseMarkdownTokens(payload)
          : parseMarkdownStructured(payload);
        self.postMessage({ id, sections: result.sections, confidence: result.confidence });
        break;
      }
      case "parse-pdf":
        // payload: { rawPages, resolvedOutline, debug }
        // pdf.js calls (load, getDocument, getTextContent, outline resolution)
        // happen on main thread; this branch runs the heuristics-heavy analysis.
        // analyzePDF is a binary parser — returns Section[] with no confidence.
        self.postMessage({ id, sections: analyzePDF(payload) });
        break;
      default:
        throw new Error(`Unknown parser type: ${type}`);
    }
  } catch (err) {
    // Errors don't structured-clone cleanly across the postMessage boundary
    // (Error.constructor, .stack, and any custom properties get dropped).
    // Previously we serialized to a plain string, which lost the error
    // name and stack — the main thread re-threw as a generic Error with
    // no provenance, making parser bugs hard to trace.
    //
    // Now serialize { message, name, stack }; parserWorker.js rebuilds an
    // Error with the original name + stack preserved.
    const errorPayload = err instanceof Error
      ? { message: err.message, name: err.name, stack: err.stack }
      : { message: String(err), name: "Error", stack: undefined };
    self.postMessage({ id, error: errorPayload });
  }
};
