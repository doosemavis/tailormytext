#!/usr/bin/env node
// ingest_gutenberg.mjs
//
// Phase 1 — offline validation only. Downloads N EPUBs from Project Gutenberg,
// strips PG header/footer/license boilerplate from every spine document, runs
// sanity checks against the cleaned content, writes a per-book validation
// report and a stripped EPUB to scripts/.cache-stripped/.
//
// Honors PG's robot-access policy:
//   - 2-second delay between downloads (matches their wget -w 2 exception)
//   - Custom User-Agent so traffic is identifiable
//   - Cached downloads are reused across runs (no re-fetching)
//
// Usage:
//   node scripts/ingest_gutenberg.mjs                 # all books in seed
//   node scripts/ingest_gutenberg.mjs --book 1342     # one book by ID
//   node scripts/ingest_gutenberg.mjs --from 6        # resume from rank 6
//
// No database writes. No uploads. Phase 2 will add those after we eyeball
// the validation reports and confirm the stripping logic is sound.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import JSZip from "jszip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, ".cache");
const STRIPPED_DIR = join(__dirname, ".cache-stripped");
const REPORT_DIR = join(__dirname, "validation-report");
const SEED_PATH = join(__dirname, "library_seed.json");

const SLEEP_MS = 2000;
const PG = "https://www.gutenberg.org";
const UA = "TailorMyText-ingest/0.1 (https://tailormytext.com; contact: support@tailormytext.com)";

const PG_START_RE = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i;
const PG_END_RE = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i;

// Residue patterns we DON'T want to see in cleaned text. Tuned to catch
// actual license/marker boilerplate without false-flagging incidental
// mentions — e.g. multi-volume PG editions like the d'Artagnan trilogy
// legitimately include a "LINKED INDEX OF PROJECT GUTENBERG VOLUMES"
// cross-reference page inside the book content.
const RESIDUE_PATTERNS = [
  /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG/i,
  /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG/i,
  /This eBook is for the use of anyone anywhere/i,
  /Project Gutenberg Literary Archive Foundation/i,
  /Section\s+\d+\.\s+Information about Donations/i,
];

for (const dir of [CACHE_DIR, STRIPPED_DIR, REPORT_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
const args = process.argv.slice(2);

function argValue(arr, flag) {
  const i = arr.indexOf(flag);
  return i >= 0 && i + 1 < arr.length ? arr[i + 1] : null;
}

let books = seed.books;
const bookArg = argValue(args, "--book");
const fromArg = argValue(args, "--from");
if (bookArg) books = books.filter((b) => String(b.id) === String(bookArg));
if (fromArg) books = books.filter((b) => b.rank >= Number(fromArg));

// --- HTTP ---

async function fetchEpub(book) {
  const cached = join(CACHE_DIR, `pg${book.id}.epub`);
  if (existsSync(cached)) {
    return { buf: readFileSync(cached), fromCache: true, url: cached };
  }
  // URL preference order: prefer no-images variants for storage/bandwidth
  // economy. TailorMyText is typography-focused; illustrations aren't
  // load-bearing for these classics, and 84MB per book (Count of Monte Cristo
  // with woodcut illustrations) is a meaningful per-user transfer cost.
  // Images variants kept as fallback in case a book only ships illustrated.
  const candidates = [
    `${PG}/ebooks/${book.id}.epub.noimages`,                   // text-only, smallest
    `${PG}/cache/epub/${book.id}/pg${book.id}.epub`,           // older format, usually text-only
    `${PG}/ebooks/${book.id}.epub3.images`,                    // modern, with images
    `${PG}/ebooks/${book.id}.epub.images`,                     // legacy with images
    `${PG}/cache/epub/${book.id}/pg${book.id}-images-3.epub`,
    `${PG}/cache/epub/${book.id}/pg${book.id}-images.epub`,
  ];
  let lastErr = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/epub+zip,*/*" },
        redirect: "follow",
      });
      if (!res.ok) {
        lastErr = `${res.status} ${res.statusText} @ ${url}`;
        continue;
      }
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("text/html")) {
        lastErr = `got HTML (probably 404) @ ${url}`;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 10_000) {
        lastErr = `download too small (${buf.length}) @ ${url}`;
        continue;
      }
      writeFileSync(cached, buf);
      return { buf, fromCache: false, url };
    } catch (e) {
      lastErr = `${e.message} @ ${url}`;
    }
  }
  throw new Error(`No working EPUB URL for pg${book.id}. Last error: ${lastErr}`);
}

// --- EPUB plumbing ---

async function loadEpub(buf) {
  const zip = await JSZip.loadAsync(buf);

  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) throw new Error("missing META-INF/container.xml");

  const opfMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfMatch) throw new Error("container.xml has no full-path");
  const opfPath = opfMatch[1];
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";

  const opf = await zip.file(opfPath).async("string");

  const manifest = {};
  const manifestSection = opf.match(/<manifest[^>]*>([\s\S]*?)<\/manifest>/i)?.[1] ?? "";
  const itemRe = /<item\s+([^>]+?)\/?>/g;
  let im;
  while ((im = itemRe.exec(manifestSection)) !== null) {
    const attrs = im[1];
    const id = attrs.match(/\bid="([^"]+)"/)?.[1];
    const href = attrs.match(/\bhref="([^"]+)"/)?.[1];
    const media = attrs.match(/\bmedia-type="([^"]+)"/)?.[1] || "";
    if (id && href && /xhtml|html/.test(media)) manifest[id] = href;
  }

  const spineSection = opf.match(/<spine[^>]*>([\s\S]*?)<\/spine>/i)?.[1] ?? "";
  const spineRe = /<itemref\s+[^>]*?idref="([^"]+)"/g;
  const spineFiles = [];
  let sm;
  while ((sm = spineRe.exec(spineSection)) !== null) {
    const href = manifest[sm[1]];
    if (href) spineFiles.push(opfDir ? `${opfDir}/${href}` : href);
  }

  return { zip, opfPath, opfDir, spineFiles };
}

// --- Stripping ---

// Replace the entire <body>...</body> with an empty body, preserving the
// XHTML/HTML wrapper so the file remains a valid EPUB resource. Used for
// PG front/back matter (cover, title page, colophon, license) that sits
// outside the START/END marker range and would otherwise leak branding
// into the reader.
function blankBody(html) {
  const bodyRe = /<body[^>]*>[\s\S]*?<\/body>/i;
  if (bodyRe.test(html)) {
    return html.replace(bodyRe, "<body></body>");
  }
  // No body tag found — return the wrapper minus inner content.
  return html.replace(/>[\s\S]*</, "><");
}

function stripBoilerplateFromXhtml(html) {
  let out = html;
  const stripped = { start: false, end: false };

  const startMatch = out.match(PG_START_RE);
  if (startMatch) {
    const after = startMatch.index + startMatch[0].length;
    const bodyOpenIdx = out.toLowerCase().search(/<body[^>]*>/);
    if (bodyOpenIdx >= 0) {
      const bodyOpenMatch = out.slice(bodyOpenIdx).match(/<body[^>]*>/i)[0];
      const head = out.slice(0, bodyOpenIdx + bodyOpenMatch.length);
      const tail = out.slice(after);
      out = head + "\n" + tail;
    } else {
      out = out.slice(after);
    }
    stripped.start = true;
  }

  const endMatch = out.match(PG_END_RE);
  if (endMatch) {
    const before = endMatch.index;
    const bodyCloseIdx = out.toLowerCase().indexOf("</body>", before);
    const htmlCloseIdx = out.toLowerCase().indexOf("</html>", before);
    let tail = "";
    if (bodyCloseIdx >= 0) tail += "</body>";
    if (htmlCloseIdx >= 0) tail += "</html>";
    out = out.slice(0, before) + tail;
    stripped.end = true;
  }

  return { html: out, stripped };
}

function htmlToText(html) {
  return html
    // Strip <head> first — readers never display its content (titles in tabs,
    // not in pages). If we leave it in, per-file <title>Pride and Prejudice |
    // Project Gutenberg</title> bleeds into our residue sanity check as a
    // false positive, even though it's invisible to users.
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

function detectChapters(strippedByPath, spineFiles) {
  const titles = [];
  for (const path of spineFiles) {
    const html = strippedByPath[path] || "";
    const headings = html.match(/<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>/gi) || [];
    for (const h of headings) {
      const t = htmlToText(h);
      if (t && t.length > 0 && t.length < 200) titles.push(t);
    }
  }
  return titles;
}

// --- Per-book pipeline ---

async function processBook(book) {
  const t0 = Date.now();
  const log = [];
  const push = (s) => log.push(s);

  push(`================================================================`);
  push(`Book #${book.rank}  •  ${book.title}`);
  push(`Author: ${book.author}`);
  push(`Published: ${book.publication_date}`);
  push(`Gutenberg ID: ${book.id}`);
  push(`Tier: ${book.tier}`);
  push(`================================================================`);
  push("");

  let fetchResult;
  try {
    fetchResult = await fetchEpub(book);
    push(`Download: ${fetchResult.fromCache ? "from cache" : "fetched"}  •  ${fetchResult.buf.length.toLocaleString()} bytes`);
    push(`Source: ${fetchResult.url}`);
  } catch (e) {
    push(`✗ DOWNLOAD FAILED: ${e.message}`);
    return { ok: false, book, report: log.join("\n"), metrics: null };
  }

  let epubData;
  try {
    epubData = await loadEpub(fetchResult.buf);
  } catch (e) {
    push(`✗ EPUB LOAD FAILED: ${e.message}`);
    return { ok: false, book, report: log.join("\n"), metrics: null };
  }
  const { zip, spineFiles } = epubData;
  push(`Spine files: ${spineFiles.length}`);
  push("");

  // Pass 1: read every spine file, locate which one holds the START marker
  // and which holds the END marker. Files OUTSIDE that range are PG front/
  // back matter (cover, title page, license, colophon) and get blanked.
  const originals = [];
  let startFileIdx = -1;
  let endFileIdx = -1;
  for (let i = 0; i < spineFiles.length; i++) {
    const path = spineFiles[i];
    const fileObj = zip.file(path);
    if (!fileObj) {
      originals.push(null);
      continue;
    }
    const html = await fileObj.async("string");
    originals.push(html);
    if (startFileIdx === -1 && PG_START_RE.test(html)) startFileIdx = i;
    if (PG_END_RE.test(html)) endFileIdx = i; // last match wins
  }
  // If we never found START, treat first spine file as the start (defensive).
  if (startFileIdx === -1) startFileIdx = 0;
  // If we never found END, treat last spine file as the end (defensive).
  if (endFileIdx === -1) endFileIdx = spineFiles.length - 1;

  // Pass 2: produce cleaned content for each file
  const strippedByPath = {};
  let startStripped = false;
  let endStripped = false;
  let blankedBefore = 0;
  let blankedAfter = 0;
  let combinedText = "";
  for (let i = 0; i < spineFiles.length; i++) {
    const path = spineFiles[i];
    const html = originals[i];
    if (html == null) continue;
    let cleaned;
    if (i < startFileIdx) {
      // Front matter (cover, title page) — replace body with empty
      cleaned = blankBody(html);
      blankedBefore++;
    } else if (i > endFileIdx) {
      // Back matter (colophon, license) — replace body with empty
      cleaned = blankBody(html);
      blankedAfter++;
    } else {
      // Content range — strip START/END markers within the file
      const r = stripBoilerplateFromXhtml(html);
      cleaned = r.html;
      if (r.stripped.start) startStripped = true;
      if (r.stripped.end) endStripped = true;
    }
    strippedByPath[path] = cleaned;
    combinedText += "\n" + htmlToText(cleaned);
    zip.file(path, cleaned);
  }
  combinedText = combinedText.replace(/\s+/g, " ").trim();

  push(`--- Strip pass ---`);
  push(`Spine layout:           [${spineFiles.length} files] start=${startFileIdx} end=${endFileIdx}`);
  push(`Blanked front matter:   ${blankedBefore} file(s)`);
  push(`Blanked back matter:    ${blankedAfter} file(s)`);
  push(`Start marker stripped:  ${startStripped ? "yes" : "no"}`);
  push(`End marker stripped:    ${endStripped ? "yes" : "no"}`);
  push("");

  const wordCount = (combinedText.match(/\S+/g) || []).length;
  const titles = detectChapters(strippedByPath, spineFiles);
  const chapterCount = titles.length;
  const readingMin = Math.floor(wordCount / 250);

  const first500 = combinedText.slice(0, 500);
  const last500 = combinedText.slice(-500);
  const residueAtStart = RESIDUE_PATTERNS.some((re) => re.test(first500));
  const residueAtEnd = RESIDUE_PATTERNS.some((re) => re.test(last500));

  push(`--- Metrics ---`);
  push(`Word count:            ${wordCount.toLocaleString()}`);
  push(`Reading time @ 250wpm: ~${readingMin} min (~${Math.floor(readingMin / 60)}h ${readingMin % 60}m)`);
  push(`Detected chapters:     ${chapterCount}`);
  push("");

  push(`--- First 500 chars (after strip) ---`);
  push(first500);
  push("");
  push(`--- Last 500 chars (after strip) ---`);
  push(last500);
  push("");

  push(`--- Boilerplate residue check ---`);
  push(`Residue near start? ${residueAtStart ? "✗ YES — INSPECT" : "✓ no"}`);
  push(`Residue near end?   ${residueAtEnd ? "✗ YES — INSPECT" : "✓ no"}`);
  push("");

  push(`--- First 20 detected chapter titles ---`);
  for (const t of titles.slice(0, 20)) push(`  • ${t}`);
  if (titles.length > 20) push(`  ... +${titles.length - 20} more`);
  push("");

  const ok = !residueAtStart && !residueAtEnd && wordCount > 1000 && chapterCount >= 1;
  push(`========================================`);
  push(`VERDICT: ${ok ? "✓ PASS" : "✗ NEEDS REVIEW"}`);
  push(`Elapsed: ${Date.now() - t0}ms`);
  push(`========================================`);

  const strippedBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const strippedPath = join(STRIPPED_DIR, `pg${book.id}.epub`);
  writeFileSync(strippedPath, strippedBuf);

  return {
    ok,
    book,
    metrics: {
      wordCount,
      chapterCount,
      readingMin,
      residueAtStart,
      residueAtEnd,
      origBytes: fetchResult.buf.length,
      strippedBytes: strippedBuf.length,
    },
    report: log.join("\n"),
  };
}

// --- Main ---

async function main() {
  console.log(`Project Gutenberg ingest validator`);
  console.log(`Books to process: ${books.length}`);
  console.log(`Cache: ${CACHE_DIR}`);
  console.log(`Reports: ${REPORT_DIR}`);
  console.log("");

  const results = [];
  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const cached = existsSync(join(CACHE_DIR, `pg${book.id}.epub`));
    process.stdout.write(`[${i + 1}/${books.length}] pg${book.id} ${book.title.slice(0, 50)} ... `);
    const result = await processBook(book);
    writeFileSync(join(REPORT_DIR, `pg${book.id}.txt`), result.report);
    results.push(result);
    process.stdout.write(`${result.ok ? "PASS" : "REVIEW"} (${result.metrics?.wordCount?.toLocaleString() ?? "?"} words)\n`);
    if (i < books.length - 1 && !cached) await sleep(SLEEP_MS);
  }

  const summary = [];
  summary.push(`# Library Ingest Validation — Summary`);
  summary.push(``);
  summary.push(`- Generated: ${new Date().toISOString()}`);
  summary.push(`- Total: ${results.length}`);
  summary.push(`- Passed: ${results.filter((r) => r.ok).length}`);
  summary.push(`- Needs review: ${results.filter((r) => !r.ok).length}`);
  summary.push(``);
  summary.push(`| Rank | ID | Title | Words | Chapters | Reading | Stripped Size | Verdict |`);
  summary.push(`|---|---|---|---|---|---|---|---|`);
  for (const r of results) {
    const m = r.metrics || {};
    summary.push(
      `| ${r.book.rank} | ${r.book.id} | ${r.book.title.slice(0, 40)}${r.book.title.length > 40 ? "…" : ""} ` +
        `| ${m.wordCount?.toLocaleString() ?? "—"} | ${m.chapterCount ?? "—"} ` +
        `| ${m.readingMin ? `~${Math.floor(m.readingMin / 60)}h ${m.readingMin % 60}m` : "—"} ` +
        `| ${m.strippedBytes?.toLocaleString() ?? "—"} | ${r.ok ? "✓ PASS" : "✗ REVIEW"} |`
    );
  }
  summary.push(``);
  summary.push(`---`);
  summary.push(`See per-book details in \`pg{id}.txt\` files in this directory.`);
  writeFileSync(join(REPORT_DIR, "_SUMMARY.md"), summary.join("\n"));

  console.log("");
  console.log(`Done.`);
  console.log(`Reports:        ${REPORT_DIR}`);
  console.log(`Stripped EPUBs: ${STRIPPED_DIR}`);
  console.log(`Summary:        ${REPORT_DIR}/_SUMMARY.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
