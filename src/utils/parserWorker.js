// Main-thread wrapper around src/workers/parser.worker.js.
//
// One worker instance is reused for the life of the page (creation is
// non-trivial: bundle load + module init). The wrapper assigns each call a
// monotonic id so concurrent parses (rare but possible if a user mass-uploads)
// don't conflate replies. Promise resolution is keyed on id.
//
// Failure modes the caller should know about:
//   - Worker creation throws if the browser blocks workers (some restrictive
//     CSPs do). The wrapper rethrows synchronously from parseInWorker so the
//     caller's catch block sees a normal Error before the parse promise is
//     awaited.
//   - Worker termination via runtime crash (worker module syntax error,
//     CSP block, OOM kill) is handled by the `onerror` handler below: all
//     pending promises reject with the error message and `workerInstance`
//     is cleared so the next call creates a fresh worker.

let workerInstance = null;
let nextId = 0;
const pending = new Map();

function getWorker() {
  if (workerInstance) return workerInstance;

  workerInstance = new Worker(
    new URL("../workers/parser.worker.js", import.meta.url),
    { type: "module" },
  );

  workerInstance.onmessage = (e) => {
    const { id, sections, confidence, error } = e.data || {};
    const entry = pending.get(id);
    if (!entry) return; // late reply for a discarded promise
    pending.delete(id);
    if (error) {
      // Rehydrate the error so its name and stack survive the postMessage
      // boundary. Falls back to a bare Error if the worker only sent a
      // string (kept for compatibility with any older worker payloads).
      if (typeof error === "string") {
        entry.reject(new Error(error));
      } else {
        const rehydrated = new Error(error.message || "Parser worker error");
        if (error.name) rehydrated.name = error.name;
        if (error.stack) rehydrated.stack = error.stack;
        entry.reject(rehydrated);
      }
    } else if (confidence !== undefined) {
      // Text parser result: worker posted { id, sections, confidence }.
      // Resolve with the full { sections, confidence } shape so callers
      // can distinguish text vs binary parser results and access the signal.
      entry.resolve({ sections, confidence });
    } else {
      // Binary parser result: worker posted { id, sections } (no confidence).
      // Resolve with the Section[] array directly (binary contract unchanged).
      entry.resolve(sections);
    }
  };

  // Catch-all: malformed messages, unhandled rejections inside the worker
  // module, etc. Reject *all* pending entries so the user sees a parse
  // failure instead of a loader stuck forever.
  workerInstance.onerror = (e) => {
    const msg = e?.message || "Parser worker crashed";
    for (const entry of pending.values()) entry.reject(new Error(msg));
    pending.clear();
    workerInstance = null;
  };

  return workerInstance;
}

// Node fallback for the eval harness. Web Workers don't exist in Node, so
// we run the worker's analyzer modules synchronously on the main thread.
// Browsers always use the Worker path above; this branch only fires when
// `typeof Worker === "undefined"` (server-side / Node test runs).
async function runInProcess(type, payload) {
  if (type === "parse-pdf") {
    const { analyzePDF } = await import("../workers/pdfAnalysis.js");
    return analyzePDF(payload);
  }
  if (type === "parse-md") {
    const { parseMarkdownTokens } = await import("./parseMarkdownTokens.js");
    return parseMarkdownTokens(payload);
  }
  if (type === "parse-text") {
    const { detectTextStructure } = await import("./detectStructure.js");
    return detectTextStructure(payload);
  }
  throw new Error(`Unknown parser type: ${type}`);
}

export function parseInWorker(type, payload) {
  if (typeof Worker === "undefined") {
    return runInProcess(type, payload);
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      getWorker().postMessage({ id, type, payload });
    } catch (err) {
      pending.delete(id);
      reject(err);
    }
  });
}
