# TailorMyText — App Capabilities

TailorMyText is a reading app for people whose brains process text differently — dyslexia, ADHD, low vision, sensory overload, or eye fatigue at the end of a long day. Bring a document, tune the page until the words feel easy, read.

Accessibility is the product, not a feature.

---

## Documents

Upload and read these formats:

| Format | Parser |
|---|---|
| PDF (`.pdf`) | pdf.js |
| EPUB (`.epub`) | EPub.js |
| Word (`.docx`) | mammoth |
| Plain text (`.txt`) | Custom regex structure detector |
| HTML (`.html`, `.htm`) | Custom regex structure detector |
| Markdown (`.md`) | Custom regex preprocessor |

The structure detector auto-recognizes chapters, parts, sections, and acts in plain text and HTML — no manual TOC required. All formats render through the same accessibility-tuned reader.

A built-in **Try demo article** button loads a sample document so visitors can experiment with the controls before signing up.

---

## Reading accommodations

### Typography

- **Six font families**, all chosen for low-vision and dyslexic readers:
  Literata, Atkinson Hyperlegible, IBM Plex Serif, Source Sans 3, Merriweather, OpenDyslexic.
- Fully tunable: font size, line height, paragraph spacing, character spacing.

### Themes

Ten themes total — five light, five dark — colors hand-picked for high contrast and CVD (color-vision-deficiency) safety:

- **Light**: Warm, Cool, Sepia, Forest, Crimson
- **Dark**: Phosphor, Jungle, Dark, Midnight, Obsidian

Several themes are explicitly hue-shifted (e.g. Forest skews teal so deuteranopes still distinguish it from Warm/Sepia) and dark themes lift soft-foreground luminance so achromats still see a clear bg/fg step.

### Highlight palettes

Six expressive palettes (Sunset, Ocean, Forest, Lavender, Ember, Mono) plus colorblind-safe gradients sampled from CVD-friendly colormaps. Gradients combine hue shift with monotonic luminance so they stay distinguishable across deuteranopia, protanopia, and tritanopia.

### Reading guide overlay

A line-tracking overlay with three modes — **highlight**, **underline**, or **dim** — and an intensity slider that controls how much it stands out. Helps eyes track lines without losing the page.

### WPM Pacer

Set a words-per-minute target and press Play: the current word highlights in place with a three-word fading trail, and the page scrolls to keep pace. Click a word or use the arrow keys to choose where to start (Up/Down move by line; hold to jump by paragraph). Space plays and pauses, Plus and Minus adjust speed. Free up to 400 wpm; faster is Pro.

---

## Privacy & accounts

- Email + password signup, or Google OAuth.
- Email verification gate before subscribing.
- Lenient password rules (8+ characters, no complexity gates — NIST 2024 style).
- Per-user row-level security across all stored data; documents live as blobs in Supabase Storage at user-scoped paths.
- **7-day document TTL** — files auto-delete 7 days after the last time you opened them. Your library doesn't accumulate forgotten content.
- Account deletion with grace-period queue and email-keyed history (six-month lockout to block trial-cycle abuse).
- Self-service profile, password change, and one-click data export.

---

## Free vs Pro

| | Free | Pro |
|---|---|---|
| Uploads | 3 / month | Unlimited |
| Recent docs library | 5 most recent | 5 most recent |
| Font families | All 6 | All 6 |
| Themes | Basic set | All 10 + premium palettes |
| Reading guide intensity | Default | Adjustable |
| WPM Pacer | Up to 400 wpm | Up to 1000 wpm |
| 14-day Pro trial on signup | ✅ | — |

- Stripe-hosted Checkout (live mode, real cards).
- Stripe Customer Portal for receipts, billing updates, and cancellation.
- **Gift Pro** — share a link that grants Pro access to anyone, with the duration encoded in the link. Recipients see a magenta gift toast on next sign-in. Grants are queued for emails without an account, so a gift can land before the recipient signs up.
- Transactional grant emails sent via Resend.

---

## Owner / admin tools

The `/admin` route surfaces an owner-only dashboard:

- **User counts** — total, signups by week, deletion requests in flight.
- **Subscription analytics** — active subs by status, MRR, billing-cycle mix, trial vs paid, churn.
- **Doc & storage capacity** — uploaded doc count by type, total bytes, db bytes, sweep history.
- **Marketing funnel (30d)** — six-stage cohort-anchored conversion: Landing → Signup → First upload → Paywall view → Checkout started → Paid. Each stage is a strict subset of the prior, so percentages reflect real user cohorts.
- **Traffic sources (30d)** — top UTM (Urchin Tracking Module) sources, top referrers, direct (no-referrer) count.
- **Roadmap admin** — manage the public roadmap items table.
- **Pro grant interface** — issue complimentary subscriptions to any email.

Owner gating uses `public.is_current_user_owner()`; non-owners can't reach the panel even with admin role.

---

## Architecture (high level)

| Layer | Technology |
|---|---|
| Frontend | React + Vite single-page app |
| Hosting | Cloudflare Pages (deploys from `theme-enhancement`) |
| Auth + Database + Storage | Supabase Postgres, Storage, Auth |
| Edge Functions | Supabase Deno runtime (Stripe webhook, Resend send) |
| Billing | Stripe (live mode) |
| Transactional email | Resend |
| Analytics | Self-hosted via `public.events` table — no GA, PostHog, or third-party tracker |

For deeper architecture notes see `CLAUDE.md`.

---

## Status

- Pre-launch as of 2026-05-10.
- Live deployment at `tailormytext.com`, not yet publicly shared.
- One historical canceled subscription on file (founder live-test + immediate refund).
- Marketing funnel infrastructure in place; awaiting first organic traffic to populate.
