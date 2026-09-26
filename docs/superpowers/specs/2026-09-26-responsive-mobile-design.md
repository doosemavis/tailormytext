# Responsive Phone & Tablet Web App — Design Spec

**Date:** 2026-09-26
**Status:** Approved in brainstorming; awaiting spec review
**Branch:** `feat/responsive-mobile` (off `origin/production` @ `775b234`)
**Worktree:** `~/dev/tailormytext-responsive`

## 1. Summary

TailorMyText works well on desktop and mostly on tablets, but on phones the
reader's top toolbar runs off-screen, so a phone reader cannot reach the
chapter menu, the four feature toggles, or their account. The landing page's
two-column sections and six-card grid also overflow at phone width.

This project makes every existing screen work on phones and tablets, and makes
the site installable to the home screen. It is a **presentation-only**
change: every feature keeps its current behavior, and the desktop layout
renders identically.

This is phase 1 of a longer mobile path:

| Phase | Scope | Status |
| --- | --- | --- |
| **1 (this spec)** | Responsive layout + basic home-screen install | Designing |
| 2 | Offline reading (service worker + document caching) | After phase 1 ships |
| 3 | App Store / Google Play apps: Capacitor wrap + RevenueCat in-app purchase, synced to the existing Supabase `subscriptions` table | Later |
| 4 | Licensed DRM (Readium LCP first, Adobe RMSDK possible) via native Capacitor plugins | Maybe, after store apps |

Content stays DRM-free: the Gutenberg/public-domain library plus readers' own
EPUB and TXT files. Kindle and Nook DRM are never an option (not licensable;
circumvention violates DMCA §1201). Selling books is out of scope indefinitely.

## 2. Decisions made in brainstorming

| Question | Decision |
| --- | --- |
| Native app vs. website | Responsive website first; store apps are phase 3 |
| Phase 1 depth | Responsive + home-screen install; offline is phase 2 |
| Payments | Unchanged: Stripe on web. RevenueCat arrives with store apps in phase 3 |
| Approach | Hybrid: CSS classes + media queries for reflow; a breakpoint hook only for the three structural swaps |
| Feature behavior | **Must not change.** Only arrangement differs on smaller screens |
| Desktop (≥ 1024px) | Renders identically, proven by zero-tolerance screenshot diffs |
| Tablet side panel | Slides over the text instead of pushing it (fixes today's clipped toolbar) |
| Touch | Added alongside mouse/keyboard, never replacing them; gated on `(pointer: coarse)` |
| Branching | All work on `feat/responsive-mobile`; reaches `production` only via a PR the owner merges |

## 3. Guardrails (hard requirements)

1. **No behavior change to existing features.** Pacer, NeuroDiv, HueGuide,
   focus mode, reading guide, themes, typography controls, uploads/parsers,
   library, auth, and subscriptions keep their current logic. Work is layout
   and presentation only. Any change to a logic file (hooks, utils, config
   that drives behavior) is flagged to the owner and needs explicit approval
   before it is made. §11 lists the one such change currently proposed.
2. **Desktop renders identically.** At 1024, 1280, and 1440px, every captured
   state matches the baseline pixel-for-pixel (§9). Any difference blocks the
   change.
3. **Existing tests are not edited** and must all pass.
4. **Touch is additive.** Touch handlers only run for touch input; mouse and
   keyboard paths are untouched.
5. **Isolation.** Nothing merges to `production` until the owner approves the
   final PR. Scrapping the project means deleting the branch and worktree.

## 4. Screen tiers

Measured on the live reader (2026-09-26): the reader toolbar needs ~715px with
the side panel closed and ~1011px with it open. Today it clips below 744px
(panel closed) and below ~1011px (panel open), so portrait tablets already
lose controls when the panel is open.

| Tier | Width | Treatment |
| --- | --- | --- |
| Desktop | ≥ 1024px | Unchanged |
| Tablet | 768–1023px | Desktop toolbar and landing page; side panel becomes a slide-over |
| Phone | < 768px | Phone toolbar, slide-over panel, one-column landing, full-height dialogs |

Constants live in `src/config/breakpoints.js`:

```js
export const PHONE_MAX = 767;   // < 768 is phone
export const TABLET_MAX = 1023; // 768–1023 is tablet; ≥ 1024 is desktop
export const MQ_PHONE = `(max-width: ${PHONE_MAX}px)`;
export const MQ_TABLET_DOWN = `(max-width: ${TABLET_MAX}px)`;
export const MQ_TOUCH = "(pointer: coarse)";
```

CSS media queries use the same numbers. A comment in `responsive.css` names
`breakpoints.js` as the source of truth.

Touch is detected separately from width with `(pointer: coarse)`, so a
landscape iPad or touchscreen laptop keeps the desktop layout but still gets
the touch additions (§6.5).

## 5. Architecture

### 5.1 New files

```
src/config/breakpoints.js                    tier constants + media-query strings
src/hooks/useBreakpoint.js                   { tier: "phone"|"tablet"|"desktop", isTouch } via matchMedia
src/styles/responsive.css                    tier media queries + extracted tmt-* layout classes
src/components/ReaderSidebarContent.jsx      side-panel contents, shared by desktop panel and slide-over
src/components/mobile/SlideOverPanel.jsx     Radix Dialog wrapper: backdrop, focus trap, Esc, scroll lock
src/components/mobile/PhoneReaderToolbar.jsx phone top bar
src/components/mobile/ReaderToolsPopover.jsx 2×2 grid of the four FeatureToggleButtons
src/components/mobile/index.js               barrel export
scripts/generate-icons.mjs                   one-time PNG icon rasterizer (Playwright)
public/icons/*.png                           generated icons
tests/visual/                                Playwright screenshot baseline + diff specs
playwright.config.js
```

`responsive.css` is imported in `src/main.jsx` immediately after
`global.css`.

### 5.2 Dependencies

| Package | Kind | Why |
| --- | --- | --- |
| `@radix-ui/react-popover` | runtime | Tools popover; same Radix family already used for Dialog/DropdownMenu |
| `@playwright/test` | dev | Screenshot baselines, zero-tolerance diffs, icon rasterizing |

No other new dependencies.

### 5.3 `useBreakpoint`

- Subscribes to `MQ_PHONE`, `MQ_TABLET_DOWN`, and `MQ_TOUCH` with
  `matchMedia(...).addEventListener("change", ...)`.
- Returns a memoized `{ tier, isTouch }`. It only changes when a boundary is
  crossed, so `App` re-renders at most once per crossing, not on every resize.
  This matters: an `App` render costs ~25ms on a 420K-word book.
- Initial value is read synchronously from `matchMedia` so the first paint uses
  the right tier.

### 5.4 How desktop stays identical

- The reader's desktop branch is today's JSX. The only desktop-path edit is
  replacing the side panel's inline contents with `<ReaderSidebarContent … />`,
  which renders the same elements with the same props.
- Landing-page layout styles move from inline objects to `tmt-*` classes whose
  base (non-media-query) rules use exactly the current values. Phone rules sit
  inside `@media (max-width: 767px)`.
- `100dvh`, safe-area padding, and slide-over behavior apply only inside
  tablet/phone media queries or behind `tier !== "desktop"`.

## 6. Reader

### 6.1 Phone toolbar (< 768px)

`PhoneReaderToolbar` replaces the desktop top row at phone width:

```
[☰ panel] [ Chapter 3: Typograph… ▾ ] [ ⚙ Tools ] [ avatar ]
```

- **Chapter menu:** the same Radix DropdownMenu with the same
  `ChapterDropdownItem` list and `scrollToSection` handler. The trigger label
  truncates with an ellipsis; content width is `min(320px, 100vw - 32px)`.
- **Tools:** opens `ReaderToolsPopover`, a Radix Popover holding the four
  existing `FeatureToggleButton`s (NeuroDiv, HueGuide, Focus, Pacer) in a 2×2
  grid, each with a text label rendered beside it by the popover (the button
  component itself is unchanged), wired to the same `toggleNeuroDiv`,
  `toggleHueGuide`, `toggleFocusMode`, and `pacer.toggle`.
- **Account:** the existing `UserMenu` rendered avatar-only via a new optional
  `compact` prop. The prop defaults to off, so every existing call site
  renders exactly as today.
- **Uncertainty badge:** kept, next to the chapter menu.

Tablet and desktop keep today's toolbar unchanged.

### 6.2 Side panel (tablet and phone)

- Rendered inside `SlideOverPanel` (Radix Dialog) instead of the width-animated
  inline column.
- Tablet: 296px wide (`SIDEBAR_WIDTH`), from the left, with a dimmed backdrop.
- Phone: `calc(100vw - 48px)` wide so a strip of backdrop stays tappable.
- Closes on backdrop tap, Esc, or the panel's existing close control. The page
  behind does not scroll while open. It opens and closes through the existing
  `panelOpen` state; no new panel state.
- Contents are `ReaderSidebarContent`, identical to desktop.

### 6.3 Screen fit (tablet and phone)

- Reader root height `100vh` becomes `100dvh` (fallback `100vh`), so the phone
  browser's collapsing address bar doesn't hide the bottom of the reader.
- `index.html` viewport meta gains `viewport-fit=cover`. Desktop browsers
  ignore it.
- Top bar, pacer bar, and toasts pad with `env(safe-area-inset-*)` for the
  notch and home indicator.

### 6.4 Pacer bar

- `PacerTransport` spans the full width at phone size, sits above the home
  indicator, and keeps its existing controls (play/pause, restart, WPM nudge).
- Tap-to-place already works through `pacer.handleReaderClick`.
- Line/paragraph stepping for touch is an **open decision** (§11).

### 6.5 Touch additions (`isTouch` only)

- **Reading guide:** the reader's existing `onClick` gains a branch: when the
  click came from touch (`e.pointerType === "touch"`, or `isTouch` when
  `pointerType` is unavailable), it calls
  `guide.handleMouseMove({ clientY: e.clientY }, readerRef.current)` and
  `setShowGuide(true)`. `useReadingGuide` reads only `e.clientY`, so it is not
  modified. After a tap the guide stays at that screen position while the text
  scrolls under it, matching today's behavior with a stationary mouse. Mouse
  clicks skip this branch; `pacer.handleReaderClick` still runs for all
  clicks.
- **Tap targets:** under `(pointer: coarse)`, interactive controls in the
  reader chrome get a 44×44px minimum hit area (padding, not visual size, where
  possible).
- Hover-only styling (for example the sidebar row `onMouseEnter` color shift)
  is left as is. It is harmless on touch.

## 7. Everything outside the reader

### 7.1 Landing page (phone only; tablet already renders correctly)

| Section | Phone treatment |
| --- | --- |
| Hero | Already stacks via `.tmt-hero` @ 980px; phone padding only |
| Feature carousel | Phone padding; card fits width |
| Theme dots | Wrap to two rows as needed |
| The Reading Room | Two columns become one |
| Bookshelf | Scales to fit the width (no horizontal overflow) |
| "One reader, countless ways" | Two columns become one |
| Six condition cards | Three columns become one |
| Quote and CTA, footer | Phone padding |

Each section's layout-bearing inline styles (grid columns, gaps, padding,
widths) move to a `tmt-*` class with identical desktop values. Non-layout
inline styles stay inline.

### 7.2 Dialogs (all Radix Dialog)

| Dialog | Phone treatment |
| --- | --- |
| Auth, Checkout, Paywall, Subscription, Avatar, Contact, Delete Account | Already fit; add phone padding, safe-area insets, `max-height: calc(100dvh - 32px)` with internal scroll |
| Pricing | Two plan columns (`1fr 1fr`) stack to one |
| Edit Chapters | Full screen |
| Library drawer | Full width |

### 7.3 Other surfaces

- **Account, Privacy, Terms:** phone padding and reading width.
- **Toasts:** `width: min(480px, calc(100vw - 32px))`, above the home
  indicator.
- **Stripe checkout:** unchanged. `CheckoutModal` redirects to Stripe's hosted
  page, which is already mobile-ready.
- **Admin panel:** out of scope (owner-only, desktop-only).

## 8. Home-screen install

- **Icons:** `scripts/generate-icons.mjs` rasterizes `public/favicon.svg` once
  with Playwright into `public/icons/`:
  - `apple-touch-icon-180.png`
  - `icon-192.png`, `icon-512.png` (`purpose: "any"`)
  - `icon-maskable-512.png` (`purpose: "maskable"`), logo inside the central
    80% safe zone on a `#FDFAF5` background
- **Manifest:** list the PNGs with correct `purpose` values (replacing the
  single `"any maskable"` SVG entry); add `"id": "/"` and `"scope": "/"`; keep
  `display: standalone`, `background_color`, `theme_color`, and the existing
  name, short name, and description.
- **`index.html`:** `apple-touch-icon` points to the 180px PNG; add
  `apple-mobile-web-app-title` ("TailorMyText"),
  `apple-mobile-web-app-status-bar-style` (`default`), and
  `mobile-web-app-capable`.
- **No service worker** in this phase (phase 2).
- **Standalone-mode checks** (device checklist, §9.6): every page has an
  in-app way back; Stripe checkout returns into the app; Google sign-in returns
  into the app.

## 9. Testing and verification

### 9.1 Desktop baseline (before any product change)

Playwright captures the production build (`vite build && vite preview`) of
commit `775b234` at 1024×900, 1280×900, and 1440×900:

- Landing page, full page
- Reader with the demo article: default; side panel open; NeuroDiv on;
  HueGuide on; Focus on; Pacer on (transport visible); each reading-guide mode
  (highlight, underline, dim) at a fixed pointer position; chapter menu open
- Each dialog open: Auth, Pricing, Paywall, Subscription, Contact, Checkout
  (pre-redirect), Edit Chapters; library drawer open
- Account, Privacy, Terms pages

Determinism: animations and transitions disabled via injected CSS, the
landing carousel paused on its first slide, fonts awaited
(`document.fonts.ready`), and any live-data region masked. Signed-out states
only, except states that need sign-in (Account, Subscription), which use a
mocked Supabase session.

### 9.2 Desktop diff (after every step)

Same captures compared with `toHaveScreenshot({ maxDiffPixels: 0 })`. Any
difference blocks the step until explained and fixed.

### 9.3 Existing tests

`npm test` passes with no edits to existing test files.

### 9.4 New tests (vitest + @testing-library/react + happy-dom)

- `useBreakpoint`: tier and `isTouch` from mocked `matchMedia`; updates only
  on boundary crossing.
- `ReaderToolsPopover`: renders the four toggles; each calls the handler it
  was given.
- `SlideOverPanel`: opens and closes via `open`/`onOpenChange`; backdrop and
  Esc close.
- Touch guide branch: a touch click calls `handleMouseMove` with its
  `clientY`; a mouse click does not.

### 9.5 Phone and tablet checks (automated)

Viewports: 360×780, 390×844, 430×932, 844×390 (landscape phone), 744×1133,
820×1180, 1024×768. For every surface in §9.1:

- **No horizontal overflow:**
  `document.documentElement.scrollWidth === innerWidth`.
- Every reader control reachable: toolbar controls within the viewport.
- Screenshots saved for owner review.

### 9.6 Device checklist (owner)

On an iPhone in Safari and an Android phone in Chrome, using the branch
preview URL:

1. Landing page reads cleanly top to bottom; nothing is cut off.
2. Open the demo article; open and close the side panel; change a theme and a
   font.
3. Tools: toggle each of NeuroDiv, HueGuide, Focus, Pacer.
4. Pacer: tap a word, play, pause, change speed.
5. Reading guide: tap a line in each mode.
6. Sign in (email and Google). Upload an EPUB and a TXT.
7. Add to Home Screen; launch from the icon (full screen, correct icon); sign
   in again; open Pricing and start checkout (do not complete payment on a
   preview).
8. Rotate to landscape and back.

## 10. Shipping

- **Branch and worktree:** `feat/responsive-mobile` in
  `~/dev/tailormytext-responsive`, from `origin/production`. The main checkout
  stays on `production`.
- **Preview:** Cloudflare builds every push at
  `https://feat-responsive-mobile.tailormytext.pages.dev`.
  - Previews use the live Supabase project and live Stripe. Uploads go to real
    accounts (7-day auto-delete). Never complete a purchase on a preview.
  - Sign-in on the preview needs `https://*.tailormytext.pages.dev/*` in
    Supabase → Authentication → URL Configuration → Redirect URLs (owner
    action).
- **Build order.** Each step ends with §9.2 passing, `npm test` passing, and a
  pause for owner review on the preview:

| Step | Work | Touches desktop code path? |
| --- | --- | --- |
| 0 | Spec and plan docs; Playwright tooling; desktop baseline from `775b234` | No |
| 1 | `breakpoints.js`, `useBreakpoint`, `responsive.css` scaffold, `dvh`, safe areas, `viewport-fit` | No (diff must be zero) |
| 2 | Extract `ReaderSidebarContent`; add `SlideOverPanel` for tablet/phone | Yes (diff must be zero) |
| 3 | `PhoneReaderToolbar`, `ReaderToolsPopover`, pacer bar layout, touch guide, tap targets | No |
| 4 | Landing page phone layout | Yes, style moves with identical values (diff must be zero) |
| 5 | Dialogs, library drawer, pages, toasts | No |
| 6 | Icons, manifest, iOS meta tags | No |
| 7 | Owner device checklist (§9.6); one PR `feat/responsive-mobile` → `production` | n/a |

- **Rollback after merge:** revert the merge commit on `production`;
  Cloudflare redeploys the previous site.
- **Owner's stashed phase-3 work** (`1bbcf29`, touches `App.jsx`) is
  independent of this project and left untouched. Expect conflicts if it is
  applied later.

## 11. Open decisions

1. **Pacer line/paragraph stepping on touch.** Arrow Up/Down stepping lives
   inside the keydown handler in `src/hooks/usePacer.js`, so touch users have
   no equivalent. Options:
   - **A (recommended):** export the existing step logic from `usePacer` as
     `stepLine(dir)` / `stepWord(dir)`, have the keydown handler call the same
     functions (identical key behavior), and add ◀ ▶ buttons to the pacer bar
     for touch only. This is a logic-file change and needs explicit approval
     per §3.1.
   - **B:** no step buttons on touch in phase 1.
   - **C:** touch buttons dispatch synthetic `ArrowUp`/`ArrowDown` keydown
     events. No logic-file change, but brittle.

## 12. Out of scope

- Offline reading, service worker, install prompts (phase 2)
- App Store / Google Play apps, Capacitor, RevenueCat (phase 3)
- DRM of any kind (phase 4 at the earliest)
- Swipe gestures, page-turn mode, or any new reading feature
- Admin panel on mobile
- `landing-concept.html` (static mockup)
