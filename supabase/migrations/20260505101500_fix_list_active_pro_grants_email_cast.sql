-- Fix: list_active_pro_grants() raised
--   "structure of query does not match function result type"
-- the moment it had at least one row to return.
--
-- Cause: auth.users.email is varchar(255) in Supabase, but the function
-- declared RETURNS TABLE(email text, ...). Postgres only checks per-row
-- types when a row is actually produced, so the bug stayed dormant while
-- the grants table was empty and surfaced the first time someone granted
-- Pro access.
--
-- Fix: cast u.email::text in the SELECT. Keeps the public return shape
-- the same (no client-side change needed).
--
-- Run in Supabase SQL Editor. Idempotent.

CREATE OR REPLACE FUNCTION public.list_active_pro_grants()
RETURNS TABLE(email text, pro_grant_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_caller_owner_or_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  SELECT u.email::text, p.pro_grant_until
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.pro_grant_until IS NOT NULL
    AND p.pro_grant_until > now()
  ORDER BY p.pro_grant_until ASC;
END;
$$;
