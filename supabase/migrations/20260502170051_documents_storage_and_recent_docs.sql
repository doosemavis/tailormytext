-- Phase 1 of the storage migration: provision the schema needed to move
-- document blobs and the recent-docs index out of localStorage and into
-- Supabase. No application code reads from these yet — that comes in Phase 2.
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Idempotent: safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Storage bucket for document blobs
--    Path convention: {user_id}/{doc_id}.json
--    Private bucket; only the owning user can read/write their own folder.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "users read own documents"    ON storage.objects;
DROP POLICY IF EXISTS "users insert own documents"  ON storage.objects;
DROP POLICY IF EXISTS "users update own documents"  ON storage.objects;
DROP POLICY IF EXISTS "users delete own documents"  ON storage.objects;

CREATE POLICY "users read own documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "users insert own documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "users update own documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "users delete own documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 2. recent_docs table — the per-user list of which docs are "recent"
--    Mirrors the shape of the localStorage entries we save today:
--      { id, name, timestamp, chunks }
--    The `id` is the client-generated slug TailorMyText already uses
--    (e.g. "fitzgerald_great_gatsby_epub_momzo9ed"); keeping it as the
--    PK lets the localStorage→Supabase migration script preserve the
--    same identity, so storage-bucket file paths can reuse it.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recent_docs (
  id          text NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  timestamp   bigint NOT NULL,
  chunks      integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);


CREATE INDEX IF NOT EXISTS idx_recent_docs_user_timestamp
  ON public.recent_docs (user_id, timestamp DESC);

ALTER TABLE public.recent_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own recent_docs"   ON public.recent_docs;
DROP POLICY IF EXISTS "users insert own recent_docs" ON public.recent_docs;
DROP POLICY IF EXISTS "users update own recent_docs" ON public.recent_docs;
DROP POLICY IF EXISTS "users delete own recent_docs" ON public.recent_docs;

CREATE POLICY "users read own recent_docs"
  ON public.recent_docs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users insert own recent_docs"
  ON public.recent_docs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own recent_docs"
  ON public.recent_docs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own recent_docs"
  ON public.recent_docs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
