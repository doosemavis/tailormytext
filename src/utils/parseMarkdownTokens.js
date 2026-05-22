// CONTRACT: emits { sections: Section[], confidence: { score, reasons } } per
// docs/architecture/PARSER_CONTRACT.md (Task D2). confidence.score is a
// heuristic 0-1 confidence value; confidence.reasons carries string tags such
// as "no_repeating_depth" when the depth-pick fell back to "smallest depth at
// all" (structural uncertainty). Callers can derive the legacy depthFallback
// boolean as: confidence.reasons.includes("no_repeating_depth").
// Tested in tests/utils/parseMarkdownTokens.test.js.
//
// Phase 3 of the parser rewrite. Replaces the regex-based preprocessor
// (preprocessMarkdown + detectTextStructure) with a real Markdown tokenizer
// from `marked`. The codex review insisted: use marked.lexer() — NOT marked's
// HTML output — so the tokens reach this adapter with structure intact.
//
// The adapter walks marked's token stream and renders the SAME private
// pseudo-Markdown body language the legacy parser produced. That keeps the
// renderer (DocumentBody.jsx) untouched by this swap — it's a producer
// change behind a fixed contract.
//
// Section boundary rule (codex Q2 answer):
//   heading depth 1-2 → new section, token.text as title
//   heading depth 3+  → inline ##/### + text in current section content
//   everything else   → append to current section content
//
// Inline mapping:
//   text        → text
//   strong      → **bold**
//   em          → __italic__
//   link        → label only (drop URL)
//   image       → dropped entirely
//   code        → text without backticks
//
// Block mapping:
//   paragraph   → render inline tokens, append
//   list        → "- item" or "N. item" lines, preserves start number
//   code        → plain text, no fence markers, no lang tag
//   blockquote  → unwrapped paragraphs
//   space       → skip
//   html (e.g. <!-- comment -->) → drop
//   hr          → drop

import { marked } from "marked";
import { scoreConfidence } from "./scoreConfidence.js";

// Pick the section-break depth dynamically per document instead of
// hardcoding h1. Rule: the smallest heading depth that occurs ≥ 2 times
// is the section boundary; if no depth repeats, fall back to the
// smallest depth present. This adapts to:
//   - "# Ch1 ## Sub # Ch2 # Ch3" → h1 splits (3 chapters)
//   - "# Title ## A ## B ## C" → h2 splits (h1 = doc title, 3 chapters)
//   - h4-only docs → h4 splits
// Anything ABOVE the chosen depth becomes inline content; anything BELOW
// stays inline as a ## sub-heading marker.
// Returns { depth, fallback } where:
//   depth    — the heading depth to use as the section boundary
//   fallback — true if depth was chosen by the "smallest depth at all"
//              fallback (no depth repeats ≥2 times). This signals
//              structural uncertainty; callers surface it as depthFallback.
function pickSectionDepth(tokens) {
  const counts = new Map();
  for (const t of tokens) {
    if (t.type === "heading") {
      counts.set(t.depth, (counts.get(t.depth) || 0) + 1);
    }
  }
  if (counts.size === 0) return { depth: Infinity, fallback: false }; // no headings → no splits, fallback didn't fire
  // Smallest depth with count >= 2.
  const repeated = [...counts.entries()].filter(([_, c]) => c >= 2).map(([d]) => d);
  if (repeated.length > 0) return { depth: Math.min(...repeated), fallback: false };
  // Otherwise smallest depth at all (single-heading-of-its-kind docs).
  return { depth: Math.min(...counts.keys()), fallback: true };
}

function renderInline(tokens) {
  if (!Array.isArray(tokens)) return "";
  let out = "";
  for (const t of tokens) {
    switch (t.type) {
      case "text":
        // marked unescapes \* into * in token.text. Use the unescaped form
        // so "\\*not italic\\*" survives as literal asterisks.
        out += t.text;
        break;
      case "strong":
        out += "**" + renderInline(t.tokens) + "**";
        break;
      case "em":
        out += "__" + renderInline(t.tokens) + "__";
        break;
      case "del":
        // Strikethrough: render the plain text. The renderer has no
        // strike style; dropping the tilde markers is the lowest-loss
        // mapping.
        out += renderInline(t.tokens);
        break;
      case "link":
        // Drop the URL, keep the label.
        out += renderInline(t.tokens);
        break;
      case "image":
        // Drop entirely — we don't render images in the reader, and the
        // alt text is usually filename-y noise ("screenshot-1.png").
        break;
      case "codespan":
        // Inline `code` — strip backticks (no monospace style in renderer).
        out += t.text;
        break;
      case "br":
        out += "\n";
        break;
      case "html":
        // Inline HTML (rare in normal MD). Drop — the renderer can't
        // interpret HTML inside a paragraph.
        break;
      default:
        // Unknown inline token type — fall back to its raw text if
        // present, otherwise skip silently.
        if (typeof t.text === "string") out += t.text;
        break;
    }
  }
  return out;
}

function renderListItem(item, marker) {
  // list_item.tokens contains a paragraph (or text token) holding the
  // item's inline content. Render to inline string + prepend the marker.
  let inner = "";
  if (Array.isArray(item.tokens)) {
    for (const t of item.tokens) {
      if (t.type === "text" || t.type === "paragraph") {
        inner += renderInline(t.tokens || []);
      } else if (t.type === "list") {
        // Nested list — render as indented lines on a new line.
        inner += "\n" + renderList(t).replace(/^/gm, "  ");
      } else if (typeof t.text === "string") {
        inner += t.text;
      }
    }
  }
  return `${marker} ${inner.trim()}`;
}

function renderList(token) {
  const lines = [];
  let n = token.ordered ? (parseInt(token.start, 10) || 1) : null;
  for (const item of token.items || []) {
    const marker = n === null ? "-" : `${n}.`;
    lines.push(renderListItem(item, marker));
    if (n !== null) n += 1;
  }
  return lines.join("\n");
}

function renderBlock(token) {
  switch (token.type) {
    case "paragraph":
      return renderInline(token.tokens);
    case "list":
      return renderList(token);
    case "code":
      // Plain text body. No fence, no lang tag.
      return token.text;
    case "blockquote": {
      // Render the inner tokens as plain paragraphs (we have no quote style).
      const inner = (token.tokens || []).map(renderBlock).filter(Boolean).join("\n\n");
      return inner;
    }
    case "hr":
    case "space":
    case "html":
      // hr → drop. space → skip whitespace-only tokens. html → drop
      // (HTML comments and stray blocks; we don't render HTML inside MD).
      return "";
    case "table":
      // Render as plain rows (cells joined by " | "). No table styling
      // in the renderer yet; flat text is the least-confusing mapping.
      return (token.rows || [])
        .map((row) => (Array.isArray(row) ? row.map((c) => renderInline(c.tokens || [])).join(" | ") : ""))
        .filter(Boolean)
        .join("\n");
    default:
      // Unknown block type — fall back to .text if available, otherwise
      // skip. Keeps the adapter forward-compatible with new marked
      // tokens without crashing.
      return typeof token.text === "string" ? token.text : "";
  }
}

function appendContent(section, text) {
  if (!text) return;
  section.content = section.content ? `${section.content}\n\n${text}` : text;
}

// Strip YAML/TOML front matter at file head. marked doesn't treat
// `---\n...\n---` as a special construct — without this prepass it sees
// the lower `---` as a setext underline for the metadata lines, which
// then leak into the first section's content as a heading.
function stripFrontMatter(md) {
  // Allow leading whitespace/BOM. Match either `---\n...\n---` (YAML) or
  // `+++\n...\n+++` (TOML, Hugo convention).
  const m = md.match(/^﻿?\s*(---|\+\+\+)\n[\s\S]*?\n\1\s*\n?/);
  return m ? md.slice(m[0].length) : md;
}

export function parseMarkdownTokens(md) {
  const stripped = stripFrontMatter(md);
  const tokens = marked.lexer(stripped);
  const { depth: sectionDepth, fallback: depthFallback } = pickSectionDepth(tokens);

  const sections = [];
  let sectionNum = 0;
  let current = { type: "document", title: null, number: 1, content: "" };

  function pushIfNonEmpty() {
    // Empty heading-only sections (`# Empty` with no body) are dropped —
    // they would render as phantom chapter labels with zero paragraphs.
    if (current.content.trim()) sections.push(current);
  }

  for (const token of tokens) {
    if (token.type === "heading" && token.depth === sectionDepth) {
      // Close previous section and open a new one.
      pushIfNonEmpty();
      sectionNum += 1;
      current = {
        type: "chapter",
        title: renderInline(token.tokens || []).trim() || null,
        number: sectionNum,
        content: "",
      };
      continue;
    }
    if (token.type === "heading") {
      if (token.depth < sectionDepth) {
        // Heading shallower than the chapter depth → doc-level title.
        // Drop (the dynamic depth rule already decided this depth is NOT
        // a section break, so it's metadata).
        continue;
      }
      // Deeper than section depth → inline subsection marker.
      const marker = "#".repeat(Math.min(token.depth, 6));
      const text = renderInline(token.tokens || []);
      appendContent(current, `${marker} ${text}`);
      continue;
    }
    const rendered = renderBlock(token);
    if (rendered) appendContent(current, rendered);
  }
  pushIfNonEmpty();

  // No headings → single document section (matches detectTextStructure's
  // no-structure fallback shape). depthFallback is false here (the depth
  // pick returned Infinity with fallback=false — no headings means the
  // fallback never fired).
  if (sections.length === 0) {
    const noHeadingSections = [{ type: "document", title: null, number: 1, content: stripped.trim() }];
    return {
      sections: noHeadingSections,
      confidence: scoreConfidence(noHeadingSections, {
        depthFallback: false,
        textLength: stripped.length,
      }),
    };
  }

  // Renumber after dropping any empty heading-only sections so the
  // `number` field is contiguous.
  const renumbered = sections.map((s, i) => ({ ...s, number: i + 1 }));
  return {
    sections: renumbered,
    confidence: scoreConfidence(renumbered, {
      depthFallback,
      textLength: stripped.length,
    }),
  };
}
