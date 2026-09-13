-- Rollback for: 20260505200000_pending_pro_grants.sql
--
-- Reverses Phase 1 (queue-on-pending Pro grants):
--   * drops the redeem trigger + function
--   * drops list_pending_pro_grants + revoke_pending_pro_grant RPCs
--   * restores grant_pro_access to its pre-Phase 1 behavior
--     (raises "No user found for that email" instead of queueing)
--   * drops the pending_pro_grants table + policy + index
--
-- ⚠️ DATA LOSS WARNING
-- Any unredeemed rows in public.pending_pro_grants will be lost when
-- this rollback runs. Already-redeemed grants are unaffected because
-- their months were stamped onto profiles.pro_grant_until at signup.
-- Run this query first to see what's at risk:
--   SELECT * FROM public.pending_pro_grants WHERE redeemed_at IS NULL;
--
-- Run in Supabase SQL Editor. Idempotent.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Drop trigger + trigger function.
--    Trigger depends on the function, so the trigger goes first.
-- ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS redeem_pending_pro_grants_trigger ON public.profiles;
DROP FUNCTION IF EXISTS public.redeem_pending_pro_grants_for_new_profile();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Drop the new RPCs.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.revoke_pending_pro_grant(uuid);
DROP FUNCTION IF EXISTS public.list_pending_pro_grants();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Restore grant_pro_access to the pre-Phase 1 body.
--    This is a verbatim copy from 20260503132017_gift_pro_access.sql:
--    raises an exception when the target email has no auth.users row.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.grant_pro_access(
  target_email text,
  months integer DEFAULT 3
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_user_id uuid;
  current_grant timestamptz;
  new_grant timestamptz;
BEGIN
  IF NOT public.is_caller_owner_or_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF target_email IS NULL OR target_email = '' THEN
    RAISE EXCEPTION 'target_email required';
  END IF;
  IF months IS NULL OR months <= 0 OR months > 60 THEN
    RAISE EXCEPTION 'months must be between 1 and 60';
  END IF;

  SELECT id INTO target_user_id
  FROM auth.users WHERE lower(email) = lower(target_email);

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found for that email';
  END IF;

  SELECT pro_grant_until INTO current_grant
  FROM public.profiles WHERE id = target_user_id;

  -- Stack onto an active grant; replace an expired one.
  IF current_grant IS NOT NULL AND current_grant > now() THEN
    new_grant := current_grant + (months || ' months')::interval;
  ELSE
    new_grant := now() + (months || ' months')::interval;
  END IF;

  UPDATE public.profiles
  SET pro_grant_until = new_grant
  WHERE id = target_user_id;

  RETURN json_build_object(
    'email', lower(target_email),
    'pro_grant_until', new_grant,
    'months_added', months
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_pro_access(text, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Drop the policy, index, and table.
--    Policy goes before the table; index is dropped implicitly with the
--    table but doing it explicitly keeps the rollback symmetric with
--    the forward migration.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pending_pro_grants_admin_owner_select" ON public.pending_pro_grants;
DROP INDEX IF EXISTS public.idx_pending_pro_grants_email_unredeemed;
DROP TABLE IF EXISTS public.pending_pro_grants;
