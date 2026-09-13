// sniffDocumentType — content-based parser routing.
//
// Tested in tests/utils/sniffDocumentType.test.js.
//
// Decides which parser to dispatch for a file when the extension may be
// wrong or missing. Two layers:
//
//   1. Magic-byte detection for binary formats. PDF, EPUB, DOCX have
//      reliable headers (and EPUB/DOCX share the ZIP header but differ
//      in the contained mimetype/path).
//   2. Text-content heuristics for text-like extensions. A .txt that's
//      really HTML (DOCTYPE present) or Markdown (multi-signal score) or
//      JSON (parses cleanly) is upgraded to the matching parser.
//
// Guardrail: the sniffer NEVER overrides a recognized binary extension.
// If the user uploaded "memo.docx", we trust the extension over content
// heuristics — a .docx whose decoded bytes happen to look like markdown
// is still a .docx that needs mammoth, not detectStructure.
//
// Returns null when no confident upgrade applies. The caller should
// dispatch on the original extension in that case.

const BINARY_EXTS = new Set(["pdf", "epub", "docx", "doc"]);
const TEXT_SAMPLE_BYTES = 4096;

function asUint8(buf) {
  if (buf instanceof Uint8Array) return buf;
  if (buf instanceof ArrayBuffer) return new Uint8Array(buf);
  if (buf?.buffer instanceof ArrayBuffer) return new Uint8Array(buf.buffer);
  return new Uint8Array(0);
}

function startsWithBytes(bytes, sig) {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

function bytesIncludeString(bytes, needle, maxScan = 1024) {
  // Plain forward search of the first maxScan bytes for the literal
  // ASCII string `needle`. Cheaper than decoding to UTF-8 and using
  // String.prototype.indexOf when we only care about ASCII fingerprints.
  const target = new TextEncoder().encode(needle);
  const end = Math.min(bytes.length, maxScan);
  outer: for (let i = 0; i <= end - target.length; i++) {
    for (let j = 0; j < target.length; j++) {
      if (bytes[i + j] !== target[j]) continue outer;
    }
    return true;
  }
  return false;
}

function decodeSample(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, TEXT_SAMPLE_BYTES));
  } catch {
    return "";
  }
}

function sniffBinary(bytes) {
  // PDF — 1.0 through 2.0 all start with %PDF-
  if (startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";

  // ZIP container — could be EPUB or DOCX. Both use the local-file-header
  // signature PK\x03\x04. Disambiguate by scanning for the mimetype or
  // archive-path fingerprint in the first 1KB.
  if (startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (bytesIncludeString(bytes, "application/epub+zip")) return "epub";
    if (bytesIncludeString(bytes, "word/document.xml")) return "docx";
    // ZIP with no clear identity — let the caller decide.
    return null;
  }

  return null;
}

function looksLikeHTML(sample) {
  const head = sample.slice(0, 256).toLowerCase();
  if (head.includes("<!doctype html")) return true;
  if (/<html[\s>]/i.test(head)) return true;
  // 5+ distinct HTML tag names in the sample is a strong signal even
  // without a doctype (fragment from a CMS, copied article body).
  const tags = new Set();
  const re = /<([a-zA-Z][a-zA-Z0-9]{0,20})[\s>/]/g;
  let m;
  while ((m = re.exec(sample)) !== null) tags.add(m[1].toLowerCase());
  return tags.size > 5;
}

function looksLikeMarkdown(sample) {
  // Score multiple weak signals. Any one in isolation is noise; the
  // combination is what makes it Markdown.
  let score = 0;
  if (/^#{1,6}\s+\S/m.test(sample)) score += 2; // ATX heading at start of line
  if (/^```/m.test(sample)) score += 2;          // fenced code block
  if (/\[[^\]\n]+\]\([^)\n]+\)/.test(sample)) score += 1; // inline link
  if (/!\[[^\]\n]*\]\([^)\n]+\)/.test(sample)) score += 1; // image
  if (/^\s*[-*+]\s+\S/m.test(sample)) score += 1;          // bulleted list
  if (/^\s*\d+\.\s+\S/m.test(sample)) score += 1;          // numbered list
  if (/^>\s+\S/m.test(sample)) score += 1;                 // blockquote
  if (/\*\*[^*\n]+\*\*/.test(sample)) score += 1;          // bold
  // Threshold tuned against the fixture corpus — under-3 = "could be a
  // novel that happens to use # somewhere", over-3 = "definitely MD".
  return score >= 3;
}

function looksLikeJSON(sample) {
  const trimmed = sample.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

export async function sniffDocumentType(name, buffer) {
  const ext = String(name || "").split(".").pop().toLowerCase();
  const bytes = asUint8(buffer);

  // 1. Binary detection runs unconditionally. A user-renamed binary
  //    (mp3 → essay.txt) gets caught before we try to decode it as text.
  const binarySniff = sniffBinary(bytes);
  if (binarySniff) {
    // Don't override a known-binary extension with a different binary
    // type — if the user said .pdf but the bytes look like .docx, the
    // extension wins (return null). A confirming match (.pdf + %PDF-)
    // still returns "pdf" so the caller can short-circuit.
    if (BINARY_EXTS.has(ext) && binarySniff !== ext) return null;
    return binarySniff;
  }

  // 2. Text heuristics ONLY apply when the extension is text-like.
  //    A .docx whose bytes happen to start with "# Heading" stays .docx.
  if (BINARY_EXTS.has(ext)) return null;

  const sample = decodeSample(bytes);
  if (!sample) return null;

  if (looksLikeHTML(sample)) return "html";
  if (looksLikeJSON(sample)) return "json";
  if (looksLikeMarkdown(sample)) return "md";
  return null;
}
