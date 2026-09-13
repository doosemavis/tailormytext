-- Owner-analytics expansion: docs + TTL stats.
--
-- Adds 4 new SECURITY DEFINER RPCs gated on is_current_user_owner():
--   * analytics_doc_counts()       — total docs, recent uploads, expiring soon
--   * analytics_doc_types()        — breakdown by file extension
--   * analytics_storage_bytes()    — sum of storage.objects sizes for the bucket
--   * analytics_ttl_sweeps()       — deletion volume + cron health
--
-- Also introduces public.ttl_sweep_log so the historical "deleted in last N days"
-- metric isn't a guess — every cleanup_expired_docs() run inserts one row,
-- even on zero-deletion runs (so we can also see when the cron last fired).
--
-- Run in Supabase SQL Editor. Idempotent.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ttl_sweep_log: one row per cleanup_expired_docs() invocation.
--    Owner-only SELECT (defense-in-depth — analytics RPCs are SECURITY
--    DEFINER and bypass RLS anyway, but a direct table query from a
--    non-owner client should still be denied).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ttl_sweep_log (
  id            bigserial PRIMARY KEY,
  run_at        timestamptz NOT NULL DEFAULT now(),
  deleted_count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ttl_sweep_log_run_at
  ON public.ttl_sweep_log (run_at DESC);

ALTER TABLE public.ttl_sweep_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ttl_sweep_log_owner_select" ON public.ttl_sweep_log;
CREATE POLICY "ttl_sweep_log_owner_select" ON public.ttl_sweep_log
  FOR SELECT TO authenticated
  USING (public.is_current_user_owner());

-- No INSERT/UPDATE/DELETE policies for clients. Only the SECURITY DEFINER
-- cleanup function (running as the owner role) writes to this table.

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Patch cleanup_expired_docs to log every run.
--    Restructured so logging happens unconditionally — even runs that
--    delete 0 rows produce a heartbeat row. That way "no sweeps in 48h"
--    is a clear signal that pg_cron is broken, not just that nothing
--    expired.
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
  SELECT array_agg(user_id::text || '/' || id || '.json')
  INTO expired_paths
  FROM public.recent_docs
  WHERE last_accessed_at < now() - interval '7 days';

  IF expired_paths IS NOT NULL AND array_length(expired_paths, 1) > 0 THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'documents'
      AND name = ANY(expired_paths);

    DELETE FROM public.recent_docs
    WHERE last_accessed_at < now() - interval '7 days';

    GET DIAGNOSTICS expired_count = ROW_COUNT;
  END IF;

  -- Heartbeat: log every run, even zero-deletion runs.
  INSERT INTO public.ttl_sweep_log (run_at, deleted_count)
  VALUES (now(), expired_count);

  RETURN expired_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. analytics_doc_counts — total + recency + expiring-soon.
--    "expiring_24h" counts docs that will be swept on the next cron run
--    (last_accessed_at < now() - 6d means they cross the 7d line within 24h).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_doc_counts()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  total_docs    bigint;
  users_w_docs  bigint;
BEGIN
  IF NOT public.is_current_user_owner() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT count(*), count(DISTINCT user_id)
    INTO total_docs, users_w_docs
  FROM public.recent_docs;

  RETURN json_build_object(
    'total',         total_docs,
    'users_w_docs',  users_w_docs,
    'avg_per_user',  CASE WHEN users_w_docs = 0 THEN 0
                          ELSE round((total_docs::numeric / users_w_docs), 2) END,
    'last_7d',       (SELECT count(*) FROM public.recent_docs
                       WHERE created_at >= now() - interval '7 days'),
    'last_30d',      (SELECT count(*) FROM public.recent_docs
                       WHERE created_at >= now() - interval '30 days'),
    'expiring_24h',  (SELECT count(*) FROM public.recent_docs
                       WHERE last_accessed_at < now() - interval '6 days')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_doc_counts() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. analytics_doc_types — breakdown by file extension.
--    Extension extracted from recent_docs.name via regex; lowercased; rows
--    without an extension are bucketed as 'other'.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_doc_types()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF NOT public.is_current_user_owner() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT json_object_agg(ext, cnt) INTO result
  FROM (
    SELECT
      coalesce(lower(substring(name from '\.([^.]+)$')), 'other') AS ext,
      count(*) AS cnt
    FROM public.recent_docs
    GROUP BY 1
    ORDER BY cnt DESC
  ) s;

  RETURN coalesce(result, '{}'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_doc_types() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. analytics_storage_bytes — sum of object sizes in the documents bucket.
--    storage.objects.metadata->>'size' is text; cast to bigint. SECURITY
--    DEFINER lets this read storage.objects regardless of the caller's
--    grants (the owner-flag check above is the real gate).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_storage_bytes()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, storage
AS $$
DECLARE
  total_bytes bigint;
  obj_count   bigint;
BEGIN
  IF NOT public.is_current_user_owner() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT
    coalesce(sum((metadata->>'size')::bigint), 0),
    count(*)
    INTO total_bytes, obj_count
  FROM storage.objects
  WHERE bucket_id = 'documents';

  RETURN json_build_object(
    'total_bytes', total_bytes,
    'object_count', obj_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_storage_bytes() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. analytics_ttl_sweeps — deletion volume + cron health.
--    deleted_7d / deleted_30d sum across logged runs in the window;
--    runs_30d shows whether the cron is firing as expected (~30 expected
--    if it ran daily for 30d); last_run_at is the freshness signal.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_ttl_sweeps()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_user_owner() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN json_build_object(
    'deleted_7d',  (SELECT coalesce(sum(deleted_count), 0) FROM public.ttl_sweep_log
                     WHERE run_at >= now() - interval '7 days'),
    'deleted_30d', (SELECT coalesce(sum(deleted_count), 0) FROM public.ttl_sweep_log
                     WHERE run_at >= now() - interval '30 days'),
    'runs_30d',    (SELECT count(*) FROM public.ttl_sweep_log
                     WHERE run_at >= now() - interval '30 days'),
    'last_run_at', (SELECT max(run_at) FROM public.ttl_sweep_log)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_ttl_sweeps() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. analytics_subscription_billing_cycle — Monthly vs Annual split.
--    Counts paying subs only (active or past_due — same denominator the
--    MRR calc uses). Trialing subs excluded since they haven't committed
--    to a cycle for billing purposes.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_subscription_billing_cycle()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF NOT public.is_current_user_owner() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT json_object_agg(billing_cycle, cnt) INTO result
  FROM (
    SELECT billing_cycle, count(*) AS cnt
    FROM public.subscriptions
    WHERE status IN ('active', 'past_due')
    GROUP BY billing_cycle
  ) s;

  RETURN coalesce(result, '{}'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_subscription_billing_cycle() TO authenticated;
