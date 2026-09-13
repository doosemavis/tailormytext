#!/usr/bin/env node
// remove_library_book.mjs
//
// Cleanup companion to upload_library.mjs. Removes a single book from
// public.library_books AND its EPUB blob from the 'library' Storage
// bucket. Use this when retiring a book from library_seed.json so the
// DB + storage stay aligned with the seed.
//
// Idempotent: if the row doesn't exist, exits cleanly with a notice.
// If the row exists but the blob is already gone, deletes the row and
// reports the missing blob without failing.
//
// Requires the same env as upload_library.mjs (VITE_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY):
//
//   node --env-file=.env --env-file=.env.local scripts/remove_library_book.mjs --book <pg-id>

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("✗ Missing env: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  console.error("  Run with: node --env-file=.env --env-file=.env.local scripts/remove_library_book.mjs --book <pg-id>");
  process.exit(1);
}

const args = process.argv.slice(2);
const bookIdx = args.indexOf("--book");
const bookId = bookIdx >= 0 ? Number(args[bookIdx + 1]) : NaN;
if (!Number.isInteger(bookId)) {
  console.error("✗ Usage: --book <pg-id>  (e.g. --book 1259)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: row, error: selErr } = await supabase
  .from("library_books")
  .select("id, gutenberg_id, title")
  .eq("gutenberg_id", bookId)
  .maybeSingle();

if (selErr) {
  console.error(`✗ SELECT failed: ${selErr.message}`);
  process.exit(1);
}
if (!row) {
  console.log(`No library_books row found for pg${bookId}. Nothing to do.`);
  process.exit(0);
}

console.log(`Removing pg${bookId} "${row.title}" (id=${row.id})`);

const blobPath = `${row.id}.epub`;
const { error: rmErr } = await supabase.storage.from("library").remove([blobPath]);
if (rmErr) {
  console.warn(`  Storage remove warning: ${rmErr.message} (continuing)`);
} else {
  console.log(`  ✓ deleted storage blob: ${blobPath}`);
}

const { error: delErr } = await supabase
  .from("library_books")
  .delete()
  .eq("gutenberg_id", bookId);
if (delErr) {
  console.error(`✗ DELETE failed: ${delErr.message}`);
  process.exit(1);
}
console.log(`  ✓ deleted library_books row for pg${bookId}`);
console.log("Done.");
