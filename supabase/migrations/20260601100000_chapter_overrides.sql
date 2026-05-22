-- Chapter overrides: user-edited chapter break map.
--
-- Allows users to override parser-derived chapter breaks and titles.
-- NULL = defer to parser output. When non-null, the shape is:
--   { breaks: [paragraphIdx, ...], titles: { paragraphIdx: "Title" } }
--
-- RLS:
-- - Covered by existing recent_docs per-user isolation policies.
--
-- Run via the GitHub-integrated Supabase migration pipeline. Idempotent.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Add chapter_overrides column to recent_docs
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.recent_docs
  ADD COLUMN IF NOT EXISTS chapter_overrides jsonb DEFAULT NULL;

COMMENT ON COLUMN public.recent_docs.chapter_overrides IS
  'User-edited chapter break map. NULL = use parser output. Shape: { breaks: [paragraphIdx, ...], titles: { paragraphIdx: "Title" } }';
