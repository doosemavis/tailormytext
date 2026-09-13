Sweep recent work and propose updates to the TailorMyText roadmap table (`public.roadmap_items` in Supabase, surfaced at `/admin/roadmap`).

## What to gather

1. **Recent commits** — `git log --oneline -25` on the current branch. Each commit is a candidate for either a new "shipped" entry or evidence that a previously-planned item is now done.
2. **Pending work** in the current conversation — anything explicitly deferred ("we'll do that later", "skip for now", "follow-up"), still-open task list items, or known limitations called out by the user.
3. **The repo's TODO surfaces** — scan `CLAUDE.md` for the "Key Known TODOs" section and any `TODO:`/`FIXME:` comments in source that look like product work (not internal cleanup).
4. **Current roadmap state** — RLS blocks anon reads, so ask the user to either:
   - Paste the current `/admin/roadmap` contents, OR
   - Run `SELECT id, title, status FROM public.roadmap_items ORDER BY sort_order;` in Supabase SQL Editor and paste the result, OR
   - Confirm "go ahead, just add new items, I'll dedupe by title" — the SQL we generate uses `NOT EXISTS` guards so re-running won't duplicate by title.

## What to produce

A two-phase output:

### Phase 1 — proposal (no SQL yet)

Show a checklist of suggested changes. Three groups:

- **Mark as shipped** (rows currently `planned`/`in_progress` whose work landed): `<title>` ← `<commit hash> <commit subject>`
- **Add as shipped** (recent commits with no matching planned row): proposed `title`, `description`, `category`
- **Add as planned** (deferred work / pending tasks / TODOs): proposed `title`, `description`, `category`, `eta`

Wait for the user to confirm, edit, or veto items before moving to Phase 2. Don't write any files in Phase 1.

### Phase 2 — SQL generation (after confirmation)

Write an idempotent SQL file to `supabase/seeds/roadmap_update_<UTC-timestamp>.sql` containing:

- `UPDATE public.roadmap_items SET status = 'shipped' WHERE title = '<title>' AND status <> 'shipped';` for each "mark as shipped" item
- `INSERT … SELECT … WHERE NOT EXISTS (…)` blocks for each new item (same shape as `supabase/seeds/roadmap_initial.sql`)

Tell the user the file path and to paste it into Supabase Dashboard → SQL Editor.

## Field conventions

- **title** — short noun phrase, sentence case, ≤80 chars. User-facing.
- **description** — 1–2 sentences. Explain *what it is* and *why a reader would care*. Avoid implementation jargon ("PDF font tier analysis" → "Detects sub-headings even when the PDF doesn't tag them as bold").
- **status** — `planned` | `in_progress` | `beta` | `shipped`. Default new items to `planned` unless evidence says otherwise.
- **category** — reuse an existing category where possible. Common ones: PDF parsing, Reading guide, Account, Branding, Email, Theme, Accessibility, Performance, Editor. Invent new ones only when none fit.
- **eta** — free text. `Coming soon`, `Q3 2026`, `TBD`, or leave NULL.
- **sort_order** — for new `shipped` items, use `max(existing shipped) + 1`. For new `planned`, use `max(existing planned) + 1`. The seed used `0–5` for planned and `100+` for shipped to leave a gap; preserve that grouping.

## Tone for descriptions

Write for a curious end user, not for engineers. Examples:

- ❌ "Refactor PDF parser to use indent-based bullet detection with continuation joining"
- ✅ "Bullet lists in PDFs are now recognized — even when the PDF draws bullets as shapes instead of text characters."

- ❌ "Migrate hue color blend to CSS color-mix(in oklab, …)"
- ✅ "New slider lets you blend the palette colors with your theme color — from a subtle tint to the full vivid gradient."

## Skip rules

Don't propose roadmap entries for:

- Internal refactors with no user-visible effect
- Bug fixes (unless they were a publicly-acknowledged limitation)
- Doc/comment changes
- CI/build/dependency-only commits
- Test additions

If a sweep produces nothing user-facing, say so and stop — no need to invent filler.
