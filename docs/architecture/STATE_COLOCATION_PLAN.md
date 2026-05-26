# State Colocation + App.jsx Decomposition Plan

**Status:** In progress (Phase 1)
**Context:** Follow-up to PR #18 (perf-reader-settings), which delivered a 250× perf win on NeuroDiv intensity via imperative DOM updates but left one architectural problem unsolved: huePalette swatch click is still 700–743ms in dev because App.jsx is a 2061-line monolith and any state change re-evaluates its entire JSX tree (amplified by StrictMode in dev).
**Goal:** Eliminate the App.jsx-wide re-render on every state change by splitting unrelated state into focused hooks + components, following the Single Responsibility Principle. No new state-management dependency.

---

## 1. Current Responsibilities Inventory

App.jsx is 2061 lines with 110 hook invocations. Its responsibilities group into seven distinct buckets, most of which violate SRP.

**Bucket A — Document state** (lines 131-151, 999-1034, 1106-1147)
`text`, `docSections`, `displaySections` (memo), `fileName`, `currentDocId`, `currentDocSource`, `readerOpen`, `dragging`, `hoverUpload`, `loading`, `loadMsg`, `loaderShown`, `loaderOpaque`, `confidence`, `chapterOverrides`. The loader fade timing effect (lines 221-239), the scroll-position save/restore effects (lines 773-912), the signout reset effect (lines 298-305), the `doUpload` and `loadRecentDoc` handlers, and the `attemptUpload` gate all belong here. Violates SRP because document lifecycle, upload gating, persistence, and section-override state are all interleaved.

**Bucket B — Reading position / scroll** (lines 638-912)
`currentSectionIdx`, `scrollToSection`, section/title refs, IntersectionObserver setup, scroll watcher, chapter-restore effect, position-save effect. Self-contained scroll controller with no home outside of App.

**Bucket C — Enhancement state** (lines 166-176, 409-601)
`neuroDiv`, `neuroDivIntensity`, `hueGuide`, `huePalette`, `hueIntensity`, `focusMode`, `focusPara`. Plus: `featureClassRef`, `featureStateRef`, `writeFeatureClass`, `handleFeatureClassRef`, `focusStyleRef` effect, `liveWriters` (the rAF-coalesced imperative writers), the IntersectionObserver for NeuroDiv scoping, and the three stable toggle callbacks.

**Bucket D — Typography state** (lines 178-185, 450-612)
`fontFamily`, `fontSize`, `lineHeight`, `letterSpacing`, `wordSpacing`, `columnWidth`, `textAlign`. Plus `typographyStateRef`, `writeTypographyVars`, `handleDocWrapperRef`, the typography layout effect, `currentFont` memo, the `settings` memo, and `FMT_*` constants.

**Bucket E — Theme state** (lines 185, 307-329, 379-407)
`theme`, `t` (memo), the favicon effect, the theme restore effect, `themePref` hook consumption, `onToggleThemePersist`, `onSelectTheme`.

**Bucket F — Auth / user account** (lines 187-295)
`user`, `role`, `authLoading`, `showAuth`, `isRecovering`, `pendingGift`, the gift-link toast effect, the password-recovery effect, `avatar`, `saveAvatar`, `themePref`. Also: `showAvatarSettings`, `showSubscription`, `showDeleteAccount`, `handleShowPaymentReceipts`.

**Bucket G — Subscription + modal orchestration** (lines 332-353, 914-931, 1036-1164, 1208-1246)
`sub` (hook), `showPricing`, `showPaywall`, `showCheckout`, `checkoutBilling`, `showLibraryDrawer`, `showChapterNav`, `editChaptersOpen`, `gateCosmetic`, `handleSelectPlan`, Checkout-return URL effect. The "modal bus" — dispatches between Stripe/paywall/account modals.

**What is already extracted (not in App.jsx):**
`useSubscription`, `useRecentDocs`, `useLibrary`, `useAvatar`, `useThemePreference`, `useReadingGuide` — six custom hooks. `DocumentBody` owns the full document render tree. The 9 modal components are lazy-loaded and self-contained. Solid prior work; the problem is purely that App still owns all the state that feeds these components.

---

## 2. Target Decomposition

9 focused components/hooks replacing the monolith. No routing, no TypeScript.

| Name + Path | Owns | Accepts from parent | Renders |
|---|---|---|---|
| `src/features/document/useDocumentState.js` | `text`, `docSections`, `displaySections`, `fileName`, `currentDocId`, `currentDocSource`, `readerOpen`, `confidence`, `chapterOverrides`, `loading`, `loadMsg`, loader timing | `sub`, `recentDocs`, `user`, `showToast` | nothing — hook only |
| `src/features/document/DocumentLoader.jsx` | `loaderShown`, `loaderOpaque` animation | `loading`, `loadMsg`, `t` | The fixed loader overlay |
| `src/features/reader/useScrollController.js` | `currentSectionIdx`, scroll watcher, position save/restore, IntersectionObserver (NeuroDiv scoping), `sectionRefs`, `titleRefs` | `docSections`, `hasSections`, `currentDocId`, `currentDocSource`, `user`, `neuroDivIntensityRef` | nothing — hook only |
| `src/features/reader/useEnhancements.js` | `neuroDiv`, `neuroDivIntensity`, `hueGuide`, `huePalette`, `hueIntensity`, `focusMode`, `focusPara`, all feature-class/style refs and live writers, the stale-section IntersectionObserver | `docWrapperRef`, `sub.isPro`, `gateCosmetic` | nothing — hook only |
| `src/features/reader/useTypography.js` | `fontFamily`, `fontSize`, `lineHeight`, `letterSpacing`, `wordSpacing`, `columnWidth`, `textAlign`, all typography refs and live writers | `docWrapperRef`, `hueIntensity` | nothing — hook only |
| `src/features/reader/Sidebar.jsx` | `panelOpen` | `t`, `sub`, `text`, `fileName`, enhancements, typography, `recentDocs`, `library`, `fileRef`, callbacks | Full sidebar panel |
| `src/features/reader/ReaderToolbar.jsx` | `showChapterNav` | `t`, `sub`, `docSections`, `currentSectionIdx`, `scrollToSection`, feature toggles, `confidence`, `user`, modal callbacks | Top bar |
| `src/features/landing/Landing.jsx` | `dragging`, `hoverUpload` | `t`, `sub`, `user`, `recentDocs`, `library`, `attemptUpload`, `openLibraryBook`, `loadRecentDoc`, modal callbacks, `theme`, `onSelectTheme` | The full landing page tree |
| `src/features/auth/useGiftLink.js` | `pendingGift`, the gift-link toast effect | `user`, `authLoading`, `showToast` | nothing — hook only |

App.jsx itself becomes an orchestrator of ~150-200 lines that: imports these hooks, assembles the `modals` block, and decides whether to render `<Landing>`, the reader, or the subscription loading splash.

---

## 3. State Management Decision

**Decision: No new library. Status quo (`useState`) + component split.**

Rationale: the root problem is not state shared across isolated subtrees without selectors — it's that unrelated state lives in the same component, so any `setState` (like `setHuePalette`) triggers the entire 2061-line function to re-evaluate even though `DocumentBody` is already memo-stable. Once state is split across the components proposed above, a palette swatch click only re-renders `Sidebar` (which owns `huePalette`), not the reader or the toolbar. That eliminates the 350ms render without any store library.

**Door explicitly left open:** if profiling after Phase 5 shows a remaining cross-tree sharing problem, Zustand is the first candidate to add at that point. Valtio is ruled out — its mutation-in-place model conflicts with the immutability rule in `~/.claude/rules/common/coding-style.md`.

---

## 4. Phased Execution Plan

Each phase is its own branch + PR off `production`. Each PR is independently shippable and per-commit-verifiable.

### Phase 1 — Extract `useDocumentState` hook (lowest risk)

**What changes:** Move `text`, `docSections`, `fileName`, `currentDocId`, `currentDocSource`, `readerOpen`, `confidence`, `chapterOverrides`, loader state (`loading`, `loadMsg`, `loaderShown`, `loaderOpaque`, `loaderStartedAt`), `doUpload`, `attemptUpload`, `loadRecentDoc`, `openLibraryBook`, and the loader fade effect out of App.jsx into `src/features/document/useDocumentState.js`. App.jsx calls this hook and destructures its return.

**Why first:** Clearest boundary. Returns a flat object of state + handlers. No DOM refs, no JSX. Easiest to extract with low regression surface.

**Verify:** Upload a PDF, load a recent doc, open a library book, trigger the paywall (free quota exhausted). Loader overlay appears and fades correctly on all three paths.

**Rollback:** One hook call removed, all state inlined back. Single-file revert.

**Estimated commits:** 2.

### Phase 2 — Extract `useEnhancements` hook

**What changes:** Move Bucket C entirely into `src/features/reader/useEnhancements.js`. Includes all feature toggle state, `liveWriters` (rAF-coalesced DOM writers), `featureClassRef`, `focusStyleRef`, the NeuroDiv IntersectionObserver, and the three stable toggle callbacks. `docWrapperRef` passed in as a parameter (Phase 3 absorbs it).

**Why second:** Prerequisite plumbing for the Phase 5 perf win. Once `huePalette` lives inside `useEnhancements`, the swatch click no longer requires App-level state to flow through Sidebar.

**Verify:** Toggle NeuroDiv, HueGuide, Focus from both sidebar and reader top bar. Drag intensity sliders. Select all palettes — verify 5 CSS vars update with no React reconciliation (confirm via React DevTools "why did this render").

**Rollback:** Re-inline the hook body.

**Estimated commits:** 2.

### Phase 3 — Extract `useTypography` hook

**What changes:** Move Bucket D into `src/features/reader/useTypography.js`. All typography state, `writeTypographyVars`, `typographyStateRef`, layout effect, `currentFont` memo, `docWrapperRef`, `handleDocWrapperRef`, and `FMT_*` constants (move to `src/config/formatters.js` sibling).

**Why third:** Typography state changes cause the same App-wide re-render. Prerequisite for `Sidebar` isolation. `docWrapperRef` logically belongs here; absorbing it permanently means updating `useEnhancements` to accept the ref from `useTypography`'s return.

**Verify:** All slider drags produce CSS var updates with no React commit. Font picker change triggers DiaTextReveal re-animation in the toolbar. Column width changes reflect immediately.

**Rollback:** Re-inline hook body; restore `docWrapperRef` to App.

**Estimated commits:** 2.

### Phase 4 — Extract `useScrollController` hook

**What changes:** Move `currentSectionIdx`, `scrollToSection`, scroll watcher effect, chapter-restore effect, position-save effect, section/title refs into `src/features/reader/useScrollController.js`. The NeuroDiv IntersectionObserver (visibility scoping) moves from `useEnhancements` into this hook — scroll visibility is fundamentally a scroll concern.

**Why fourth:** Depends on `useDocumentState` (needs `docSections`, `currentDocId`, `currentDocSource`) and `useEnhancements` (needs `neuroDivIntensityRef`).

**Verify:** Open Don Quixote (427K word stress doc). Navigate to chapter 87 via dropdown — verify jump. Scroll halfway through — close and reopen — verify position restores. Drag NeuroDiv intensity — verify visible-section count in DEV perf log.

**Rollback:** Re-inline into App.

**Estimated commits:** 3 (more complex due to IntersectionObserver migration).

### Phase 5 — Extract `Sidebar` and `ReaderToolbar` components ⭐ Perf win lands here

**What changes:** Move full sidebar panel JSX into `src/features/reader/Sidebar.jsx`, passing hook returns as props. Move reader top bar JSX into `src/features/reader/ReaderToolbar.jsx`. `huePalette` state lives inside `useEnhancements`, consumed by `Sidebar` — swatch click now re-renders `Sidebar` only.

**Why fifth:** Cannot be done before Phases 2 and 3 establish the hook boundaries. Component extraction without prior hook extraction would just move the same problem one level down.

**Verify:** This is the **critical** verify step. React DevTools Profiler recording: click every palette swatch — commit should touch only `Sidebar`'s subtree. Target: swatch click commit time **under 20ms** (was 700-743ms). Repeat for typography sliders. Theme change should still animate via View Transitions.

**Rollback:** Move JSX back inline into App.

**Estimated commits:** 3 (Sidebar, Toolbar, prop-drilling cleanup).

### Phase 6 — Extract `Landing` component

**What changes:** Move full landing page JSX into `src/features/landing/Landing.jsx`. Extract `useGiftLink` into `src/features/auth/useGiftLink.js` at the same time. `dragging`/`hoverUpload` state moves into Landing.

**Why last:** Most inline JSX and most prop threading. Doing it last means App's API surface is already clean from prior phases.

**Verify:** Complete landing page smoke test — drag-drop upload, click-to-browse, demo article, pricing modal, library section, theme picker with View Transition, Continue Reading, Your Bookshelf. Auth modal opens from both landing CTA and UserMenu.

**Rollback:** Move JSX back inline.

**Estimated commits:** 2.

---

**Post-phases App.jsx target:** ~200 lines. Calls 7 hooks (6 extracted + `useAuth`), assembles the modal block, renders `<Landing>`, the reader, or the subscription loading splash.

---

## 5. Risk Register

**R1 — Subscription realtime channel broken by hook reorganization.**
`useSubscription` is fully extracted and untouched. The only change: `sub` is passed as a parameter rather than spread directly. Each phase passes `sub` through as an opaque object; its realtime channel is never re-subscribed. Verify after each phase by toggling `mockFreeMode` and confirming UI reflects the mode change instantly.

**R2 — Ref timing bugs when `docWrapperRef` moves between phases.**
Used by both `useEnhancements` (palette writes) and `useTypography` (CSS var writes) during the Phase 2→3 transition. Phase 2 passes `docWrapperRef` as a parameter with a comment marking it as temporary. Phase 3 absorbs it and updates `useEnhancements` to accept it from `useTypography`'s return.

**R3 — Modal state restoration broken on auth flow (password recovery, gift link).**
The `isRecovering → setShowAuth(true)` effect and gift-link toast logic depend on `user`, `authLoading`, and `showToast` in the same tree. `useGiftLink` (Phase 6) captures these as parameters. The password-recovery effect is two lines and stays in App rather than being extracted — not worth a hook for its size, and keeping it in App means it cannot lose sight of `setShowAuth`. Documented as intentional non-extraction.

**R4 — `liveWriters` rAF-coalesced NeuroDiv walk broken by IntersectionObserver migration.**
The NeuroDiv IO currently lives in App alongside `visibleSectionsRef` and `sectionStaleRef`. `liveWriters.neuroDivIntensity` reads `visibleSectionsRef.current` synchronously. In Phase 2, `liveWriters` moves to `useEnhancements`; in Phase 4, `visibleSectionsRef` moves to `useScrollController`. The cross-hook ref dependency must be threaded correctly. `useScrollController` returns `{ visibleSectionsRef, sectionStaleRef }`, passed into `useEnhancements` at construction. DEV perf log validates correctness on Don Quixote after Phase 4.

**R5 — `fileRef` shared between Sidebar and Landing.**
The hidden file `<input>` ref is in App, used by sidebar Upload, landing drop zone, and reader top bar. Stays in App, passed as a prop to Sidebar and Landing. Only one `<input type="file">` exists in the DOM at any time (verify in DevTools).

---

## 6. Out of Scope

This plan explicitly does not touch:

- Parser pipeline: `parsePDF`, `parseEPUB`, `parseDOCX`, `parseHTMLStructured`, `parseMarkdownStructured`, `parseInWorker`, `sniffDocumentType`, `applyChapterOverrides` — all remain in `src/utils/`.
- Storage layer: Supabase `documents` bucket at `{user_id}/{doc_id}.json`, `recent_docs` table, localStorage `rf:u:{user_id}:KEY` scoping.
- `useSubscription` internals: realtime postgres_changes channel, RPCs (`check_upload_allowed`, `record_upload`), Stripe logic.
- `DocumentBody.jsx`: already well-extracted and memo-stable.
- The 9 modal components: self-contained lazy-loaded already.
- `AuthContext`, `useAuth`, `useRecentDocs`, `useLibrary`, `useAvatar`, `useThemePreference`, `useReadingGuide` — already extracted hooks.
- Supabase Edge Functions or database schema.
- Testing infrastructure (no test runner currently configured; Phase 5's React Profiler measurement is the most important manual check, documented as a browser test checklist).
- TypeScript adoption.
- Routing or navigation model changes.
