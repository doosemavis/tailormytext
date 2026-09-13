-- Parse outcomes: lightweight, owner-readable parse-quality signal.
--
-- Records one row per successful client-side parse. Drives Phase 5 threshold
-- tuning for the confidence-scoring scaffold — specifically, what fraction
-- of real-world uploads hit the dynamic-depth chooser's fallback path
-- (no repeating heading depth ⇒ "smallest depth at all"). After ~1 week of
-- production data, the Phase 5 score thresholds get derived from this
-- distribution rather than from synthetic fixtures alone.
--
-- Privacy:
-- - No file contents stored. Only structural signal (format, section count,
--   depth_fallback boolean, byte size of the raw file).
-- - user_id is nullable (anon uploads via library books, pre-signup).
-- - session_id matches the format used by public.events for cross-table
--   correlation if needed.
--
-- RLS:
-- - INSERT: anon + authenticated, with shape-constrained WITH CHECK to
--   prevent noise writes.
-- - SELECT: owner-only, mirrors the public.events analytics gate.
--
-- Run via the GitHub-integrated Supabase migration pipeline. Idempotent.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. parse_outcomes table
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.parse_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  format text NOT NULL,
  depth_fallback boolean NOT NULL,
  section_count integer NOT NULL,
  doc_byte_size integer,
  ext text
);

CREATE INDEX IF NOT EXISTS parse_outcomes_format_ts_idx     ON public.parse_outcomes (format, ts DESC);
CREATE INDEX IF NOT EXISTS parse_outcomes_fallback_ts_idx   ON public.parse_outcomes (ts DESC) WHERE depth_fallback = true;
CREATE INDEX IF NOT EXISTS parse_outcomes_session_idx       ON public.parse_outcomes (session_id, ts);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RLS — anyone can INSERT, only owner can SELECT
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.parse_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parse_outcomes_insert_any   ON public.parse_outcomes;
DROP POLICY IF EXISTS parse_outcomes_select_owner ON public.parse_outcomes;

-- INSERT: anon + authenticated. WITH CHECK constrains the shape:
-- format must be one of the six known parser outputs (defense against
-- noise writes that would pollute the depth-fallback metric).
CREATE POLICY parse_outcomes_insert_any ON public.parse_outcomes
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    format IN ('txt', 'md', 'html', 'pdf', 'epub', 'docx')
    AND length(session_id) BETWEEN 8 AND 64
    AND section_count BETWEEN 0 AND 100000
    AND (doc_byte_size IS NULL OR doc_byte_size BETWEEN 0 AND 1073741824)
    AND (ext IS NULL OR length(ext) <= 16)
  );

-- SELECT: owner-only, mirrors public.events.
CREATE POLICY parse_outcomes_select_owner ON public.parse_outcomes
  FOR SELECT
  USING (public.is_current_user_owner());
