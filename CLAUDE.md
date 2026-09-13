# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Production build
npm run preview   # Preview production build
```

No test runner or linter is currently configured.

## Architecture

**TailorMyText** is a React + Vite single-page app for reading documents with adaptive typography and visual accessibility aids.

### State Management

`App.jsx` is the single state hub (~28KB). It owns all UI state via ~20+ `useState` hooks covering document content, typography settings, visual enhancements, modal visibility, and subscription context. There is no global state library — everything flows down as props.

### Custom Hooks

- `useSubscription` — Plan tier, trial lifecycle, upload quota enforcement
- `useRecentDocs(authReady, userId)` — Reads/writes the recent-docs index to Supabase via `cloudDocs`. Refreshes from server after each mutation; one-time migration of pre-Supabase localStorage docs runs on first authed load.
- `useReadingGuide` — Generates highlight/underline overlay positioning
- `usePacer({ docWrapperRef, readerRef, docSections, text, isPro, onProGate, authReady })` — WPM pacer engine. Toggles `rf-pace-*` classes on `.rf-word` spans from a self-correcting `setTimeout` chain; no React re-render per tick. Only `enabled` is React state; `playing` and `wpm` live in an external store (`utils/pacer/store.js`) read via `usePacerState` by `PacerTransport` (bottom bar) and `PacerSettings` (sidebar), so play/pause/nudge/slider never re-render App — on a 420K-word book an App render costs ~25ms. Pure helpers in `utils/pacer/` (timing, nav, wordIndex, store); tunables in `config/pacer.js`; free ceiling in `proFeatures.PACER_FREE_MAX_WPM`. WPM persists per device via `storage.js`.

### Document Parsing Pipeline

```
File upload → type-specific parser → docSections[]
```

- **PDF**: pdf.js (CDN-loaded via `utils/scriptLoader.js`)
- **EPUB**: EPub.js (CDN-loaded)
- **DOCX**: mammoth (bundled)
- **Plain text/HTML**: `utils/detectStructure.js` uses regex to detect chapters/parts/sections/acts

All parsers return `{ type, title, number, content }` section objects consumed by `DocumentBody`.

`DocumentBody` keeps one React fiber per paragraph, not per word: `utils/paragraphHtml.js` builds each paragraph's markup as an escaped HTML string (word spans, `**bold**`/`__italic__`, lists, `##`/`###` headings, `{r:RATIO}` sizes) and the `Paragraph` component writes it once via `innerHTML` from a ref callback. NeuroDiv, HueGuide, focus mode, and the pacer all read and mutate that markup through the DOM (`.rf-word[data-word][data-hue] > strong + text`), never through React. Rationale: a 427K-word book as React elements was ~1.5M fibers / ~400MB heap, and every garbage collection stalled the page for seconds. Document text is untrusted, so anything new in that builder must go through `escapeHtml`.

Sectioned documents are additionally **DOM-windowed** by `utils/sectionMaterializer.js`: each `Section` registers its `.rf-section` element and paragraph sources; an IntersectionObserver (150% viewport margin) fills a section's `.rf-section-body` with markup when it comes near and empties it when it leaves, freezing its measured height as `min-height` so scroll offsets stay stable. Far chapters therefore have no word nodes at all — Don Quixote goes from ~1.5M DOM nodes to ~7K — which is what makes inherited style changes (theme, typography vars, feature classes, Radix's body `pointer-events`) cheap. Anything that needs a chapter's words must call `materializeSection(sectionEl)` first: the pacer's `wordIndex` does so when stepping into a chapter, and `revealSection` (chapter jump / position restore) does so before measuring. Plain-text documents (no sections) are not windowed.

### Storage Layer

Two-tier:

- **Supabase** for documents (blob in `documents` storage bucket at path `{user_id}/{doc_id}.json`) and the recent-docs index (`recent_docs` table). Accessed via `src/utils/cloudDocs.js`. Schema lives in `supabase/migrations/`. RLS policies enforce per-user isolation on both surfaces.
- **localStorage** (via `src/utils/storage.js`) for small per-device KV: theme persistence (`useThemePreference`), avatar (`useAvatar`), and the owner's `mockFreeMode` UI-testing toggle. Keys are user-scoped: `rf:u:{user_id}:KEY`. Subscription state (plan, trial, upload counter, lockout, Pro grants) is server-authoritative — `useSubscription` SELECTs from `public.subscriptions` with a realtime postgres_changes channel for instant webhook propagation, and uses RPCs (`check_upload_allowed`, `my_post_deletion_lockout_until`, `record_upload`) for the rest.

`storage.js` also provides one-time GC helpers (`storageGcOrphanChunks`, `storageGcUnscopedKeys`) used by `cloudDocs.migrateLocalToCloud` to clean up legacy chunk data and pre-scoping leftovers on first authed load.

### Marketing Analytics

Self-hosted, anonymous-safe funnel built on a single Supabase table. No third-party analytics dependency.

- **Client tracker** (`src/utils/track.js`): writes one row per event to `public.events`. Anonymous-safe (anon role can INSERT under RLS); UTM-sticky (URL params persist to localStorage so a `signup` 3 days after `landing_view` still attributes correctly); failure-tolerant (any error is logged and swallowed — analytics must never break a user-facing flow).
- **Six event names**, fixed by table CHECK constraint:
  - `landing_view` — `App.jsx` mount useEffect
  - `signup` — `AuthContext.signUp` after successful Supabase signup
  - `first_upload` — `App.jsx attemptUpload` after first successful `saveDoc` (gated on `recentList.length === 0`)
  - `paywall_view` — `PaywallModal` mount useEffect
  - `checkout_started` — `App.jsx handleSelectPlan` (post email-verify gate)
  - `checkout_succeeded` — server-side from `stripe-webhook` Edge Function on `customer.subscription.created`. Idempotent (existence check on `(user_id, name)` blocks Stripe redeliveries). Uses `session_id = "server:<user_id>"` to mark backend-originated rows.
- **Owner-gated RPCs** (`SECURITY DEFINER`, `public.is_current_user_owner()` check):
  - `analytics_funnel_30d()` — cohort-anchored funnel. Cohort = distinct sessions that fired `landing_view` in the 30d window; subsequent stages join via `session_id` (signup) or `user_id` (post-signup). Each stage is a strict subset of the prior, so conversion percentages are real cohort percentages. Defined in `20260506000000_marketing_events.sql`, body replaced by `20260510120000_funnel_cohort_fix.sql`.
  - `analytics_traffic_sources_30d()` — top UTM sources, top referrers, direct (no-referrer) count.
- **AdminPanel widgets**: "Funnel (30d)" and "Traffic sources (30d)" render the RPC results. Owner-only.
- **Stripe live-mode caveat**: the deployed webhook uses `sk_live_…`, so Stripe test cards will not fire `checkout_succeeded`. Verification of that event waits on the next real subscription unless a parallel test-mode webhook is configured.

### Key Known TODOs (from README)

- ~~Replace demo Stripe flow with real Checkout Sessions~~ ✅ done — `CheckoutModal` invokes a real Checkout Session; `stripe-webhook` Edge Function handles `customer.subscription.*` lifecycle (live mode — see Stripe live-mode caveat in Marketing Analytics section)
- ~~Move `useSubscription` from localStorage to Supabase~~ ✅ done — `subRow` is fetched from `public.subscriptions` with a realtime postgres_changes channel; upload counter, lockout, and Pro grants come from RPCs / `profiles`. Only `mock-free-mode` (owner UI toggle) remains in localStorage by design.
- ~~Remove DEV bypass button before deploy~~ ✅ done — replaced by owner-only `mockFreeMode` toggle in `UserMenu` (gated by `isOwner` check). No permanent bypass remains; owner can simulate Free state for UI testing via `effectiveAdminBypass = adminBypass && !mockFreeMode`.
- ~~Add error boundaries around parsers~~ ✅ done — `ErrorBoundary` class component wraps `<DocumentBody>` (App.jsx:916-928) with parser-aware fallback + state-clearing `onReset`, and the entire app tree (main.jsx:17-37) as a last-resort catch. Parse path additionally protected by try/catch + `mapParserErrorToMessage` in `doUpload` (App.jsx:419-450).
- ~~Swap `storage.js` adapter for documents~~ ✅ done — recent docs now in Supabase; small KV stays on localStorage by design
- ~~Add `React.lazy()` for modals~~ ✅ done — six modals lazy-loaded, vendor chunks split via `vite.config.js` manualChunks

### Production Deployment Checklist (Phase 10)

When promoting from local dev → production hosting (Vercel / Netlify / etc.), update these in the Supabase Dashboard. The codebase has no environment-specific URLs hardcoded (besides `import.meta.env.VITE_SUPABASE_*`), so all URL configuration lives in Supabase + the host's env-var panel.

**Supabase Dashboard → Authentication → URL Configuration:**
- **Site URL**: set to the production domain (`https://tailormytext.com`). This is the default redirect target Supabase uses for password-reset and email-verification links.
- **Redirect URLs (allowlist)**: add the production domain plus any specific paths used by OAuth callbacks. Wildcard suffix `https://tailormytext.com/*` covers all paths cleanly. Keep `http://localhost:5173/*` in the list while developing in parallel.

**Supabase Dashboard → Authentication → Email Templates:**
- Customize the "Confirm signup", "Reset password", and "Magic Link" templates with the production sender name + branding. The default templates use generic Supabase wording.
- Verify that the `{{ .ConfirmationURL }}` / `{{ .RecoveryURL }}` template placeholders point to the production domain (they're derived from Site URL above, so this should follow automatically).

**Supabase Dashboard → Authentication → Providers → Google (and any other OAuth provider):**
- Update the OAuth callback URL on the provider's side too (Google Cloud Console → OAuth client → Authorized redirect URIs) — Supabase's callback shows as `https://YOUR-SUPABASE-PROJECT.supabase.co/auth/v1/callback`. The app-side redirect after auth uses the Site URL configured above.

**Supabase Dashboard → Database → Extensions:**
- Confirm `pg_cron` is enabled (already required for the doc-TTL and account-deletion sweeps). It carries forward when promoting between environments only if you re-enable it; it's a per-project toggle.

**Hosting platform env vars:**
- `VITE_SUPABASE_URL` — same as dev (Supabase project URL)
- `VITE_SUPABASE_ANON_KEY` — same as dev (publishable anon key)
- *Phase 9 will add server-side env vars*: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` — none of these belong in `VITE_*` (browser-exposed). They live in the hosting platform's server-side env config, used only by Stripe-handling functions.
- `.env.example` should be created at repo root listing the public ones for any teammate cloning the repo.

**Email verification:**
- Confirm Supabase project has email confirmation **enabled** (Authentication → Settings → "Confirm email"). The Phase 8c gate at `handleSelectPlan` only blocks subscription if `user.email_confirmed_at` is null — that field is only `null` when confirmation is enabled and the user hasn't clicked the link yet.

### Component Exports

`src/components/index.js` and `src/utils/index.js` are barrel exports — import from those, not directly from individual files.

### Fonts

Six accessibility-focused font families are preconnected in `index.html` from Google Fonts. Font config lives in `src/config/constants.js` alongside themes, color palettes, and demo text.
