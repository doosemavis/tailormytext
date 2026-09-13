-- Roadmap update — generated 2026-05-10 from /update-roadmap sweep.
--
-- Two changes:
--   1. Mark "Cat cursor on dark themes" as shipped + revise description
--      to reflect the actual loader-replacement work. Historical title
--      preserved per user request.
--   2. Add "Gift Pro to anyone" as a new shipped row capturing the
--      gift-link feature series (commits 020595a, 6415612, 159f5fb,
--      57f8ba1, f4cc3ae, cb44f59, f294939).
--
-- Idempotent:
--   - The UPDATE filters by status <> 'shipped', so re-running is a no-op.
--   - The INSERT uses NOT EXISTS by title, so re-running is a no-op.
--
-- Run in Supabase SQL Editor.

UPDATE public.roadmap_items
SET status = 'shipped'::public.roadmap_status,
    description = 'The default loader was a CSS-sprite cat with visible slice-misalignment artifacts on dark themes. Replaced with a theme-aware Lottie book loader that recolors itself to match the active palette — outlines use the theme foreground, primary fill uses the theme accent, three softer shades blend toward the background. Looks intentional on every theme.',
    sort_order = 109
WHERE title = 'Cat cursor on dark themes' AND status <> 'shipped';

INSERT INTO public.roadmap_items (title, description, status, category, eta, sort_order)
SELECT 'Gift Pro to anyone',
       'Send a shareable link that grants Pro access to whoever signs in with it. Recipients see their gift notification on first sign-in, and grants can be queued for emails that don''t have an account yet — the gift activates automatically when they sign up.',
       'shipped'::public.roadmap_status,
       'Account',
       NULL,
       110
WHERE NOT EXISTS (
  SELECT 1 FROM public.roadmap_items WHERE title = 'Gift Pro to anyone'
);
