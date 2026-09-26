// resolveUploadType — final parser choice for an upload, post-sniff.
//
// Tested in tests/utils/resolveUploadType.test.js.
//
// doUpload's extension allowlist runs before the content sniff, so a
// renamed binary ("book.pdf" → "book.txt") slips past it and the sniffer
// then routes it to the PDF parser. This re-applies the allowlist to
// binary sniff results. Text upgrades (a .txt that's really HTML/MD/JSON)
// are left alone — they're still text files, just better structured.

const BINARY_TYPES = new Set(["pdf", "epub", "docx"]);

export function resolveUploadType(rawExt, sniffed, supportedExts) {
  if (!sniffed || sniffed === rawExt) return rawExt;
  if (BINARY_TYPES.has(sniffed) && !supportedExts.has(sniffed)) {
    const label = sniffed.toUpperCase();
    throw new Error(`This file is actually a ${label}, and TailorMyText doesn't support ${label} files yet. Try an EPUB or TXT file.`);
  }
  return sniffed;
}
