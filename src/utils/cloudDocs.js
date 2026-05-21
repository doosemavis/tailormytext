// Supabase-backed document storage and recent-docs index.
//
// Files live in the `documents` bucket at path `{user_id}/{doc_id}.json`,
// shaped as the JSON `{ sections, text }` payload that TailorMyText already
// builds. The recent-docs index lives in the `recent_docs` table; RLS
// policies enforce per-user isolation on both surfaces (see the migration
// in supabase/migrations/).
//
// userId is passed in by the caller rather than fetched via
// supabase.auth.getUser(); the latter triggers a token refresh that fails
// against this project's `sb_publishable_` key and silently signs the
// user out (same root cause as the email-auth raw-fetch workaround in
// AuthContext). The user from useAuth() is already settled and safe.
import { supabase } from "./supabase";
import { MAX_RECENT_DOCS } from "../config/constants";
import { storageGet, storageDel, storageGcOrphanChunks, storageGcUnscopedKeys } from "./storage";

const BUCKET = "documents";
const LIBRARY_BUCKET = "library";

function docPath(userId, docId) {
  return `${userId}/${docId}.json`;
}

function requireUserId(userId) {
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

// List this user's recent uploaded docs (i.e. NOT library books), newest
// first. Library entries are kept in a parallel index — see
// cloudListBookshelf. RLS scopes results to the current auth.uid() too,
// so the .eq is belt-and-suspenders.
//
// Pre-migration rows (before recent_docs.source existed) have source IS NULL
// and are treated as uploads, matching the column's DEFAULT 'upload' for
// new rows.
export async function cloudListRecent(userId) {
  requireUserId(userId);
  const { data, error } = await supabase
    .from("recent_docs")
    .select("id, name, timestamp, chunks, source, book_id, chapter_overrides")
    .eq("user_id", userId)
    .or("source.is.null,source.neq.library")
    .order("timestamp", { ascending: false })
    .limit(MAX_RECENT_DOCS);
  if (error) throw error;
  return data ?? [];
}

// List this user's bookshelf — library books they've previously opened,
// newest first. Distinct from cloudListRecent because uploads and library
// entries are conceptually different (you BORROW from the library; you
// OWN your uploads). The library catalog is small (≤20 books), so this
// is naturally bounded without needing the MAX_RECENT_DOCS trim.
export async function cloudListBookshelf(userId) {
  requireUserId(userId);
  const { data, error } = await supabase
    .from("recent_docs")
    .select("id, name, timestamp, chunks, source, book_id, chapter_overrides")
    .eq("user_id", userId)
    .eq("source", "library")
    .order("timestamp", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Upload a fresh doc, register it in recent_docs, and prune older entries
// past MAX_RECENT_DOCS so the user's library stays bounded. Re-uploading
// the same filename replaces the prior entry.
export async function cloudSaveDoc(userId, name, sections, fullText) {
  requireUserId(userId);

  // Same id-shape useRecentDocs already produces, so migration paths line up.
  const id = name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40) + "_" + Date.now().toString(36);
  const payload = JSON.stringify({ sections, text: fullText });
  const path = docPath(userId, id);

  // Dedup-by-name: find any prior UPLOAD row with this name and remove its
  // storage object + table row first. Library rows with the same name (a
  // user uploaded "Pride and Prejudice.epub" earlier and also added the
  // library edition) are left alone — they live in a different bucket and
  // belong to the bookshelf, not the uploads list.
  const { data: existing } = await supabase
    .from("recent_docs")
    .select("id, source")
    .eq("user_id", userId)
    .eq("name", name);
  const priorIds = (existing ?? []).filter(r => r.source !== "library").map(r => r.id);
  if (priorIds.length) {
    // Task 1.13 — capture cleanup errors. A blob-remove or row-delete failure
    // doesn't block the new upload, but going silent here leaves orphan blobs
    // / duplicate rows that nobody notices until a storage audit.
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(priorIds.map(pid => docPath(userId, pid)));
    if (rmErr) console.warn("[cloudDocs] prior-doc blob remove failed:", rmErr.message);
    const { error: delErr } = await supabase.from("recent_docs").delete().eq("user_id", userId).in("id", priorIds);
    if (delErr) console.warn("[cloudDocs] prior-doc row delete failed:", delErr.message);
  }

  // Upload the JSON blob.
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([payload], { type: "application/json" }), { upsert: true });
  if (upErr) throw upErr;

  // Register in recent_docs.
  const entry = { id, user_id: userId, name, timestamp: Date.now(), chunks: 1 };
  const { error: insErr } = await supabase.from("recent_docs").insert(entry);
  if (insErr) {
    // Roll back the upload so we don't orphan a blob.
    await supabase.storage.from(BUCKET).remove([path]);
    throw insErr;
  }

  // Trim uploads to MAX_RECENT_DOCS — fetch all this user's UPLOAD entries
  // and drop anything past the limit (oldest by timestamp). Library entries
  // are excluded from the trim: they live in the user's bookshelf, are
  // bounded by the small library catalog (~20 books), and removing them
  // would orphan saved positions without freeing any of THIS user's
  // storage (the blob is shared across the library bucket).
  const { data: uploadRows } = await supabase
    .from("recent_docs")
    .select("id, timestamp")
    .eq("user_id", userId)
    .or("source.is.null,source.neq.library")
    .order("timestamp", { ascending: false });
  const overflow = (uploadRows ?? []).slice(MAX_RECENT_DOCS);
  if (overflow.length) {
    // Task 1.14 — same as above for the overflow trim. A storage error here
    // means we'll see a "Recent Documents over the cap" state for a refresh
    // or two; better to know than to wonder.
    const overflowIds = overflow.map(r => r.id);
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(overflowIds.map(oid => docPath(userId, oid)));
    if (rmErr) console.warn("[cloudDocs] overflow blob remove failed:", rmErr.message);
    const { error: delErr } = await supabase.from("recent_docs").delete().eq("user_id", userId).in("id", overflowIds);
    if (delErr) console.warn("[cloudDocs] overflow row delete failed:", delErr.message);
  }

  return { id, name, timestamp: entry.timestamp, chunks: 1 };
}

// Fetch a previously-uploaded doc's content. Returns null if missing or
// unparseable so callers can show a "no longer available" state instead
// of crashing.
//
// Side effect: updates last_accessed_at so the TTL clock resets. Without
// this, opening a doc you read every day would still get it deleted after
// 7 days from upload — the cleanup_expired_docs() cron job uses
// last_accessed_at, not the original timestamp. The update is fire-and-
// forget; a failure to refresh the timer doesn't block the read.
export async function cloudLoadDoc(userId, entry) {
  requireUserId(userId);
  const { data: blob, error } = await supabase.storage
    .from(BUCKET)
    .download(docPath(userId, entry.id));
  if (error || !blob) return null;
  // Refresh the last-access timestamp; ignore errors so a transient DB
  // hiccup doesn't break the user's read.
  supabase
    .from("recent_docs")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", entry.id)
    .then(({ error: upErr }) => {
      if (upErr) console.warn("[cloudDocs] failed to refresh last_accessed_at:", upErr.message);
    });
  // Two distinguishable failure modes:
  //   - null            → blob is missing on the server (handled above)
  //   - { error: ... }  → blob downloaded but its contents are unusable
  // App.jsx can show different user copy for each ("re-upload" vs "damaged").
  let text;
  try {
    text = await blob.text();
  } catch (err) {
    console.warn("[cloudDocs] blob.text() failed:", err.message);
    return { error: "corrupted", name: entry.name };
  }
  let d;
  try {
    d = JSON.parse(text);
  } catch (err) {
    console.warn("[cloudDocs] document JSON parse failed:", err.message);
    return { error: "corrupted", name: entry.name };
  }
  if (!d || typeof d !== "object") {
    return { error: "corrupted", name: entry.name };
  }
  return {
    sections: d.sections,
    text: d.text,
    name: entry.name,
    chapterOverrides: entry.chapter_overrides ?? null,
  };
}

// Persist user-defined chapter break overrides for an uploaded doc.
// Callers (e.g. ChapterReview modal) pass the full overrides object;
// any prior value is replaced. Row must already exist (created by
// cloudSaveDoc on first upload) — update-only is correct here.
export async function cloudSaveChapterOverrides(docId, overrides) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("recent_docs")
    .update({ chapter_overrides: overrides })
    .eq("id", docId)
    .eq("user_id", user.id);
  if (error) throw error;
}

// Remove a recent-docs entry. Source-aware:
//   - Upload entries: delete the storage blob too (user's own per-user file).
//   - Library entries: leave the shared blob and library_reads alone — only
//     hide from Recent Documents. The book stays in the catalog; if the user
//     re-opens it from the Library section, their saved position is intact.
export async function cloudRemoveDoc(userId, id) {
  requireUserId(userId);

  const { data: row } = await supabase
    .from("recent_docs")
    .select("source")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (row?.source !== "library") {
    // Upload entry (or pre-migration row without a source value — default
    // to upload behavior). Library entries skip storage removal because
    // the blob is shared across users.
    await supabase.storage.from(BUCKET).remove([docPath(userId, id)]);
  }

  const { error } = await supabase.from("recent_docs").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────
// Library — curated Project Gutenberg books, shared across all users.
//
// Catalog lives in public.library_books (read-anyone-authed).
// EPUB blobs live in the public 'library' Storage bucket at {uuid}.epub.
// Per-user reading state lives in public.library_reads (RLS per user_id).
//
// Tier enforcement: catalog SELECT is open (so the UI can show every book
// to every user, locked or not). cloudOpenLibraryBook is the gate — Pro
// books refuse to load for free users and return a `gated` result that
// the caller turns into a PaywallModal.
// ─────────────────────────────────────────────────────────────────────────

// Fetch the full library catalog ordered by popularity. Tier filtering
// happens at load time, not here — the UI shows the whole catalog so
// free users can see (and be tempted by) the Pro titles.
export async function cloudListLibrary() {
  const { data, error } = await supabase
    .from("library_books")
    .select("id, gutenberg_id, title, author, publication_date, edition, chapter_count, word_count, reading_time_min, tier_required, popularity_rank, blob_path, byte_size")
    .order("popularity_rank", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Open a library book — tier-gated.
//
// Returns:
//   { blob, book }              — success; hand `blob` to the existing
//                                  EPUB parser (same one upload uses).
//   { gated: true, requiredTier, book } — caller should pop PaywallModal.
//   null                        — book missing or blob unreachable.
//
// Side effects on success:
//   - upserts library_reads to bump last_open (preserves any prior position)
//   - mirrors into recent_docs with source='library' so the entry surfaces
//     in Recent Documents on next render (per the v1 UX rule).
export async function cloudOpenLibraryBook(userId, bookId, userIsPro) {
  requireUserId(userId);

  const { data: book, error: bookErr } = await supabase
    .from("library_books")
    .select("*")
    .eq("id", bookId)
    .single();
  if (bookErr || !book) return null;

  if (book.tier_required === "pro" && !userIsPro) {
    return { gated: true, requiredTier: "pro", book };
  }

  const { data: blob, error: dlErr } = await supabase.storage
    .from(LIBRARY_BUCKET)
    .download(book.blob_path);
  if (dlErr || !blob) return null;

  // Mirror into recent_docs. id = book.id (uuid) so re-opens dedup
  // cleanly; source column disambiguates from upload entries.
  const { error: rdErr } = await supabase
    .from("recent_docs")
    .upsert({
      id: book.id,
      user_id: userId,
      name: book.title,
      timestamp: Date.now(),
      chunks: 1,
      source: "library",
      book_id: book.id,
    }, { onConflict: "user_id,id" });
  if (rdErr) console.warn("[cloudDocs] failed to mirror library book into recent_docs:", rdErr.message);

  // Fire-and-forget: bump last_open on library_reads. Position (if any)
  // is preserved by the partial-update shape of this upsert.
  supabase
    .from("library_reads")
    .upsert(
      { user_id: userId, book_id: book.id, last_open: new Date().toISOString() },
      { onConflict: "user_id,book_id" }
    )
    .then(({ error }) => {
      if (error) console.warn("[cloudDocs] failed to upsert library_reads:", error.message);
    });

  // Task 1.12 — surface the recent_docs mirror failure so App.jsx can show
  // a non-blocking toast ("Your bookshelf might not refresh until you reload").
  // The book itself opens fine; only the Recent Documents / Bookshelf
  // sidebar mirror is stale.
  return rdErr ? { blob, book, mirrorError: true } : { blob, book };
}

// Persist reading position for a library book. Mirrors how upload
// position memory works, but stored in library_reads instead of in
// the per-user documents bucket. `position` shape is opaque to the
// schema — the reader picks the format (section index + offset today).
export async function cloudSaveLibraryPosition(userId, bookId, position) {
  requireUserId(userId);
  const { error } = await supabase
    .from("library_reads")
    .upsert(
      { user_id: userId, book_id: bookId, position, last_open: new Date().toISOString() },
      { onConflict: "user_id,book_id" }
    );
  if (error) throw error;
}

// Fetch a previously-saved reading position. Returns null if the user
// has never opened this book or has no saved position.
export async function cloudLoadLibraryPosition(userId, bookId) {
  requireUserId(userId);
  const { data, error } = await supabase
    .from("library_reads")
    .select("position, last_open")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .maybeSingle();
  // Task 1.11 — distinguish "no saved position" (null data) from "couldn't
  // talk to the server" (error). Throwing lets App.jsx fall back to scroll
  // position 0 with an explicit catch rather than silently starting from
  // the top as if the user had never opened the book.
  if (error) throw new Error(`Failed to load library position: ${error.message}`);
  if (!data) return null;
  return data;
}

// One-time migration: lift any docs from the previous localStorage layout
// into Supabase, then delete the localStorage entries. Safe to call on
// every load — if there's nothing in localStorage it returns immediately.
// Failures on individual entries don't abort the rest; partial migrations
// can resume on the next call (cloudSaveDoc dedups by name).
//
// Returns { migrated: number, failed: number } so callers can decide
// whether to surface anything to the user.
export async function migrateLocalToCloud(userId) {
  requireUserId(userId);

  // Run the unscoped-key sweep on every call — it's a one-time-per-browser
  // cleanup for pre-user-scoping leftovers and has to run even when there's
  // nothing to actually migrate (otherwise users with no legacy docs never
  // get the cleanup).
  storageGcUnscopedKeys();

  const recentRaw = await storageGet("readflow-recent");
  if (!recentRaw) return { migrated: 0, failed: 0 };

  let entries;
  try { entries = JSON.parse(recentRaw); } catch { entries = null; }
  if (!Array.isArray(entries) || entries.length === 0) {
    // Nothing to migrate but recent key exists — clean it up.
    await storageDel("readflow-recent");
    return { migrated: 0, failed: 0 };
  }

  let migrated = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      const n = entry.chunks || 1;
      const parts = [];
      let allRead = true;
      for (let c = 0; c < n; c++) {
        const v = await storageGet(`readflow-doc:${entry.id}:${c}`);
        if (v === null) { allRead = false; break; }
        parts.push(v);
      }
      if (!allRead) {
        // Partial chunks on disk — can't reconstruct, skip.
        failed++;
        continue;
      }

      const data = JSON.parse(parts.join(""));
      await cloudSaveDoc(userId, entry.name, data.sections, data.text);
      migrated++;

      // Clean up this doc's chunks now that it's safely in Supabase.
      for (let c = 0; c < n; c++) await storageDel(`readflow-doc:${entry.id}:${c}`);
      // Legacy single-key fallback (early useRecentDocs format).
      await storageDel(`readflow-doc:${entry.id}`);
    } catch (e) {
      console.warn(`[migration] failed to migrate "${entry.name}":`, e.message);
      failed++;
    }
  }

  // Always clean the recent-list key — anything still on disk is either
  // already migrated or unrecoverable, and leaving it would re-attempt
  // failed migrations forever.
  await storageDel("readflow-recent");

  // Sweep any remaining orphan chunks under this user's scope (covers the
  // pre-Phase-1 quota-death-spiral case where chunks accumulated without
  // a recent-list entry referencing them).
  storageGcOrphanChunks([]);

  return { migrated, failed };
}
