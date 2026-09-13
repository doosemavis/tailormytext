import { describe, it, expect, beforeEach, vi } from "vitest";

describe("parseInWorker — resilience to worker crash", () => {
  let workers;
  beforeEach(() => {
    workers = [];
    globalThis.Worker = class {
      constructor() {
        workers.push(this);
        this.onmessage = null;
        this.onerror = null;
      }
      postMessage(msg) {
        setTimeout(() => this.onmessage?.({
          data: { id: msg.id, sections: [{ type: "document", title: null, number: 1, content: "ok" }] }
        }), 0);
      }
      terminate() {}
    };
  });

  it("recovers after onerror — does not hang the next call", async () => {
    vi.resetModules();
    const { parseInWorker } = await import("../../src/utils/parserWorker.js");
    const firstPromise = parseInWorker("parse-text", "hello");
    workers[0].onerror?.({ message: "boom" });
    await expect(firstPromise).rejects.toThrow("boom");

    const secondPromise = parseInWorker("parse-text", "world");
    await expect(secondPromise).resolves.toBeTruthy();
    expect(workers.length).toBe(2);
  });
});
