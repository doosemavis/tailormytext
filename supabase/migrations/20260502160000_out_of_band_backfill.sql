-- Out-of-band schema backfill.
--
-- Captures schema objects that were originally created via the Supabase
-- dashboard (out-of-band) and therefore aren't in the migration history.
-- Without this file, fresh Supabase environments (preview branches,
-- self-hosted replays from scratch) can't replay the migration chain —
-- later ALTER TABLE statements would fail because their target doesn't
-- exist yet.
--
-- Authoritative source: queried production's information_schema on
-- 2026-05-19. Audit captured profiles columns 1-4 (id, email, role,
-- created_at), the on_auth_user_created trigger, and the standard set
-- of Supabase extensions (all of which install automatically when a
-- new project is provisioned, so nothing extra is needed here).
--
-- Production impact: zero. Every statement uses IF NOT EXISTS / OR
-- REPLACE / DROP-then-CREATE patterns, so a re-apply on the
-- already-correct production schema is a no-op.
--
-- Filename timestamp (20260502160000) is intentionally earlier than
-- the first existing migration (20260502170051) so this runs FIRST in
-- date-ordered replay.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. public.profiles — base columns only.
--    Columns 5+ (deletion_*, stripe_customer_id, uploads_*, is_owner,
--    pro_grant_until) are added by their respective later migrations
--    via ADD COLUMN IF NOT EXISTS, so we deliberately do NOT include
--    them here.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. handle_new_user — trigger function that auto-creates a profiles
--    row when a new auth.users row appears. SECURITY DEFINER because
--    the inserting role (supabase_auth_admin) can't INSERT into public.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. on_auth_user_created trigger.
--    DROP-then-CREATE because PG doesn't support CREATE TRIGGER IF NOT
--    EXISTS pre-PG 14. DROP IF EXISTS is safe on fresh DBs and idempotent
--    on environments that already have it.
-- ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RLS baseline on profiles. The application's useSubscription hook
--    does `SELECT FROM profiles WHERE id = auth.uid()` so we need at
--    minimum a self-SELECT policy. Production has equivalent policies
--    set up via the dashboard.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own profile" ON public.profiles;
CREATE POLICY "users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
