-- Marketing events: lightweight, owner-readable funnel + traffic-source data.
--
-- Self-hosted alternative to GA/PostHog. Anyone (anon or authed) can INSERT
-- events from the client; only is_owner can SELECT them or call the
-- analytics RPCs. The shape is intentionally narrow — six event names
-- ('landing_view', 'signup', 'first_upload', 'paywall_view',
-- 'checkout_started', 'checkout_succeeded') drive the funnel; UTM + referrer
-- power source attribution.
--
-- Run in Supabase SQL Editor. Idempotent.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. events table
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  path text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text
);

CREATE INDEX IF NOT EXISTS events_name_ts_idx       ON public.events (name, ts DESC);
CREATE INDEX IF NOT EXISTS events_session_idx       ON public.events (session_id, ts);
CREATE INDEX IF NOT EXISTS events_utm_source_idx    ON public.events (utm_source, ts) WHERE utm_source IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RLS — anyone can INSERT, only owner can SELECT
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_insert_any   ON public.events;
DROP POLICY IF EXISTS events_select_owner ON public.events;

-- INSERT: anon + authenticated. WITH CHECK constrains the inserted shape:
-- name must be one of the six known events (cap on noise / spam writes),
-- text fields are length-bounded.
CREATE POLICY events_insert_any ON public.events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    name IN ('landing_view', 'signup', 'first_upload', 'paywall_view', 'checkout_started', 'checkout_succeeded')
    AND length(session_id) BETWEEN 8 AND 64
    AND (path         IS NULL OR length(path)         <= 256)
    AND (referrer     IS NULL OR length(referrer)     <= 512)
    AND (utm_source   IS NULL OR length(utm_source)   <= 64)
    AND (utm_medium   IS NULL OR length(utm_medium)   <= 64)
    AND (utm_campaign IS NULL OR length(utm_campaign) <= 128)
  );

-- SELECT: owner-only, mirrors the existing analytics RPC gate.
CREATE POLICY events_select_owner ON public.events
  FOR SELECT
  USING (public.is_current_user_owner());

-- ─────────────────────────────────────────────────────────────────────────
-- 3. analytics_funnel_30d() — six-stage funnel using distinct session counts
--    over the last 30 days. Returned shape lets the client compute
--    stage-to-stage conversion rates without another round trip.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_funnel_30d()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  cutoff timestamptz := now() - interval '30 days';
BEGIN
  IF NOT public.is_current_user_owner() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN json_build_object(
    'window_days',        30,
    'landing',            (SELECT count(DISTINCT session_id) FROM public.events WHERE ts >= cutoff AND name = 'landing_view'),
    'signup',             (SELECT count(DISTINCT session_id) FROM public.events WHERE ts >= cutoff AND name = 'signup'),
    'first_upload',       (SELECT count(DISTINCT session_id) FROM public.events WHERE ts >= cutoff AND name = 'first_upload'),
    'paywall_view',       (SELECT count(DISTINCT session_id) FROM public.events WHERE ts >= cutoff AND name = 'paywall_view'),
    'checkout_started',   (SELECT count(DISTINCT session_id) FROM public.events WHERE ts >= cutoff AND name = 'checkout_started'),
    'checkout_succeeded', (SELECT count(DISTINCT session_id) FROM public.events WHERE ts >= cutoff AND name = 'checkout_succeeded'),
    'total_events',       (SELECT count(*)                   FROM public.events WHERE ts >= cutoff)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_funnel_30d() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. analytics_traffic_sources_30d() — top UTM sources and referrers for
--    landing_view events over the last 30 days. Returns top 10 of each.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_traffic_sources_30d()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  cutoff timestamptz := now() - interval '30 days';
  utm_rows  json;
  ref_rows  json;
  direct    integer;
BEGIN
  IF NOT public.is_current_user_owner() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT coalesce(json_agg(row_to_json(s)), '[]'::json) INTO utm_rows
  FROM (
    SELECT utm_source AS source, count(DISTINCT session_id) AS sessions
    FROM public.events
    WHERE ts >= cutoff AND name = 'landing_view' AND utm_source IS NOT NULL
    GROUP BY utm_source
    ORDER BY sessions DESC
    LIMIT 10
  ) s;

  SELECT coalesce(json_agg(row_to_json(s)), '[]'::json) INTO ref_rows
  FROM (
    SELECT
      regexp_replace(referrer, '^https?://([^/]+).*$', '\1') AS host,
      count(DISTINCT session_id) AS sessions
    FROM public.events
    WHERE ts >= cutoff
      AND name = 'landing_view'
      AND referrer IS NOT NULL
      AND length(referrer) > 0
    GROUP BY host
    ORDER BY sessions DESC
    LIMIT 10
  ) s;

  SELECT count(DISTINCT session_id) INTO direct
  FROM public.events
  WHERE ts >= cutoff
    AND name = 'landing_view'
    AND utm_source IS NULL
    AND (referrer IS NULL OR length(referrer) = 0);

  RETURN json_build_object(
    'window_days', 30,
    'utm_sources', utm_rows,
    'referrers',   ref_rows,
    'direct',      direct
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_traffic_sources_30d() TO authenticated;
