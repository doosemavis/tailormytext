-- Phase 1: queue Pro grants for emails that don't have an account yet.
-- Auto-redeem on profile creation (i.e. signup, whether email/password or
-- Google OAuth — both flow through the same auth.users → profiles path).
--
-- Behavior changes:
--   * grant_pro_access(email, months): if the email isn't in auth.users,
--     insert into public.pending_pro_grants instead of raising. Existing
--     users keep the immediate-apply path. Returns {status: 'applied' |
--     'queued', ...} so the client can branch on the toast message.
--   * BEFORE INSERT trigger on public.profiles: when a new profile row is
--     about to land, check pending_pro_grants for the email; sum months
--     across all pending rows; set NEW.pro_grant_until in-line, then mark
--     the rows redeemed. Single round-trip, no race.
--
-- New RPCs:
--   * list_pending_pro_grants() — for the AdminPanel to show queued gifts.
--   * revoke_pending_pro_grant(grant_id) — cancel a queued gift before it
--     redeems.
--
-- Run in Supabase SQL Editor. Idempotent.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. pending_pro_grants table.
--    Stores the queue. Each grant is a separate row so multiple admins
--    gifting the same email accumulate (4 months gifted twice = 8 months
--    on signup, mirroring how stacking works for existing users).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pending_pro_grants (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text        NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  months              integer     NOT NULL CHECK (months > 0 AND months <= 60),
  granted_at          timestamptz NOT NULL DEFAULT now(),
  granted_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at         timestamptz,
  redeemed_by_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Partial index: the redeem trigger always queries for unredeemed rows by
-- lowercased email. Partial index keeps it tight.
CREATE INDEX IF NOT EXISTS idx_pending_pro_grants_email_unredeemed
  ON public.pending_pro_grants (lower(email))
  WHERE redeemed_at IS NULL;

ALTER TABLE public.pending_pro_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pending_pro_grants_admin_owner_select" ON public.pending_pro_grants;
CREATE POLICY "pending_pro_grants_admin_owner_select"
  ON public.pending_pro_grants
  FOR SELECT TO authenticated
  USING (public.is_caller_owner_or_admin());

-- No INSERT/UPDATE/DELETE policies for clients. SECURITY DEFINER RPCs and
-- the redeem trigger handle all writes.

-- ─────────────────────────────────────────────────────────────────────────
-- 2. grant_pro_access — updated to queue when the email has no account.
--    Existing-user path is unchanged. New path inserts into the queue.
--    Return shape adds a 'status' field: 'applied' | 'queued'.
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
  normalized_email text;
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

  normalized_email := lower(target_email);

  SELECT id INTO target_user_id
  FROM auth.users WHERE lower(email) = normalized_email;

  -- Path A: existing user → apply immediately. Stack onto active grant or
  -- replace expired grant (existing behavior).
  IF target_user_id IS NOT NULL THEN
    SELECT pro_grant_until INTO current_grant
    FROM public.profiles WHERE id = target_user_id;

    IF current_grant IS NOT NULL AND current_grant > now() THEN
      new_grant := current_grant + (months || ' months')::interval;
    ELSE
      new_grant := now() + (months || ' months')::interval;
    END IF;

    UPDATE public.profiles
    SET pro_grant_until = new_grant
    WHERE id = target_user_id;

    RETURN json_build_object(
      'status',          'applied',
      'email',           normalized_email,
      'pro_grant_until', new_grant,
      'months_added',    months
    );
  END IF;

  -- Path B: no user yet → queue. The redeem trigger picks it up on signup.
  INSERT INTO public.pending_pro_grants (email, months, granted_by)
  VALUES (normalized_email, months, auth.uid());

  RETURN json_build_object(
    'status',       'queued',
    'email',        normalized_email,
    'months_added', months
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_pro_access(text, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Redeem trigger function.
--    Looks up unredeemed pending grants by lowercased email, sums months,
--    sets NEW.pro_grant_until in-line on the row about to be inserted,
--    then marks the pending rows redeemed. BEFORE INSERT means the
--    insertion itself is the redemption — no second UPDATE needed.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_pending_pro_grants_for_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  user_email   text;
  total_months integer;
BEGIN
  SELECT lower(email) INTO user_email
  FROM auth.users WHERE id = NEW.id;

  IF user_email IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(sum(months), 0) INTO total_months
  FROM public.pending_pro_grants
  WHERE lower(email) = user_email
    AND redeemed_at IS NULL;

  IF total_months > 0 THEN
    -- If the new profile row already had a pro_grant_until set (unlikely
    -- but defensive), stack onto it; otherwise start from now().
    IF NEW.pro_grant_until IS NOT NULL AND NEW.pro_grant_until > now() THEN
      NEW.pro_grant_until := NEW.pro_grant_until + (total_months || ' months')::interval;
    ELSE
      NEW.pro_grant_until := now() + (total_months || ' months')::interval;
    END IF;

    UPDATE public.pending_pro_grants
    SET redeemed_at = now(),
        redeemed_by_user_id = NEW.id
    WHERE lower(email) = user_email
      AND redeemed_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS redeem_pending_pro_grants_trigger ON public.profiles;
CREATE TRIGGER redeem_pending_pro_grants_trigger
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.redeem_pending_pro_grants_for_new_profile();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. list_pending_pro_grants — for the admin UI to display the queue.
--    Email cast to text (matches the list_active_pro_grants pattern after
--    the email-cast fix).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_pending_pro_grants()
RETURNS TABLE(id uuid, email text, months integer, granted_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_caller_owner_or_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  SELECT p.id, p.email::text, p.months, p.granted_at
  FROM public.pending_pro_grants p
  WHERE p.redeemed_at IS NULL
  ORDER BY p.granted_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_pending_pro_grants() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. revoke_pending_pro_grant — cancel a queued gift before it redeems.
--    Operates by id (uuid) rather than email since the same email can
--    have multiple pending rows from stacked grants, and the admin should
--    revoke one at a time.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_pending_pro_grant(grant_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF NOT public.is_caller_owner_or_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  DELETE FROM public.pending_pro_grants
  WHERE id = grant_id AND redeemed_at IS NULL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN json_build_object('revoked', deleted_count > 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_pending_pro_grant(uuid) TO authenticated;
