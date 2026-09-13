-- Owner-analytics: total database size for the DB capacity widget.
--
-- pg_database_size() is what Supabase bills against, so this is the
-- accurate "X of Y MB used" number that matches the dashboard. SECURITY
-- DEFINER so it can read across all schemas regardless of caller grants;
-- owner-flag check guards the privilege.
--
-- Run in Supabase SQL Editor. Idempotent.

CREATE OR REPLACE FUNCTION public.analytics_database_bytes()
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
    'total_bytes', pg_database_size(current_database())
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_database_bytes() TO authenticated;
