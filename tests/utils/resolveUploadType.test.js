import { describe, it, expect } from "vitest";
import { resolveUploadType } from "../../src/utils/resolveUploadType.js";

// resolveUploadType decides which parser doUpload dispatches to after the
// content sniff. The extension allowlist alone isn't enough: a PDF renamed
// to "book.txt" passes the extension check, then the sniffer (correctly)
// identifies it as a PDF. Without this gate, the PDF parser would run on a
// format we've deliberately turned off.

const SUPPORTED = new Set(["epub", "txt"]);

describe("resolveUploadType", () => {
  it("keeps the extension when the sniffer has no opinion", () => {
    expect(resolveUploadType("txt", null, SUPPORTED)).toBe("txt");
    expect(resolveUploadType("epub", null, SUPPORTED)).toBe("epub");
  });

  it("keeps the extension when the sniff confirms it", () => {
    expect(resolveUploadType("epub", "epub", SUPPORTED)).toBe("epub");
  });

  it("rejects a PDF renamed to .txt", () => {
    expect(() => resolveUploadType("txt", "pdf", SUPPORTED)).toThrow(/actually a PDF/);
  });

  it("rejects a DOCX renamed to .txt", () => {
    expect(() => resolveUploadType("txt", "docx", SUPPORTED)).toThrow(/actually a DOCX/);
  });

  it("uses copy that mapParserErrorToMessage passes through verbatim", () => {
    // mapParserErrorToMessage keys its pass-through on "doesn't support";
    // without that phrase the reader would see a generic "couldn't read".
    expect(() => resolveUploadType("txt", "pdf", SUPPORTED)).toThrow(/doesn't support/);
  });

  it("routes a mislabeled EPUB to the EPUB parser", () => {
    expect(resolveUploadType("txt", "epub", SUPPORTED)).toBe("epub");
  });

  it("still upgrades a .txt whose contents are HTML, Markdown, or JSON", () => {
    // These are text files with structure — the richer parser renders
    // them better, and they carry none of the PDF/DOCX layout risk.
    expect(resolveUploadType("txt", "html", SUPPORTED)).toBe("html");
    expect(resolveUploadType("txt", "md", SUPPORTED)).toBe("md");
    expect(resolveUploadType("txt", "json", SUPPORTED)).toBe("json");
  });

  it("allows PDF again once it's back on the allowlist", () => {
    const withPdf = new Set([...SUPPORTED, "pdf"]);
    expect(resolveUploadType("txt", "pdf", withPdf)).toBe("pdf");
  });
});
