-- Roadmap update — generated 2026-05-10.
--
-- Add "EPUB parser quality push" as a planned strategic item. Implementation
-- strategy (Standard Ebooks fixtures + synthetic uglification, se-lint-derived
-- heuristics, in-app feedback widget) lives in the deferred-TODOs memory file;
-- this row is the user-facing handle on the roadmap so owner can track it
-- alongside the canonical queue.
--
-- ML-based structure-recovery model is intentionally NOT included in this row;
-- parked in memory until cost-effective in-browser inference exists OR ARR
-- justifies server infra.
--
-- Idempotent: INSERT uses NOT EXISTS by title, so re-running is a no-op.
--
-- Run in Supabase SQL Editor.

INSERT INTO public.roadmap_items (title, description, status, category, eta, sort_order)
SELECT 'EPUB parser quality push',
       'Significantly improve how EPUBs are parsed — using the cleanest publishers as a quality baseline, learning from real feedback on tough cases, and continuously refining the structure-detection heuristics. Especially benefits messy self-published and Calibre-converted EPUBs where chapters, paragraph order, lists, and footnotes are most likely to break today.',
       'planned'::public.roadmap_status,
       'EPUB parsing',
       'TBD',
       6
WHERE NOT EXISTS (
  SELECT 1 FROM public.roadmap_items WHERE title = 'EPUB parser quality push'
);
