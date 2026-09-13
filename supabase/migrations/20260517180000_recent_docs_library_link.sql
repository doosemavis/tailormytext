-- Phase 3 of the library feature: extend recent_docs so library opens can
-- mirror into the existing Recent Documents flow. Per the v1 UX rule:
-- library books appear in Recent Documents *after* a user opens one and
-- moves to a different document — exactly like an uploaded file would.
--
-- The Library section (Phase 4 UI) remains the catalog/discovery surface;
-- Recent Documents remains the "what I've been reading" surface. Library
-- entries simply gain a place in Recent Documents once they're read.
--
--   source — distinguishes 'upload' (existing) from 'library'. Existing
--            rows backfill to 'upload' via DEFAULT, so this migration is
--            transparent to the prior workflow.
--   book_id — FK to public.library_books for library entries. NULL for
--            upload entries. cloudDocs uses this to know which Storage
--            bucket to load from (documents for uploads, library for
--            library books).
--
-- Idempotent. Run in the Supabase SQL Editor.

ALTER TABLE public.recent_docs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'upload'
    CHECK (source IN ('upload', 'library'));

ALTER TABLE public.recent_docs
  ADD COLUMN IF NOT EXISTS book_id uuid
    REFERENCES public.library_books(id) ON DELETE CASCADE;

-- Source-filtered query index — supports future "show me my library reads"
-- views without scanning the whole user's history.
CREATE INDEX IF NOT EXISTS idx_recent_docs_user_source
  ON public.recent_docs (user_id, source, timestamp DESC);
