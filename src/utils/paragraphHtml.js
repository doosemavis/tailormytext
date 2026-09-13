// Paragraph → HTML string builder. DocumentBody hands the result to the
// browser in one `innerHTML` write per paragraph, so React holds ONE fiber
// per paragraph instead of one per word (~1.5M on Don Quixote, ~400MB of
// heap and multi-second GC pauses). Every live feature (NeuroDiv intensity,
// HueGuide, the WPM pacer) already mutates this markup through the DOM, so
// the structure here is the contract they rely on:
//
//   <span class="rf-word[ rf-md-b][ rf-md-i]" data-word="…" data-hue="N">
//     <strong>{first}</strong>{rest}{" "}
//   </span>
//
// Document text is UNTRUSTED (uploads, EPUBs). Everything interpolated into
// markup goes through escapeHtml; the only unescaped values are numbers we
// validated ourselves (ratio, hue slot, list start).
//
// CONTRACT: consumes the private pseudo-Markdown content language documented
// in docs/architecture/PARSER_CONTRACT.md §2 (`**bold**`, `__italic__`,
// `- list`, `1. list`, inline `##`/`###` sub-headings, `{r:RATIO}` markers).

// All palettes have exactly 5 colours; the slot index maps to --rf-hue-0..4
// written on the doc wrapper, via .rf-word[data-hue] rules in global.css.
export const HUE_SLOT_COUNT = 5;

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

// Split a line into segments by **bold** and __italic__ markers. Each marker
// toggles its flag; nested markers (`**__x__**`) work because both flags are
// carried on every emitted segment.
export function splitEmphasis(line) {
  const segments = [];
  let bold = false;
  let italic = false;
  let buf = "";
  let i = 0;
  const flush = () => { if (buf) segments.push({ text: buf, bold, italic }); buf = ""; };
  while (i < line.length) {
    if (line[i] === "*" && line[i + 1] === "*") { flush(); bold = !bold; i += 2; }
    else if (line[i] === "_" && line[i + 1] === "_") { flush(); italic = !italic; i += 2; }
    else { buf += line[i]; i += 1; }
  }
  flush();
  return segments;
}

export function lineToWords(line) {
  const words = [];
  for (const seg of splitEmphasis(line)) {
    for (const w of seg.text.split(/\s+/).filter(Boolean)) words.push({ text: w, bold: seg.bold, italic: seg.italic });
  }
  return words;
}

const RATIO_RE = /^\{r:([\d.]+)\}/;
export function extractRatio(line) {
  const m = RATIO_RE.exec(line);
  if (!m) return { ratio: null, rest: line };
  const ratio = parseFloat(m[1]);
  return { ratio: Number.isFinite(ratio) && ratio > 0 ? ratio : null, rest: line.slice(m[0].length) };
}
const ratioStyle = (ratio) => (ratio == null ? "" : ` style="font-size:calc(var(--rf-font-size, 18px) * ${Number(ratio)})"`);

// Group consecutive `- …` and `1. …` lines into list blocks; other lines pass
// through as `line` blocks. The leading `{r:RATIO}` marker is peeled per item.
export function groupListBlocks(lines) {
  const blocks = [];
  for (const line of lines) {
    const { ratio, rest } = extractRatio(line);
    const bullet = /^- (.+)/.exec(rest);
    const numbered = /^(\d{1,3})\. (.+)/.exec(rest);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      const item = { text: bullet[1], ratio };
      if (last && last.kind === "ul") last.items.push(item); else blocks.push({ kind: "ul", items: [item] });
    } else if (numbered) {
      const item = { text: numbered[2], ratio };
      if (last && last.kind === "ol") last.items.push(item); else blocks.push({ kind: "ol", items: [item], start: parseInt(numbered[1], 10) });
    } else {
      blocks.push({ kind: "line", text: line });
    }
  }
  return blocks;
}

export function wordHtml(word, wi, total, intensity, bold = false, italic = false) {
  const hue = total > 1 ? Math.floor((wi / (total - 1)) * (HUE_SLOT_COUNT - 1)) : 0;
  const bl = Math.max(1, Math.round(word.length * intensity));
  const cls = `rf-word${bold ? " rf-md-b" : ""}${italic ? " rf-md-i" : ""}`;
  return `<span class="${cls}" data-word="${escapeHtml(word)}" data-hue="${hue}"><strong>${escapeHtml(word.slice(0, bl))}</strong>${escapeHtml(word.slice(bl))} </span>`;
}

function wordsHtml(words, intensity) {
  let out = "";
  for (let i = 0; i < words.length; i++) out += wordHtml(words[i].text, i, words.length, intensity, words[i].bold, words[i].italic);
  return out;
}

// Full inner markup for one `.rf-para` (the caller owns the wrapper div).
export function paragraphHtml(para, intensity) {
  const lines = para.split("\n").filter((l) => l.trim());
  let out = "";
  for (const block of groupListBlocks(lines)) {
    if (block.kind === "ul" || block.kind === "ol") {
      const start = block.kind === "ol" && Number.isFinite(block.start) ? ` start="${block.start}"` : "";
      out += `<${block.kind} class="rf-${block.kind}"${start}>`;
      for (const item of block.items) out += `<li class="rf-li"${ratioStyle(item.ratio)}>${wordsHtml(lineToWords(item.text), intensity)}</li>`;
      out += `</${block.kind}>`;
      continue;
    }
    const { ratio, rest } = extractRatio(block.text);
    let tag = "p";
    let cls = "rf-line";
    let body = rest;
    if (rest.startsWith("### ")) { tag = "h3"; cls = "rf-h3"; body = rest.slice(4); }
    else if (rest.startsWith("## ")) { tag = "h2"; cls = "rf-h2"; body = rest.slice(3); }
    out += `<${tag} class="${cls}"${ratioStyle(ratio)}>${wordsHtml(lineToWords(body), intensity)}</${tag}>`;
  }
  return out;
}
