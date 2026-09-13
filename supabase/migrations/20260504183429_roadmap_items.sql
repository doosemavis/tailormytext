-- Post-launch: roadmap_items table for owner/admin to publish a list
-- of in-progress / planned improvements.
--
-- Currently consumed only by an admin-only management page; a public
-- read-only roadmap page will be added later (RLS will be loosened then
-- to allow anon SELECT).
--
-- Run in Supabase SQL Editor. Idempotent.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Status enum. Restricted set so the admin UI can render a fixed picker.
-- ─────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.roadmap_status AS ENUM ('planned', 'in_progress', 'beta', 'shipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. roadmap_items table.
--    sort_order: lower = higher in the rendered list. Manual control so
--    the owner can pin marquee items above the rest regardless of date.
--    eta is free-text on purpose ("Q3 2026", "next sprint", "TBD") —
--    structured dates were rejected because release timing is squishy.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  status public.roadmap_status NOT NULL DEFAULT 'planned',
  category text CHECK (category IS NULL OR length(category) <= 80),
  eta text CHECK (eta IS NULL OR length(eta) <= 60),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_roadmap_items_sort   ON public.roadmap_items(sort_order);
CREATE INDEX IF NOT EXISTS idx_roadmap_items_status ON public.roadmap_items(status);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. updated_at trigger. Generic, scoped to this table only — if other
--    tables later need the same shape, extract this into a shared helper.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.roadmap_items_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roadmap_items_updated_at ON public.roadmap_items;
CREATE TRIGGER trg_roadmap_items_updated_at
  BEFORE UPDATE ON public.roadmap_items
  FOR EACH ROW EXECUTE FUNCTION public.roadmap_items_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RLS — admin OR owner can do everything; everyone else (including
--    anon) is denied. When the public roadmap page ships, ADD a separate
--    SELECT policy granting anon/authenticated read; do NOT widen this
--    one (keep write privileged).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roadmap_items_admin_owner_all" ON public.roadmap_items;
CREATE POLICY "roadmap_items_admin_owner_all"
ON public.roadmap_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR is_owner = true)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR is_owner = true)
  )
);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. created_by auto-fill on insert (so the UI doesn't need to send it).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.roadmap_items_set_created_by()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roadmap_items_created_by ON public.roadmap_items;
CREATE TRIGGER trg_roadmap_items_created_by
  BEFORE INSERT ON public.roadmap_items
  FOR EACH ROW EXECUTE FUNCTION public.roadmap_items_set_created_by();
