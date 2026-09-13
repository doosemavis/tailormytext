import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPositionSaver } from "../../src/utils/positionSaver";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); });

describe("createPositionSaver", () => {
  it("writes the first position right away and then at most once per interval, latest wins", () => {
    const persist = vi.fn();
    const saver = createPositionSaver({ persist, intervalMs: 5000 });
    saver.note({ sectionIdx: 1, scrollOffset: 10 });
    vi.advanceTimersByTime(0);
    expect(persist).toHaveBeenCalledTimes(1);

    saver.note({ sectionIdx: 1, scrollOffset: 20 });
    vi.advanceTimersByTime(1000);
    saver.note({ sectionIdx: 2, scrollOffset: 5 });
    vi.advanceTimersByTime(3999);
    expect(persist).toHaveBeenCalledTimes(1);          // still inside the interval
    vi.advanceTimersByTime(1);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith({ sectionIdx: 2, scrollOffset: 5 });
  });

  it("flush persists the pending position immediately and cancels the timer", () => {
    const persist = vi.fn();
    const saver = createPositionSaver({ persist, intervalMs: 5000 });
    saver.note({ sectionIdx: 0, scrollOffset: 0 });
    vi.advanceTimersByTime(0);
    saver.note({ sectionIdx: 3, scrollOffset: 42 });
    saver.flush();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith({ sectionIdx: 3, scrollOffset: 42 });
    expect(saver.pending).toBeNull();
    vi.advanceTimersByTime(10000);
    expect(persist).toHaveBeenCalledTimes(2);          // nothing left to write
    saver.flush();
    expect(persist).toHaveBeenCalledTimes(2);          // flush with nothing pending is a no-op
  });

  it("dispose drops the pending position without persisting", () => {
    const persist = vi.fn();
    const saver = createPositionSaver({ persist, intervalMs: 5000 });
    saver.note({ sectionIdx: 0, scrollOffset: 0 });
    vi.advanceTimersByTime(0);
    saver.note({ sectionIdx: 9, scrollOffset: 9 });
    saver.dispose();
    vi.advanceTimersByTime(10000);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(saver.pending).toBeNull();
  });
});
