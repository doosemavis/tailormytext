#!/usr/bin/env node
//
// Phase D-8 confidence-score calibration runner.
//
// Reads every book in tests/fixtures/pg-corpus-urls.json, parses the
// corresponding .txt (must have been fetched via fetch-pg-corpus.mjs first),
// and prints a table of { id, title, sections, score, reasons, expected_band }
// for D9 to decide whether the 0.70 cutoff is well-calibrated.
//
// PG plain-text files wrap the book in *** START / *** END boilerplate.
// We strip that here so the parser sees what the production ingest pipeline
// (or a future upload-clean step) would feed it. Without stripping, every
// book inherits a gigantic non-chapter section that hides real heuristic
// signal under size-outlier penalties.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CORPUS_DIR = join(ROOT, "tests/fixtures/pg-corpus");
const URLS_PATH = join(ROOT, "tests/fixtures/pg-corpus-urls.json");

const win = new Window();
globalThis.DOMParser = win.DOMParser;
globalThis.window = win;

const { detectTextStructure } = await import("../src/utils/detectStructure.js");

const START_MARK = /^\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG.+?\*{3}\s*$/im;
const END_MARK = /^\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG.+?\*{3}\s*$/im;

function stripPGBoilerplate(text) {
  const startMatch = text.match(START_MARK);
  const endMatch = text.match(END_MARK);
  if (!startMatch || !endMatch) return text;
  const startIdx = startMatch.index + startMatch[0].length;
  const endIdx = endMatch.index;
  if (endIdx <= startIdx) return text;
  return text.slice(startIdx, endIdx).trim();
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function bandFromScore(score) {
  if (score >= 0.70) return "high";
  if (score >= 0.55) return "uncertain";
  return "fallback";
}

const { books } = JSON.parse(readFileSync(URLS_PATH, "utf8"));

const results = [];
for (const book of books) {
  const path = join(CORPUS_DIR, `${book.id}-${slugify(book.title)}.txt`);
  if (!existsSync(path)) {
    console.error(`  MISSING: ${path} — run scripts/fetch-pg-corpus.mjs first`);
    continue;
  }
  const raw = readFileSync(path, "utf8");
  const text = stripPGBoilerplate(raw);
  const { sections, confidence } = detectTextStructure(text);
  results.push({
    id: book.id,
    title: book.title,
    expected: book.expected_band,
    sections: sections.length,
    score: confidence.score,
    actual: bandFromScore(confidence.score),
    reasons: confidence.reasons.join(",") || "—",
    bytes: text.length,
  });
}

results.sort((a, b) => b.score - a.score);

console.log(
  pad("pg-id", 7) +
    pad("title", 36) +
    pad("expect", 12) +
    pad("score", 7) +
    pad("actual", 11) +
    pad("secs", 6) +
    "reasons",
);
console.log("-".repeat(110));
for (const r of results) {
  console.log(
    pad(r.id, 7) +
      pad(r.title, 36) +
      pad(r.expected, 12) +
      pad(r.score.toFixed(2), 7) +
      pad(r.actual, 11) +
      pad(r.sections, 6) +
      r.reasons,
  );
}

const passed = results.filter((r) => r.score >= 0.70).length;
const uncertain = results.filter((r) => r.score >= 0.55 && r.score < 0.70).length;
const fallback = results.filter((r) => r.score < 0.55).length;

console.log("");
console.log(`Summary: ${passed} high (>=0.70), ${uncertain} uncertain (0.55-0.70), ${fallback} fallback (<0.55)`);
console.log(`D9 ship gate: >=80% at score >=0.70 -> ${Math.ceil(results.length * 0.8)}/${results.length} needed, ${passed} actual`);

const mismatched = results.filter((r) => {
  if (r.expected === "high") return r.actual !== "high";
  if (r.expected === "low") return r.actual === "high";
  return false;
});
if (mismatched.length) {
  console.log("");
  console.log("Expected/actual mismatches:");
  for (const r of mismatched) {
    console.log(`  pg${r.id} ${r.title}: expected ${r.expected}, got ${r.actual} (${r.score.toFixed(2)})`);
  }
}
