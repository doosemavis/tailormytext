-- Cohort-anchored funnel: replace analytics_funnel_30d() so every stage is a
-- strict subset of the prior stage, giving real conversion percentages.
--
-- Cohort definition
-- ─────────────────
-- The entry pool is the set of distinct sessions that fired a landing_view
-- inside the 30-day window. Every subsequent stage counts members of that
-- cohort who reached that stage:
--
--   • Pre-signup stage (signup) joins via session_id — the anonymous
--     identifier that persists in localStorage from the first landing through
--     the signup event.
--
--   • Post-signup stages (first_upload, paywall_view, checkout_started,
--     checkout_succeeded) join via user_id. The session→user bridge
--     (cohort_users) is built from any event in the cohort's sessions that
--     carries both fields, so we can attribute post-signup activity to a
--     cohort even after the user crosses devices or the webhook writes
--     server-originated session_ids like 'server:<user_id>'.
--
-- Tradeoff
-- ────────
-- A returning visitor whose original landing was outside the window will not
-- appear in the cohort even if they sign up or pay inside the window — the
-- cohort is anchored at landing. In practice this is rare because App.jsx's
-- mount-scoped useEffect fires landing_view on every visit. Revisit if a
-- meaningful share of conversions come from users who never re-land.
--
-- Idempotent: CREATE OR REPLACE rebinds the function body without touching
-- table data. Safe to re-run.

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

  RETURN (
    WITH cohort_sessions AS (
      SELECT DISTINCT session_id
      FROM public.events
      WHERE ts >= cutoff
        AND name = 'landing_view'
    ),
    cohort_users AS (
      SELECT DISTINCT user_id
      FROM public.events
      WHERE user_id IS NOT NULL
        AND session_id IN (SELECT session_id FROM cohort_sessions)
    ),
    stage_counts AS (
      SELECT
        (SELECT count(*) FROM cohort_sessions) AS landing,
        (SELECT count(DISTINCT e.session_id)
           FROM public.events e
           WHERE e.ts >= cutoff
             AND e.name = 'signup'
             AND e.session_id IN (SELECT session_id FROM cohort_sessions)) AS signup,
        (SELECT count(DISTINCT e.user_id)
           FROM public.events e
           WHERE e.ts >= cutoff
             AND e.name = 'first_upload'
             AND e.user_id IN (SELECT user_id FROM cohort_users)) AS first_upload,
        (SELECT count(DISTINCT e.user_id)
           FROM public.events e
           WHERE e.ts >= cutoff
             AND e.name = 'paywall_view'
             AND e.user_id IN (SELECT user_id FROM cohort_users)) AS paywall_view,
        (SELECT count(DISTINCT e.user_id)
           FROM public.events e
           WHERE e.ts >= cutoff
             AND e.name = 'checkout_started'
             AND e.user_id IN (SELECT user_id FROM cohort_users)) AS checkout_started,
        (SELECT count(DISTINCT e.user_id)
           FROM public.events e
           WHERE e.ts >= cutoff
             AND e.name = 'checkout_succeeded'
             AND e.user_id IN (SELECT user_id FROM cohort_users)) AS checkout_succeeded,
        (SELECT count(*) FROM public.events WHERE ts >= cutoff) AS total_events
    )
    SELECT json_build_object(
      'window_days',        30,
      'landing',            landing,
      'signup',             signup,
      'first_upload',       first_upload,
      'paywall_view',       paywall_view,
      'checkout_started',   checkout_started,
      'checkout_succeeded', checkout_succeeded,
      'total_events',       total_events
    )
    FROM stage_counts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_funnel_30d() TO authenticated;
