import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the supabase client BEFORE importing track.js
const insertMock = vi.fn().mockResolvedValue({ error: null });
const fromMock = vi.fn(() => ({ insert: insertMock }));
const getSessionMock = vi.fn().mockResolvedValue({ data: { session: null } });

vi.mock("../../src/utils/supabase.js", () => ({
  supabase: {
    from: (...args) => fromMock(...args),
    auth: { getSession: () => getSessionMock() },
  },
}));

describe("trackParseOutcome", () => {
  beforeEach(() => {
    insertMock.mockClear();
    fromMock.mockClear();
    getSessionMock.mockClear();
    insertMock.mockResolvedValue({ error: null });
    getSessionMock.mockResolvedValue({ data: { session: null } });
    // Stable session id for assertions
    globalThis.localStorage?.clear?.();
  });

  it("inserts a row with all expected fields for an anon upload", async () => {
    const { trackParseOutcome } = await import("../../src/utils/track.js");
    await trackParseOutcome({
      format: "md",
      depthFallback: false,
      sectionCount: 7,
      docByteSize: 18432,
      ext: "md",
    });

    expect(fromMock).toHaveBeenCalledWith("parse_outcomes");
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      format: "md",
      depth_fallback: false,
      section_count: 7,
      doc_byte_size: 18432,
      ext: "md",
      user_id: null,
    });
    expect(typeof payload.session_id).toBe("string");
    expect(payload.session_id.length).toBeGreaterThanOrEqual(8);
  });

  it("attaches user_id when authed", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "user-uuid-123" } } },
    });
    const { trackParseOutcome } = await import("../../src/utils/track.js");
    await trackParseOutcome({
      format: "pdf",
      depthFallback: false,
      sectionCount: 12,
    });
    expect(insertMock.mock.calls.at(-1)[0].user_id).toBe("user-uuid-123");
  });

  it("swallows insert errors (does not throw, logs a warn)", async () => {
    insertMock.mockResolvedValue({ error: { message: "rls denied" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { trackParseOutcome } = await import("../../src/utils/track.js");
    await expect(
      trackParseOutcome({ format: "txt", depthFallback: true, sectionCount: 1 }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("drops unknown format values (defense against schema CHECK violation)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { trackParseOutcome } = await import("../../src/utils/track.js");
    await trackParseOutcome({
      format: "json",
      depthFallback: false,
      sectionCount: 1,
    });
    expect(insertMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("trackParseOutcome"), expect.anything());
    warn.mockRestore();
  });
});
