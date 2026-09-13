# TailorMyText — Project Architecture

## Setup
```bash
npm install
npm run dev
```

## File Structure (Single Responsibility Principle)

```
tailormytext/
├── index.html                    # Entry HTML
├── package.json                  # Dependencies & scripts
├── vite.config.js                # Vite + React plugin
│
└── src/
    ├── main.jsx                  # React root mount
    ├── App.jsx                   # Root orchestrator — state + composition
    │
    ├── config/
    │   └── constants.js          # Themes, fonts, palettes, Stripe config, demo text
    │
    ├── utils/
    │   ├── index.js              # Barrel export
    │   ├── storage.js            # Storage adapter (swap for IndexedDB/Supabase)
    │   ├── scriptLoader.js       # CDN script loader
    │   ├── parsePDF.js           # PDF → structured sections
    │   ├── parseEPUB.js          # EPUB → structured chapters
    │   ├── parseDOCX.js          # DOCX → structured sections
    │   └── detectStructure.js    # Plain text/HTML → auto-detected chapters
    │
    ├── hooks/
    │   ├── useSubscription.js    # Plan state, trial lifecycle, upload limits
    │   └── useRecentDocs.js      # Chunked persistent document storage
    │
    ├── components/
    │   ├── index.js              # Barrel export
    │   ├── Primitives.jsx        # Toggle, Slider, Segment, Section, FontPicker
    │   ├── DocumentBody.jsx      # Document renderer (memo'd)
    │   ├── UploadBadge.jsx       # Plan status badge (memo'd)
    │   ├── RecentDocsList.jsx    # Recent docs — sidebar + landing variants
    │   ├── ReadingGuideOverlay.jsx # Highlight/underline/dim (ref-based)
    │   ├── PricingModal.jsx      # Plan selection
    │   ├── PaywallModal.jsx      # Upload limit gate
    │   └── CheckoutModal.jsx     # Payment form with autofill
    │
    └── styles/
        └── global.css            # Static CSS, scrollbars, OpenDyslexic @font-face
```

## Production TODOs
- [x] Replace demo Stripe flow with real Checkout Sessions — live mode active; subscription lifecycle handled by `supabase/functions/stripe-webhook`
- [x] Swap storage.js adapter for IndexedDB or backend API — recent docs now in Supabase via `cloudDocs`; small KV remains on localStorage by design
- [x] Remove DEV bypass button before deploy — replaced by owner-only `mockFreeMode` toggle in `UserMenu`; no permanent bypass remains in the build
- [x] Add error boundaries around parsers — `ErrorBoundary` wraps `<DocumentBody>` and the entire app tree; parse path also protected by try/catch with friendly per-format error messages
- [x] Add React.lazy() for modals (code-split) — six modals lazy-loaded; vendor chunks split via `vite.config.js` `manualChunks`
- [x] Self-hosted marketing funnel — `public.events` table + UTM-sticky `track.js` client + cohort-anchored `analytics_funnel_30d()` RPC + AdminPanel funnel/traffic-sources widgets. See CLAUDE.md "Marketing Analytics" for architecture.
