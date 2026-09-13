import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Window } from "happy-dom";

// parseDOCX previously ignored result.messages from mammoth. Mammoth
// emits warnings for unsupported style mappings and errors for hard
// failures; both vanished. Separately, the extractRawText fallback at
// line 40-42 silently dropped structure when convertToHtml produced
// zero sections — the user got plain prose with no warning.

const win = new Window();
globalThis.DOMParser = win.DOMParser;

const convertToHtml = vi.fn();
const extractRawText = vi.fn();

vi.mock("mammoth", () => ({
  default: { convertToHtml: (...args) => convertToHtml(...args), extractRawText: (...args) => extractRawText(...args) },
}));

const { parseDOCX } = await import("../../src/utils/parseDOCX.js");

const fakeFile = { arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) };

describe("parseDOCX — mammoth message handling (Tasks 1.9, 1.10)", () => {
  let warnSpy;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    convertToHtml.mockReset();
    extractRawText.mockReset();
  });
  afterEach(() => { warnSpy.mockRestore(); });

  it("logs mammoth warnings but parses successfully (Task 1.9)", async () => {
    convertToHtml.mockResolvedValue({
      value: "<h1>Chapter 1</h1><p>Body.</p>",
      messages: [
        { type: "warning", message: "Style 'Heading 9' is not mapped" },
        { type: "warning", message: "Unrecognized element: w:smartTag" },
      ],
    });
    const sections = await parseDOCX(fakeFile);
    expect(sections).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/mammoth|docx/i), expect.anything());
  });

  it("throws when mammoth emits an error-type message (Task 1.9)", async () => {
    convertToHtml.mockResolvedValue({
      value: "",
      messages: [{ type: "error", message: "Unsupported document part" }],
    });
    await expect(parseDOCX(fakeFile)).rejects.toThrow(/docx|mammoth|unsupported/i);
  });

  it("logs when falling back to extractRawText (structural loss) (Task 1.10)", async () => {
    // Empty body → 0 sections after walk → fallback path. The whole-doc
    // extractRawText recovers some text, but the section structure is
    // lost — warn so the degradation isn't silent.
    convertToHtml.mockResolvedValue({ value: "", messages: [] });
    extractRawText.mockResolvedValue({ value: "Recovered plain prose.", messages: [] });

    const sections = await parseDOCX(fakeFile);
    expect(sections.length).toBeGreaterThan(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/fallback|structure|extractRawText/i));
  });

  it("happy path: clean conversion with no messages produces no warns", async () => {
    convertToHtml.mockResolvedValue({
      value: "<h1>Ch 1</h1><p>Hello.</p>",
      messages: [],
    });
    const sections = await parseDOCX(fakeFile);
    expect(sections).toHaveLength(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
