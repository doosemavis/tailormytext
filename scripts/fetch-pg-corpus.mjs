#!/usr/bin/env node
//
// Phase D-8 PG corpus fetcher.
//
// Respects Project Gutenberg's robot policy: no /browse/* (we use
// /cache/epub/ which is the sanctioned bulk-cache endpoint), and a
// 2-second per-request delay (the policy's stated minimum for any
// automated fetcher).
//
// Output: tests/fixtures/pg-corpus/{id}-{slug}.txt
// Source list: tests/fixtures/pg-corpus-urls.json

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CORPUS_DIR = join(ROOT, "tests/fixtures/pg-corpus");
const URLS_PATH = join(ROOT, "tests/fixtures/pg-corpus-urls.json");

const DELAY_MS = 2000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; TailorMyText-D8-calibration/1.0; +https://tailormytext.com)";

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchOne(book) {
  const url = `https://www.gutenberg.org/cache/epub/${book.id}/pg${book.id}.txt`;
  const dest = join(CORPUS_DIR, `${book.id}-${slugify(book.title)}.txt`);

  if (existsSync(dest)) {
    return { book, status: "cached", path: dest };
  }

  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      return { book, status: "error", reason: `HTTP ${res.status}` };
    }
    const text = await res.text();
    writeFileSync(dest, text);
    return { book, status: "fetched", path: dest, bytes: text.length };
  } catch (err) {
    return { book, status: "error", reason: err.message };
  }
}

async function main() {
  if (!existsSync(CORPUS_DIR)) mkdirSync(CORPUS_DIR, { recursive: true });

  const { books } = JSON.parse(readFileSync(URLS_PATH, "utf8"));
  console.log(`[fetch-pg-corpus] ${books.length} books, ${DELAY_MS}ms delay between requests`);

  const results = [];
  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    process.stdout.write(`  [${i + 1}/${books.length}] pg${book.id} ${book.title}… `);
    const result = await fetchOne(book);
    if (result.status === "cached") {
      console.log("(cached)");
    } else if (result.status === "fetched") {
      console.log(`${(result.bytes / 1024).toFixed(1)} KB`);
    } else {
      console.log(`FAILED — ${result.reason}`);
    }
    results.push(result);
    if (i < books.length - 1 && result.status === "fetched") {
      await sleep(DELAY_MS);
    }
  }

  const fetched = results.filter((r) => r.status === "fetched").length;
  const cached = results.filter((r) => r.status === "cached").length;
  const errors = results.filter((r) => r.status === "error");

  console.log(
    `\n[fetch-pg-corpus] ${fetched} fetched, ${cached} cached, ${errors.length} error${errors.length === 1 ? "" : "s"}`,
  );
  if (errors.length) {
    console.log("Errors:");
    for (const e of errors) {
      console.log(`  pg${e.book.id} ${e.book.title}: ${e.reason}`);
    }
    process.exit(1);
  }
}

main();
