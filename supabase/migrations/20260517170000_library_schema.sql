-- Phase 2 of the library feature: provision the schema for a curated
-- Project Gutenberg library — a shared catalog of public-domain books
-- readable by every authenticated user, with per-user reading position
-- tracked separately so users see "where I left off" on their next visit.
--
-- The corresponding ingest pipeline:
--   scripts/ingest_gutenberg.mjs  (Phase 1, offline EPUB cleanup + validation)
--   scripts/upload_library.mjs    (Phase 2, this migration's companion uploader)
--
-- Idempotent. Run in the Supabase SQL Editor (Dashboard → SQL Editor → New query).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Storage bucket for library EPUBs
--    Path convention: {book_id}.epub  (no user folder — books are shared)
--    Public bucket — these are public-domain works, anyone can read them.
--    Writes are restricted to the service role: no INSERT/UPDATE/DELETE
--    policies are created for anon/authenticated, so only the upload
--    script (which uses SUPABASE_SERVICE_ROLE_KEY) can mutate this bucket.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('library', 'library', true)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. library_books — catalog of available titles
--    One row per Gutenberg book. Catalog is global; tier_required gates
--    which titles each user can open (enforced in the load path, not via
--    row-level SELECT — every authed user can SEE the catalog).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.library_books (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gutenberg_id        integer NOT NULL UNIQUE,
  title               text NOT NULL,
  author              text NOT NULL,
  publication_date    text,                            -- 4-digit year, e.g. "1813"; null when unknown
  edition             text,                            -- transcription edition note, optional
  chapter_count       integer NOT NULL,
  word_count          integer NOT NULL,
  reading_time_min    integer NOT NULL,
  tier_required       text NOT NULL CHECK (tier_required IN ('free', 'pro')),
  popularity_rank     integer NOT NULL,                -- 1..N display order within tier
  blob_path           text NOT NULL,                   -- path inside the 'library' bucket
  byte_size           integer NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_library_books_tier_rank
  ON public.library_books (tier_required, popularity_rank);

ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the full catalog. No client-side writes —
-- inserts happen via service-role only (upload script).
DROP POLICY IF EXISTS "authenticated read library_books" ON public.library_books;

CREATE POLICY "authenticated read library_books"
  ON public.library_books FOR SELECT TO authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. library_reads — per-user reading position in each library book
--    Shape mirrors the existing reading-position memory pattern used for
--    uploaded docs. position is jsonb so the client can store whatever
--    shape the reader's resume logic needs (currently a section index +
--    scroll offset) without future migrations.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.library_reads (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id     uuid NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
  position    jsonb,
  last_open   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_library_reads_user_last_open
  ON public.library_reads (user_id, last_open DESC);

ALTER TABLE public.library_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own library_reads"   ON public.library_reads;
DROP POLICY IF EXISTS "users insert own library_reads" ON public.library_reads;
DROP POLICY IF EXISTS "users update own library_reads" ON public.library_reads;
DROP POLICY IF EXISTS "users delete own library_reads" ON public.library_reads;

CREATE POLICY "users read own library_reads"
  ON public.library_reads FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users insert own library_reads"
  ON public.library_reads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own library_reads"
  ON public.library_reads FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own library_reads"
  ON public.library_reads FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
