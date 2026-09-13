-- Document TTL (7-day auto-deletion after last access) + Tier 1 hardening
-- constraints. Idempotent: safe to re-run.
--
-- Enables pg_cron at the top so fresh Supabase environments (preview
-- branches, replays from scratch) install the extension before any
-- cron.* statement below runs. On environments where pg_cron was
-- pre-enabled via the dashboard (e.g. production), `CREATE EXTENSION
-- IF NOT EXISTS` is a no-op.
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).

-- ─────────────────────────────────────────────────────────────────────────
-- 0. Ensure pg_cron is available for the schedule at step 5.
-- ─────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. recent_docs: add last_accessed_at column for TTL tracking
--    Soft-launch: existing rows backfilled to NOW() so nothing gets swept
--    on the first cron run after this migration ships.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.recent_docs
  ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz NOT NULL DEFAULT now();

-- Backfill any pre-existing rows (no-op for fresh installs).
UPDATE public.recent_docs
SET last_accessed_at = now()
WHERE last_accessed_at IS NULL OR last_accessed_at < now() - interval '1 minute';

-- Index supports the cleanup function's predicate scan.
CREATE INDEX IF NOT EXISTS idx_recent_docs_last_accessed
  ON public.recent_docs (last_accessed_at);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Tier 1 constraints — defensive guardrails so a buggy/malicious
--    client can't insert garbage even with valid auth.
--    PG doesn't support CREATE CONSTRAINT IF NOT EXISTS for UNIQUE/CHECK,
--    so each is wrapped in a DO block that checks pg_constraint first.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recent_docs_unique_user_name') THEN
    ALTER TABLE public.recent_docs
      ADD CONSTRAINT recent_docs_unique_user_name UNIQUE (user_id, name);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recent_docs_name_length') THEN
    ALTER TABLE public.recent_docs
      ADD CONSTRAINT recent_docs_name_length CHECK (length(name) <= 255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recent_docs_chunks_positive') THEN
    ALTER TABLE public.recent_docs
      ADD CONSTRAINT recent_docs_chunks_positive CHECK (chunks >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recent_docs_timestamp_positive') THEN
    ALTER TABLE public.recent_docs
      ADD CONSTRAINT recent_docs_timestamp_positive CHECK (timestamp > 0);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Storage bucket guardrails: cap file size + restrict MIME types.
--    cloudDocs always uploads JSON-serialized doc payloads, so the bucket
--    can be locked down to that single MIME type. 25 MB limit leaves
--    headroom for very large books while staying well under Supabase's
--    50 MB free-tier ceiling.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
SET file_size_limit = 26214400,             -- 25 MB
    allowed_mime_types = ARRAY['application/json']
WHERE id = 'documents';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Cleanup function — deletes recent_docs rows whose last_accessed_at
--    is older than 7 days, plus the corresponding storage objects.
--    SECURITY DEFINER so the function runs as the owner (not the calling
--    user); RLS would otherwise restrict the function to one user's docs,
--    which is wrong for a global sweep.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_expired_docs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count integer := 0;
  expired_paths text[];
BEGIN
  -- Collect paths of objects to delete BEFORE we delete the rows.
  SELECT array_agg(user_id::text || '/' || id || '.json')
  INTO expired_paths
  FROM public.recent_docs
  WHERE last_accessed_at < now() - interval '7 days';

  IF expired_paths IS NULL OR array_length(expired_paths, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Delete storage objects.
  DELETE FROM storage.objects
  WHERE bucket_id = 'documents'
    AND name = ANY(expired_paths);

  -- Delete the index rows.
  DELETE FROM public.recent_docs
  WHERE last_accessed_at < now() - interval '7 days';

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Schedule the cleanup daily at 04:00 UTC via pg_cron.
--    Idempotent: unschedule any existing job with the same name first.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-docs-daily') THEN
    PERFORM cron.unschedule('cleanup-expired-docs-daily');
  END IF;
  PERFORM cron.schedule(
    'cleanup-expired-docs-daily',
    '0 4 * * *',                                  -- 04:00 UTC every day
    $cron$SELECT public.cleanup_expired_docs();$cron$
  );
END $$;
