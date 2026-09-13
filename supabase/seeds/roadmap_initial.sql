-- Initial seed for roadmap_items.
--
-- Idempotent: each row only inserts if a row with the same title doesn't
-- already exist. Safe to re-run; will not duplicate. Drop a TRUNCATE
-- public.roadmap_items; line above the inserts if you want a clean reset.
--
-- Run in Supabase SQL Editor.

WITH rows(title, description, status, category, eta, sort_order) AS (
  VALUES
  -- ── Planned ──────────────────────────────────────────────────────────
  ('Public roadmap page',
   'A reader-facing roadmap so anyone can see what improvements are coming. The admin view exists today; the public surface is next.',
   'planned'::public.roadmap_status, 'Account', 'Coming soon', 0),

  ('Comprehensive accessibility audit',
   'Full sweep across screen-reader behavior, keyboard navigation, contrast ratios, and focus indicators — targeting WCAG 2.2 AA.',
   'planned'::public.roadmap_status, 'Accessibility', 'Q3 2026', 1),

  ('Cat cursor on dark themes',
   'The default cursor is a custom cat. On dark themes it can blend into the background — needs a contrast-aware variant.',
   'planned'::public.roadmap_status, 'Theme', 'TBD', 2),

  ('Open Graph preview image',
   'Custom 1200×630 OG image so links shared on Slack/Twitter/Discord show a branded preview instead of a generic placeholder.',
   'planned'::public.roadmap_status, 'Branding', 'Soon', 3),

  ('Legacy favicon fallback',
   'Older browsers ignore SVG favicons. Add a .ico fallback so the tab icon shows everywhere.',
   'planned'::public.roadmap_status, 'Branding', 'Soon', 4),

  ('Custom support email pipeline',
   'Resend SMTP + Gmail Send-As so support@tailormytext.com can both send and receive properly, instead of relying on Cloudflare Email Routing alone for inbound.',
   'planned'::public.roadmap_status, 'Email', 'TBD', 5),

  -- ── Shipped (most recent first) ──────────────────────────────────────
  ('Original document hierarchy preserved',
   'PDF headings now keep their relative size when you change the body font size — a 2.25× heading stays 2.25× whatever you pick. No more flat hierarchy.',
   'shipped'::public.roadmap_status, 'PDF parsing', NULL, 100),

  ('Italic rendering',
   'Italic text from PDFs renders italic instead of being collapsed to bold. Detection works via font-name regex and transform-matrix skew analysis.',
   'shipped'::public.roadmap_status, 'PDF parsing', NULL, 101),

  ('Bullet point detection',
   'Bullet lists in PDFs are recognized via left-indent + lowercase-continuation heuristics — even when the PDF draws bullets as vector shapes that aren''t in the text stream.',
   'shipped'::public.roadmap_status, 'PDF parsing', NULL, 102),

  ('Sub-heading detection',
   'Section labels like "About Us" or "Responsibilities" are detected by font-size + font-family minority analysis, even when the source PDF doesn''t expose bold weights.',
   'shipped'::public.roadmap_status, 'PDF parsing', NULL, 103),

  ('Bold inline detection',
   'Bold runs inside paragraphs render bold by detecting the emphasis font family used by the PDF, rather than trusting the (often missing) bold flag.',
   'shipped'::public.roadmap_status, 'PDF parsing', NULL, 104),

  ('Hue intensity slider',
   'New slider lets you blend the palette colors with your theme color — from a subtle tint to the full vivid gradient.',
   'shipped'::public.roadmap_status, 'Reading guide', NULL, 105),

  ('Colorblind-safe palettes',
   'Four new palettes (Aurora, Beacon, Prism, Vivid) drawn from established CVD-friendly colormaps (Viridis, Cividis, Okabe-Ito, Tol Bright).',
   'shipped'::public.roadmap_status, 'Reading guide', NULL, 106),

  ('Account page',
   'Self-service profile, change password, and JSON/CSV data export — all under /account.',
   'shipped'::public.roadmap_status, 'Account', NULL, 107),

  ('Better contact form',
   'Contact opens a modal with Gmail / Outlook / default mail app composers instead of relying on a mailto link that silently fails for users without a configured mail client.',
   'shipped'::public.roadmap_status, 'Email', NULL, 108)
)
INSERT INTO public.roadmap_items (title, description, status, category, eta, sort_order)
SELECT r.title, r.description, r.status, r.category, r.eta, r.sort_order
FROM rows r
WHERE NOT EXISTS (
  SELECT 1 FROM public.roadmap_items existing WHERE existing.title = r.title
);
