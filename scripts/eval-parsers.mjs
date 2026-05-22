#!/usr/bin/env node
//
// Parser eval harness — Phase 0 of the parser-rewrite plan.
//
// Reads tests/fixtures/MANIFEST.json, runs each fixture through its
// format's parser, and diffs the output against
// tests/fixtures/golden/<name>.json. `--update` regenerates goldens.
//
// Scope: txt, md, html only. parsePDF / parseEPUB / parseDOCX rely on
// CDN-loaded globals (window.pdfjsLib, window.JSZip) and window.localStorage,
// none of which exist in Node. Those formats get a NoEval tally with a
// reason. They'll be re-added once the parsers work in a non-browser env
// (Phase 6) or once we run the harness inside vitest with happy-dom + the
// real CDN scripts loaded into a JSDOM window.
//
// DOMParser is polyfilled via happy-dom BEFORE the parser module is loaded
// (dynamic import) so parseHTMLStructured sees a working DOMParser.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import JSZip from "jszip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Polyfill global DOMParser so parseHTMLStructured works in Node. happy-dom
// also gives us a working Window we attach to globalThis.window so the
// production parsers' `window.JSZip` / `window.pdfjsLib` references resolve.
const win = new Window();
globalThis.DOMParser = win.DOMParser;
globalThis.window = win;
// Pre-install the CDN-loaded globals from their npm equivalents. scriptLoader
// detects the headless env and short-circuits, so the parsers read these
// directly without trying to attach a <script> tag.
globalThis.window.JSZip = JSZip;

// Lazy-load pdfjs only when a PDF fixture is seen — its legacy ESM build
// pulls in ~35MB which we'd rather skip for txt-only runs.
let pdfjsReady = null;
async function ensurePdfjs() {
  if (!pdfjsReady) {
    pdfjsReady = import("pdfjs-dist/legacy/build/pdf.mjs").then((mod) => {
      // parsePDF detects `typeof Worker === "undefined"` and passes
      // disableWorker per call, so we don't set GlobalWorkerOptions here.
      globalThis.window.pdfjsLib = mod;
      return mod;
    });
  }
  return pdfjsReady;
}

// Dynamic import AFTER the polyfill is in place.
const { detectTextStructure, parseHTMLStructured, parseMarkdownStructured } =
  await import("../src/utils/detectStructure.js");
const { parseMarkdownTokens } = await import("../src/utils/parseMarkdownTokens.js");
const { sniffDocumentType } = await import("../src/utils/sniffDocumentType.js");
const { parseEPUB } = await import("../src/utils/parseEPUB.js");
const { parseDOCX } = await import("../src/utils/parseDOCX.js");
const { parsePDF } = await import("../src/utils/parsePDF.js");
const { USE_MARKDOWN_TOKEN_PARSER } = await import("../src/config/constants.js");
const mdParser = USE_MARKDOWN_TOKEN_PARSER ? parseMarkdownTokens : parseMarkdownStructured;

// Wrap a Node Buffer as the File-like our parsers expect (they only call
// .arrayBuffer()). Sliced ArrayBuffer scopes the bytes to this file (Node
// Buffer.buffer points into a shared pool).
function bufferToFile(buf) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return { arrayBuffer: () => Promise.resolve(ab) };
}

const MANIFEST_PATH = join(ROOT, "tests/fixtures/MANIFEST.json");
const GOLDEN_DIR = join(ROOT, "tests/fixtures/golden");
const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const UPDATE = process.argv.includes("--update");

if (!existsSync(GOLDEN_DIR)) mkdirSync(GOLDEN_DIR, { recursive: true });

// Normalize parser results. Text parsers now return { sections, confidence }
// (Task D2); binary parsers return Section[]. The harness scores sections
// only, so we extract the array for uniform downstream classification.
function normalize(result) {
  return Array.isArray(result) ? result : result.sections;
}

// Dispatch by format. Text dispatchers take a string; binary dispatchers
// take a File-like (buffer wrapped via bufferToFile).
const DISPATCH = {
  txt: { kind: "text", run: (text) => normalize(detectTextStructure(text)) },
  md: { kind: "text", run: (text) => normalize(mdParser(text)) },
  html: { kind: "text", run: (text) => normalize(parseHTMLStructured(text)) },
  epub: { kind: "binary", run: (file) => parseEPUB(file) },
  docx: { kind: "binary", run: (file) => parseDOCX(file) },
  pdf: {
    kind: "binary",
    run: async (file) => {
      await ensurePdfjs();
      return parsePDF(file);
    },
  },
};

const NOEVAL_REASONS = {};

const tally = {
  pass: 0,
  fail: 0,
  skipped_missing: 0,
  skipped_noeval: 0,
  by_format: {},
};

function bumpFormat(format, key) {
  if (!tally.by_format[format]) {
    tally.by_format[format] = { total: 0, usable: 0, false_split: 0, missed_chapter: 0, unscored: 0 };
  }
  tally.by_format[format][key] = (tally.by_format[format][key] || 0) + 1;
}

function classify(sections, expectedSections) {
  // expectedSections in MANIFEST can be number | "varies" | "throws". We
  // only score numeric expectations; everything else lands in "unscored".
  if (typeof expectedSections !== "number") return "unscored";
  const detected = sections.length;
  if (detected === expectedSections) {
    // Single-section documents are whole-document fallbacks; they
    // legitimately have title=null (no heading to derive from). Only
    // multi-section results need every section titled to count as usable.
    if (detected === 1) return "usable";
    // type:"page" sections (PDF per-page fallback) legitimately have
    // title=null — navigation falls back to page numbers in the reader.
    // Only require titles for chapter/section/document types.
    const allTitled = sections.every((s) => s.type === "page" || (s.title != null && String(s.title).trim() !== ""));
    return allTitled ? "usable" : "missed_chapter";
  }
  if (detected > expectedSections) return "false_split";
  return "missed_chapter";
}

for (const [fixtureName, meta] of Object.entries(MANIFEST)) {
  if (fixtureName.startsWith("_")) continue;
  const { format, fixtureMissing, expectedSections } = meta;

  if (fixtureMissing) {
    console.warn(`SKIP ${fixtureName} — fixtureMissing (file not sourced yet)`);
    tally.skipped_missing++;
    continue;
  }

  if (!DISPATCH[format]) {
    console.warn(`NOEVAL ${fixtureName} — ${NOEVAL_REASONS[format] || `no dispatch for ${format}`}`);
    tally.skipped_noeval++;
    bumpFormat(format, "total");
    bumpFormat(format, "unscored");
    continue;
  }

  const fixturePath = join(ROOT, "tests/fixtures", format, fixtureName);
  if (!existsSync(fixturePath)) {
    console.error(`MISSING ${fixtureName} — listed in MANIFEST but file not on disk`);
    tally.fail++;
    continue;
  }

  const goldenPath = join(GOLDEN_DIR, `${fixtureName}.json`);
  const buf = readFileSync(fixturePath);

  // Mirror the production sniff step (App.jsx doUpload): a fixture with
  // .txt extension that's actually MD or HTML should be routed to the
  // upgraded parser. Without this, the eval would never see the sniffer's
  // routing wins.
  const sniffArrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const sniffed = await sniffDocumentType(fixtureName, sniffArrayBuf);
  const effective = sniffed && DISPATCH[sniffed] && sniffed !== format ? sniffed : format;

  let sections;
  try {
    const handler = DISPATCH[effective];
    if (handler.kind === "text") {
      sections = handler.run(buf.toString("utf8"));
    } else {
      sections = await handler.run(bufferToFile(buf));
    }
  } catch (err) {
    if (expectedSections === "throws") {
      console.log(`THROWS-EXPECTED ${fixtureName} — ${err.message}`);
      tally.pass++;
      bumpFormat(format, "total");
      bumpFormat(format, "unscored");
      continue;
    }
    console.error(`PARSE-FAIL ${fixtureName} — ${err.message}`);
    tally.fail++;
    continue;
  }

  if (UPDATE) {
    writeFileSync(goldenPath, JSON.stringify(sections, null, 2));
    console.log(`WROTE ${goldenPath}`);
    bumpFormat(format, "total");
    bumpFormat(format, classify(sections, expectedSections));
    continue;
  }

  if (!existsSync(goldenPath)) {
    console.error(`NO-GOLDEN ${fixtureName} — run with --update to seed`);
    tally.fail++;
    continue;
  }

  const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
  const driftedFromGolden = JSON.stringify(sections) !== JSON.stringify(golden);

  if (driftedFromGolden) {
    console.error(`DRIFT ${fixtureName} — output differs from golden`);
    tally.fail++;
  } else {
    tally.pass++;
  }

  bumpFormat(format, "total");
  bumpFormat(format, classify(sections, expectedSections));
}

console.log("");
console.log("─".repeat(64));
console.log(`golden diff:  pass=${tally.pass} fail=${tally.fail}`);
console.log(`skipped:      fixtureMissing=${tally.skipped_missing}  noEval=${tally.skipped_noeval}`);
console.log("─".repeat(64));
console.log("per-format vs MANIFEST.expectedSections:");
for (const [format, stats] of Object.entries(tally.by_format)) {
  const total = stats.total || 1;
  const pct = (n) => `${((n / total) * 100).toFixed(0)}%`;
  console.log(
    `  ${format.padEnd(5)} total=${stats.total}  usable=${stats.usable}(${pct(stats.usable)})  ` +
      `false_split=${stats.false_split}(${pct(stats.false_split)})  ` +
      `missed_chapter=${stats.missed_chapter}(${pct(stats.missed_chapter)})  ` +
      `unscored=${stats.unscored}`,
  );
}
console.log("─".repeat(64));

if (UPDATE) {
  console.log("--update mode: goldens regenerated. Commit the diff to lock new baseline.");
  process.exit(0);
}
process.exit(tally.fail > 0 ? 1 : 0);
