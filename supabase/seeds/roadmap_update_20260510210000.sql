-- Roadmap update — generated 2026-05-10 from /update-roadmap sweep.
--
-- One change:
--   - Mark "Legacy favicon fallback" as shipped (commit a768a8b). The
--     multi-resolution favicon.ico is now wired in index.html before
--     the SVG link with sizes="any" so legacy browsers get a tab icon.
--
-- Idempotent: UPDATE filters by status <> 'shipped', so re-running is a no-op.
--
-- Run in Supabase SQL Editor.

UPDATE public.roadmap_items
SET status = 'shipped'::public.roadmap_status,
    sort_order = 111
WHERE title = 'Legacy favicon fallback' AND status <> 'shipped';
