#!/usr/bin/env node
// upload_library.mjs
//
// Phase 2 companion to the library_schema migration. For each book in
// library_seed.json:
//   1. Read the stripped EPUB from scripts/.cache-stripped/pg{id}.epub
//      (produced by Phase 1's ingest_gutenberg.mjs)
//   2. Compute metrics from the cleaned content (word/chapter count,
//      reading time)
//   3. Upload the EPUB to the 'library' Storage bucket at {uuid}.epub
//   4. INSERT a row into public.library_books with the metrics +
//      blob_path
//
// Idempotent — skips any gutenberg_id already in the table. Re-running
// after a partial failure picks up where the last run left off.
//
// Requires env (typically from .env.local + a fresh SERVICE_ROLE_KEY):
//   VITE_SUPABASE_URL            (or SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY    (NEVER commit — bypasses RLS)
//
// Usage:
//   node --env-file=.env.local scripts/upload_library.mjs
//
//   or (inline service-role only, with VITE_SUPABASE_URL already in .env.local):
//   SUPABASE_SERVICE_ROLE_KEY=sk... node --env-file=.env.local scripts/upload_library.mjs

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STRIPPED_DIR = join(__dirname, ".cache-stripped");
const SEED_PATH = join(__dirname, "library_seed.json");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("✗ Missing env: VITE_SUPABASE_URL (or SUPABASE_URL).");
  console.error("  This is the project URL like https://xxx.supabase.co — already in .env.local for vite.");
  console.error("  Run with: node --env-file=.env.local scripts/upload_library.mjs");
  process.exit(1);
}
if (!SERVICE_ROLE) {
  console.error("✗ Missing env: SUPABASE_SERVICE_ROLE_KEY.");
  console.error("  Get this from Supabase Dashboard → Project Settings → API → service_role secret.");
  console.error("  NEVER commit this key — it bypasses RLS.");
  console.error("  Either add to .env.local (gitignored) or inline on the command line.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- metrics helpers (mirror ingest_gutenberg.mjs for self-contained operation) ---

function htmlToText(html) {
  return html
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

async function extractMetrics(epubBuf) {
  const zip = await JSZip.loadAsync(epubBuf);
  const containerXml = await zip.file("META-INF/container.xml").async("string");
  const opfPath = containerXml.match(/full-path="([^"]+)"/)[1];
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";
  const opf = await zip.file(opfPath).async("string");

  const manifest = {};
  const manifestSection = opf.match(/<manifest[^>]*>([\s\S]*?)<\/manifest>/i)?.[1] ?? "";
  const itemRe = /<item\s+([^>]+?)\/?>/g;
  let m;
  while ((m = itemRe.exec(manifestSection)) !== null) {
    const attrs = m[1];
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

  let combinedText = "";
  let chapterCount = 0;
  for (const path of spineFiles) {
    const fileObj = zip.file(path);
    if (!fileObj) continue;
    const html = await fileObj.async("string");
    combinedText += " " + htmlToText(html);
    const headings = html.match(/<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>/gi) || [];
    for (const h of headings) {
      const t = htmlToText(h);
      if (t && t.length > 0 && t.length < 200) chapterCount++;
    }
  }
  const wordCount = (combinedText.match(/\S+/g) || []).length;
  const readingTimeMin = Math.floor(wordCount / 250);
  return { wordCount, chapterCount, readingTimeMin };
}

// --- main ---

async function main() {
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  console.log(`Library upload — ${seed.books.length} books`);
  console.log(`Target: ${SUPABASE_URL}`);
  console.log("");

  const { data: existing, error: exErr } = await supabase
    .from("library_books")
    .select("gutenberg_id, title");
  if (exErr) {
    console.error("✗ Failed to query existing library_books:", exErr.message);
    console.error("  (Did the migration run? Try Dashboard → SQL Editor and re-run the schema file.)");
    process.exit(1);
  }
  const existingByGid = new Map((existing || []).map((r) => [r.gutenberg_id, r.title]));
  if (existingByGid.size) {
    console.log(`Found ${existingByGid.size} existing row(s); these will be skipped:`);
    for (const [gid, title] of existingByGid) console.log(`  · pg${gid} ${title}`);
    console.log("");
  }

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  for (const book of seed.books) {
    const label = `[${book.rank}/${seed.books.length}] pg${book.id} ${book.title.slice(0, 50)}`;
    process.stdout.write(`${label} ... `);

    if (existingByGid.has(book.id)) {
      console.log("skip (already in DB)");
      skipped++;
      continue;
    }

    const epubPath = join(STRIPPED_DIR, `pg${book.id}.epub`);
    if (!existsSync(epubPath)) {
      console.log(`MISSING ${epubPath} — re-run scripts/ingest_gutenberg.mjs first`);
      failed++;
      continue;
    }
    const epubBuf = readFileSync(epubPath);

    let metrics;
    try {
      metrics = await extractMetrics(epubBuf);
    } catch (e) {
      console.log(`METRICS FAILED: ${e.message}`);
      failed++;
      continue;
    }

    const bookUuid = randomUUID();
    const blobPath = `${bookUuid}.epub`;

    const { error: upErr } = await supabase.storage
      .from("library")
      .upload(blobPath, epubBuf, {
        contentType: "application/epub+zip",
        upsert: false,
      });
    if (upErr) {
      console.log(`UPLOAD FAILED: ${upErr.message}`);
      failed++;
      continue;
    }

    const { error: insErr } = await supabase.from("library_books").insert({
      id: bookUuid,
      gutenberg_id: book.id,
      title: book.title,
      author: book.author,
      publication_date: book.publication_date,
      chapter_count: metrics.chapterCount,
      word_count: metrics.wordCount,
      reading_time_min: metrics.readingTimeMin,
      tier_required: book.tier,
      popularity_rank: book.rank,
      blob_path: blobPath,
      byte_size: epubBuf.length,
    });
    if (insErr) {
      console.log(`DB INSERT FAILED: ${insErr.message}`);
      // Roll back the blob so re-run is clean.
      await supabase.storage.from("library").remove([blobPath]).catch(() => {});
      failed++;
      continue;
    }
    console.log(`✓ uploaded (${(epubBuf.length / 1024).toFixed(1)} KB · ${metrics.wordCount.toLocaleString()} words · ${metrics.chapterCount} chapters)`);
    uploaded++;
  }

  console.log("");
  console.log(`Uploaded: ${uploaded}   Skipped (already in DB): ${skipped}   Failed: ${failed}`);

  const { count } = await supabase
    .from("library_books")
    .select("*", { count: "exact", head: true });
  console.log(`library_books row count now: ${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
