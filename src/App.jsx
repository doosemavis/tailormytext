import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo, lazy, Suspense } from "react";
import {
  Upload, FileText, Type, Palette, Eye, Sun, Moon, BookOpen,
  ChevronDown, X, Sparkles, Baseline, Highlighter, Underline as UnderlineIcon,
  EyeOff, MousePointer2, Focus, PanelLeftClose, PanelLeft,
  Crown, Clock, Check, List, Lock, LibraryBig, ArrowLeft,
  AlignLeft, AlignCenter, AlignRight, AlignJustify
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { THEMES, PALETTES, GUIDE_COLORS, FONTS, DEMO_TEXT } from "./config/constants";
import { isThemeFree, isPaletteFree, isGuideColorFree } from "./config/proFeatures";
import { getRevealColors } from "./config/themeColors";
import { marketingThemeVars } from "./utils/marketingTheme";

// Maps raw parser exceptions to user-friendly messages. Internal pdf.js /
// EPub.js / mammoth error strings ("InvalidPDFException", "Cannot read
// properties of undefined") are leaky and useless to a reader who just
// wants to know "is the file broken or did I do something wrong."
function mapParserErrorToMessage(ext, err) {
  const raw = String(err?.message ?? err ?? "").toLowerCase();
  // Already-friendly messages from our own throws — pass through.
  if (raw.includes("readable text") || raw.includes("doesn't support") || raw.includes("file too large")) {
    return err.message;
  }
  if (ext === "pdf") {
    if (raw.includes("password") || raw.includes("encrypt")) {
      return "This PDF is password-protected. TailorMyText can't open encrypted PDFs.";
    }
    if (raw.includes("invalid") || raw.includes("corrupt") || raw.includes("malformed")) {
      return "This PDF appears corrupted. Try re-downloading it from the source.";
    }
    return "Couldn't read this PDF — it may be malformed or encrypted.";
  }
  if (ext === "epub") {
    return "Couldn't read this EPUB — it may be DRM-protected or malformed.";
  }
  if (ext === "docx") {
    return "Couldn't read this DOCX — try re-saving from Word as a fresh .docx file.";
  }
  if (ext === "html" || ext === "htm") {
    return "Couldn't parse this HTML file. It may use unsupported encoding.";
  }
  return "Couldn't read this file. It may be corrupted or use an unsupported format.";
}

// Stable Slider format helpers (module-level so memo on Slider isn't busted each App render).
const FMT_PX = v => `${v}px`;
const FMT_LH = v => v.toFixed(2);
const FMT_FIXED1_PX = v => `${v.toFixed(1)}px`;
const FMT_PCT = v => `${v}%`;
const FMT_PCT_FROM_FRAC = v => `${Math.round(v * 100)}%`;

// File-picker `accept` attribute (HTML hint) and the strict allowlist
// doUpload validates against. Picker hint and runtime check stay in sync
// because both derive from the same source. The `accept` attribute alone
// can't be relied on — drag-and-drop and "show all files" both bypass it.
const FILE_ACCEPT = ".pdf,.epub,.txt,.md,.docx,.json";
const SUPPORTED_EXTS = new Set(FILE_ACCEPT.split(",").map(s => s.replace(/^\./, "")));

// Theme picker layout: left column = light themes, right column = dark themes (5 + 5).
// Render order is light-first-then-dark; grid-auto-flow: column with 5 rows places them
// in two visual columns. Add new themes to the appropriate array — order within each is the row order.
const LIGHT_THEME_KEYS = ["warm", "cool", "sepia", "forest", "crimson"];
const DARK_THEME_KEYS = ["phosphor", "jungle", "dark", "midnight", "obsidian"];
import { parsePDF, parseEPUB, parseDOCX, parseHTMLStructured, parseMarkdownStructured, detectTextStructure, parseInWorker, runThemeTransition, sniffDocumentType, applyChapterOverrides } from "./utils";
import { storageGet, storageSet, storageDel } from "./utils/storage";
import { supabase } from "./utils/supabase";
import { track, trackParseOutcome } from "./utils/track";
import { useSubscription } from "./hooks/useSubscription";
import { useRecentDocs } from "./hooks/useRecentDocs";
import { useLibrary } from "./hooks/useLibrary";
import { cloudOpenLibraryBook, cloudSaveLibraryPosition, cloudLoadLibraryPosition } from "./utils/cloudDocs";
import { useAvatar } from "./hooks/useAvatar";
import { useThemePreference } from "./hooks/useThemePreference";
import { useAuth } from "./contexts/AuthContext";
import { useToast } from "./components/Toast";
import HeroFeatureFlip from "./components/HeroFeatureFlip";
import ChapterDropdownItem from "./components/ChapterDropdownItem";
import ThemeDot from "./components/ThemeDot";
import FeatureToggleButton from "./components/FeatureToggleButton";
import {
  Toggle, Slider, Segment, Section, FontPicker, Tip,
  UploadBadge, SidebarRecentDocs, LandingRecentDocs, LibrarySection, LibraryTeaseSection,
  LandingBookshelf, SidebarBookshelf,
  DocumentBody, useReadingGuide,
  UserMenu, PendingDeletionBanner, PostDeletionLockoutBanner,
  DiaTextReveal, BookLoader, ErrorBoundary, ReaderEmptyState, Footer,
  UncertaintyBadge,
} from "./components";

// Modals are conditionally rendered and not needed at first paint, so
// they're code-split into their own chunks. Each lazy() returns a
// component that triggers a dynamic import the first time it renders.
const PricingModal         = lazy(() => import("./components/PricingModal"));
const PaywallModal         = lazy(() => import("./components/PaywallModal"));
const CheckoutModal        = lazy(() => import("./components/CheckoutModal"));
const AuthModal            = lazy(() => import("./components/AuthModal"));
const AvatarSettingsModal  = lazy(() => import("./components/AvatarSettingsModal"));
const SubscriptionModal    = lazy(() => import("./components/SubscriptionModal"));
const DeleteAccountModal   = lazy(() => import("./components/DeleteAccountModal"));
const LibraryDrawer        = lazy(() => import("./components/LibraryDrawer"));
const EditChaptersModal    = lazy(() => import("./components/EditChaptersModal"));

export default function App() {
  // ── Document state ──
  const [text, setText] = useState("");
  const [docSections, setDocSections] = useState(null);
  const [fileName, setFileName] = useState("");
  // Stable doc id of the currently loaded doc — used to key per-doc
  // reading position in localStorage so switching between docs and back
  // resumes at the right place.
  const [currentDocId, setCurrentDocId] = useState(null);
  // "upload" | "library" | null. Distinguishes which storage layer drives
  // the reading-position memory for the loaded doc: localStorage (uploads,
  // per-device) vs library_reads (library, cross-device synced).
  const [currentDocSource, setCurrentDocSource] = useState(null);
  // Reader vs Landing visibility. Stays true after a doc is closed so the
  // reader chrome (sidebar + empty-state prompt) keeps rendering instead of
  // bouncing the user back to the landing page. Only the explicit
  // "TailorMyText" back-button in the reader's top bar clears this.
  const [readerOpen, setReaderOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hoverUpload, setHoverUpload] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);

  // Loader overlay state. The raw `loading` boolean flips instantly; the overlay
  // fades in/out around it so a fast parse doesn't flash and a finishing parse
  // doesn't hard-cut to the reader before the reader has rendered underneath.
  //   - `loaderShown` controls whether the overlay is mounted at all.
  //   - `loaderOpaque` drives the CSS opacity transition (1 = covering, 0 = fading out).
  //   - `loaderStartedAt` enforces a minimum visible duration so fast parses
  //     don't flicker. Without this a ~80ms text-file parse would show the
  //     loader for one frame and look like a glitch.
  const [loaderShown, setLoaderShown] = useState(false);
  const [loaderOpaque, setLoaderOpaque] = useState(false);
  const loaderStartedAt = useRef(null);

  // ── Enhancement state ──
  const [neuroDiv, setNeuroDiv] = useState(false);
  const [neuroDivIntensity, setNeuroDivIntensity] = useState(0.42);
  const [hueGuide, setHueGuide] = useState(false);
  const [huePalette, setHuePalette] = useState("ocean");
  const [hueIntensity, setHueIntensity] = useState(1);  // 0 = plain text fg, 1 = full palette
  const [focusMode, setFocusMode] = useState(false);
  const [focusPara, setFocusPara] = useState(-1);
  const [guideDimOpacity, setGuideDimOpacity] = useState(0.25);
  const [guideMode, setGuideMode] = useState("none");
  const [guideColor, setGuideColor] = useState("yellow");

  // ── Typography state ──
  const [fontFamily, setFontFamily] = useState("Literata");
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.8);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [wordSpacing, setWordSpacing] = useState(0);
  const [columnWidth, setColumnWidth] = useState(95);
  const [textAlign, setTextAlign] = useState("left");
  const [theme, setTheme] = useState("warm");

  // ── Auth ──
  const { user, role, loading: authLoading, deletionEffectiveAt, refreshDeletionStatus, isRecovering, clearRecovery } = useAuth();
  const { showToast } = useToast();
  const { avatar, saveAvatar } = useAvatar(user?.id);
  const themePref = useThemePreference(user?.id);
  const [showAuth, setShowAuth] = useState(false);

  // Gift link landing toast — fires once on mount when the URL has
  // ?gift_email=&gift_status= (set by the send-grant-email Edge Function),
  // then watches for the user to sign in as the recipient so it can fire a
  // celebratory follow-up toast at the moment the gift actually "lands."
  //
  // initialFiredRef gates the first-mount toast so it can't re-fire if the
  // user object churns. pendingGift carries the recipient email forward
  // across the auth-state change between the initial toast and the
  // celebration. URL params are stripped only when we know we're done
  // (gift landed, signed in as someone else, or already-recipient case).
  const giftInitialFiredRef = useRef(false);
  const [pendingGift, setPendingGift] = useState(null);

  // Marketing funnel: record one landing_view per session on first mount.
  useEffect(() => { track("landing_view"); }, []);

  // Loader fade-in/out transitions around `loading`. Timing budget:
  //   FADE_MS         loader opacity transition (in and out)
  //   MIN_VISIBLE_MS  shortest time the loader can be on screen, prevents
  //                   sub-300ms parses from flashing
  //   POST_LOAD_HOLD  delay after `loading` flips false before starting the
  //                   fade-out — gives React one frame to commit the new
  //                   reader tree underneath the still-opaque loader, so the
  //                   fade reveals already-painted content instead of a
  //                   half-rendered tree
  // The handoff: loading=true → show + fade in → parse runs → loading=false →
  // hold → fade out → unmount. Reader mounts during the hold/fade window.
  useEffect(() => {
    const FADE_MS = 300;
    const MIN_VISIBLE_MS = 500;
    const POST_LOAD_HOLD = 80;
    if (loading) {
      loaderStartedAt.current = performance.now();
      setLoaderShown(true);
      // Defer the opacity-1 flip to the next frame so the CSS transition
      // observes a 0→1 change instead of mounting opaque.
      const raf = requestAnimationFrame(() => setLoaderOpaque(true));
      return () => cancelAnimationFrame(raf);
    }
    if (!loaderShown) return;
    const elapsed = performance.now() - (loaderStartedAt.current || 0);
    const holdFor = Math.max(POST_LOAD_HOLD, MIN_VISIBLE_MS - elapsed);
    const fadeStartT = setTimeout(() => setLoaderOpaque(false), holdFor);
    const unmountT = setTimeout(() => setLoaderShown(false), holdFor + FADE_MS);
    return () => { clearTimeout(fadeStartT); clearTimeout(unmountT); };
  }, [loading, loaderShown]);

  useEffect(() => {
    if (authLoading) return;

    const stripUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("gift_email");
      url.searchParams.delete("gift_status");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    };

    // First-mount: parse URL, fire the initial toast based on auth state.
    if (!giftInitialFiredRef.current) {
      giftInitialFiredRef.current = true;
      const params = new URLSearchParams(window.location.search);
      const giftEmail = params.get("gift_email");
      const giftStatus = params.get("gift_status");
      if (!giftEmail) return;

      const recipientMatchesUser = user?.email?.toLowerCase() === giftEmail.toLowerCase();
      const signedInAsOther = !!user && !recipientMatchesUser;

      if (signedInAsOther) {
        showToast(`This gift is for ${giftEmail}. Sign out to redeem on that account.`, "info", 10000);
        stripUrl();
      } else if (recipientMatchesUser) {
        showToast("🎁 Your TailorMyText Pro gift is active!", "success", 8000);
        stripUrl();
      } else if (giftStatus === "applied") {
        showToast(`🎁 Welcome back — sign in with ${giftEmail} to access your Pro gift.`, "info", 9000);
        setPendingGift({ email: giftEmail });
      } else {
        showToast(`🎁 You've been gifted TailorMyText Pro. Sign up with ${giftEmail} to redeem.`, "info", 9000);
        setPendingGift({ email: giftEmail });
      }
      return;
    }

    // Follow-up: a pending gift is waiting for the user to sign in. If they
    // just authenticated as the recipient, fire the celebration toast.
    if (pendingGift && user?.email?.toLowerCase() === pendingGift.email.toLowerCase()) {
      showToast("🎁 Your TailorMyText Pro gift is active!", "success", 8000);
      setPendingGift(null);
      stripUrl();
    }
  }, [authLoading, user, showToast, pendingGift]);

  // Force-open AuthModal in "set new password" mode when AuthContext detects
  // a Supabase password-recovery session (user clicked the email reset link).
  // The modal is non-dismissible in this mode — user must complete or sign out.
  useEffect(() => {
    if (isRecovering) setShowAuth(true);
  }, [isRecovering]);
  const [showAvatarSettings, setShowAvatarSettings] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  // Reset document state on signout
  useEffect(() => {
    if (!authLoading && !user) {
      setText("");
      setDocSections(null);
      setFileName("");
      setFocusPara(-1);
    }
  }, [user, authLoading]);

  // Restore the user's saved theme once per login. When the saved theme differs
  // from the current one, run the View Transition reveal (originates from the
  // viewport center since there's no click event) so the swap feels intentional
  // rather than like a layout flash.
  const restoredForUserRef = useRef(null);
  useEffect(() => {
    if (!user) { restoredForUserRef.current = null; return; }
    if (themePref.savedTheme && THEMES[themePref.savedTheme] && restoredForUserRef.current !== user.id) {
      if (themePref.savedTheme !== theme) {
        runThemeTransition(null, () => setTheme(themePref.savedTheme));
      }
      restoredForUserRef.current = user.id;
    }
  }, [themePref.savedTheme, user, theme]);

  // When persistence is on, save the active theme on every change.
  useEffect(() => {
    themePref.saveTheme(theme);
  }, [theme, themePref.saveTheme]);

  const onToggleThemePersist = useCallback(() => {
    themePref.togglePersist(!themePref.persistEnabled, theme);
  }, [themePref, theme]);

  // ── Subscription & modals ──
  const sub = useSubscription(role, user);
  const recentDocs = useRecentDocs(!authLoading, user?.id);
  const library = useLibrary(!authLoading, user?.id);
  const [showPricing, setShowPricing] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutBilling, setCheckoutBilling] = useState("monthly");
  const [showChapterNav, setShowChapterNav] = useState(false);
  // Parser confidence score for the currently-loaded text document.
  // Null for binary parsers (PDF, EPUB, DOCX) and library books.
  // Reset to null whenever a new doc is loaded. D7 will use it for
  // override-aware re-parse decisions; D5 surfaces it as the warning badge.
  const [confidence, setConfidence] = useState(null);
  // Persisted chapter break overrides for the currently-loaded upload doc.
  // Set when cloudLoadDoc returns chapterOverrides; null for fresh uploads,
  // library books, and when the user hasn't saved overrides yet.
  // D7 will consume this to seed the re-parse after EditChaptersModal saves.
  const [chapterOverrides, setChapterOverrides] = useState(null);
  // Controls EditChaptersModal visibility (D6).
  const [editChaptersOpen, setEditChaptersOpen] = useState(false);
  const [showLibraryDrawer, setShowLibraryDrawer] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);

  // ── Refs ──
  const fileRef = useRef();
  const readerRef = useRef();
  const sectionRefs = useRef({});
  const titleRefs = useRef({});
  const docWrapperRef = useRef(null);
  const typographyRafRef = useRef(null);
  // Attached to the active chapter row inside the dropdown; used to
  // scrollIntoView when the dropdown opens so users on chapter 87/149
  // don't see the TOC top + empty space when they reopen the menu.
  const activeChapterRef = useRef(null);

  // ── Derived ──
  const t = useMemo(() => ({ ...THEMES[theme], key: theme }), [theme]);
  const currentFont = useMemo(() => FONTS.find(f => f.name === fontFamily), [fontFamily]);
  const hasSections = docSections && docSections.length > 0 && (docSections.length > 1 || docSections[0]?.title);
  // Override-aware sections for the renderer. docSections (raw parser output)
  // stays untouched so EditChaptersModal paragraph indices remain stable.
  const displaySections = useMemo(
    () => (docSections && chapterOverrides ? applyChapterOverrides(docSections, chapterOverrides) : docSections),
    [docSections, chapterOverrides],
  );

  // Sync favicon + browser-chrome theme-color to the active theme. SVG is
  // regenerated as a data URI on each theme change; the `<link rel="icon">`
  // and `<meta name="theme-color">` in index.html are mutated in place.
  //
  // Dev override: in `vite` (import.meta.env.DEV), force the favicon to
  // magenta so localhost tabs are visually distinct from production tabs.
  // theme-color still tracks the active theme so the browser chrome doesn't
  // flash bright pink — only the tab favicon does.
  useEffect(() => {
    const accent = import.meta.env.DEV ? "#FF1493" : t.accent;

    // Pick white or near-black for the book icon based on the accent's
    // perceived luminance — white on light accents (e.g. midnight's pale
    // blue) reads as low-contrast mush, so flip to dark for those.
    const r = parseInt(accent.slice(1, 3), 16) / 255;
    const g = parseInt(accent.slice(3, 5), 16) / 255;
    const b = parseInt(accent.slice(5, 7), 16) / 255;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const iconColor = luminance > 0.55 ? "#1A1A1A" : "#FFFFFF";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${accent}"/><g transform="translate(14 15)" fill="none" stroke="${iconColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><g transform="scale(1.5)"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></g></g></svg>`;
    const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

    const links = document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]');
    links.forEach(link => { link.href = dataUri; });

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t.accent);
  }, [t.accent]);

  // ── Feature toggles (NeuroDiv/HueGuide/Focus) flip a CSS class on the document inner div via ref.
  //     Single className write, no React reconciliation through the Section subtree. ──
  const featureClassRef = useRef(null);
  const featureStateRef = useRef({ neuroDiv, hueGuide, focusMode });
  featureStateRef.current = { neuroDiv, hueGuide, focusMode };
  // Latest focusMode for descendant onMouseEnter callbacks — read at hover time, never drives re-render.
  const focusModeRef = useRef(focusMode);
  focusModeRef.current = focusMode;

  const writeFeatureClass = useCallback(() => {
    const el = featureClassRef.current;
    if (!el) return;
    const s = featureStateRef.current;
    el.className = [s.neuroDiv && "rf-neurodiv", s.hueGuide && "rf-hueguide", s.focusMode && "rf-focus-mode"].filter(Boolean).join(" ");
  }, []);

  // Callback ref: writes the feature class synchronously on mount so initial DOM state is correct.
  const handleFeatureClassRef = useCallback((el) => {
    featureClassRef.current = el;
    if (el) writeFeatureClass();
  }, [writeFeatureClass]);

  // Toggle-driven updates: synchronous className write before paint — click-to-visual on the same frame.
  useLayoutEffect(() => {
    if (featureClassRef.current) writeFeatureClass();
  }, [neuroDiv, hueGuide, focusMode, writeFeatureClass]);

  // ── Focus style management (kept here so DocumentBody never re-renders for focusPara changes) ──
  const focusStyleRef = useRef(null);
  useEffect(() => {
    if (!focusStyleRef.current) { focusStyleRef.current = document.createElement("style"); document.head.appendChild(focusStyleRef.current); }
    if (focusMode && focusPara >= 0) focusStyleRef.current.textContent = `.rf-para{opacity:0.1;transition:opacity 0.35s ease}.rf-para[data-idx="${focusPara}"]{opacity:1}`;
    else if (focusMode) focusStyleRef.current.textContent = `.rf-para{opacity:0.1;transition:opacity 0.35s ease}`;
    else focusStyleRef.current.textContent = `.rf-para{opacity:1;transition:opacity 0.35s ease}`;
  }, [focusMode, focusPara]);

  // ── Reading guide hook ──
  const guide = useReadingGuide({ guideMode, guideColor, guideDimOpacity, fontSize, lineHeight, t });

  // ── Typography → CSS vars written directly to the document wrapper via ref.
  //     Bypasses React entirely on slider drags; rAF coalesces multiple input events per frame. ──
  const currentFontCss = currentFont?.css;

  // Latest typography snapshot, kept on a stable ref so writeTypographyVars / the callback ref
  // can read current values without re-creating themselves on every typography state change.
  const typographyStateRef = useRef(null);
  typographyStateRef.current = { fontSize, lineHeight, columnWidth, letterSpacing, wordSpacing, textAlign, currentFontCss };

  const writeTypographyVars = useCallback(() => {
    const el = docWrapperRef.current;
    if (!el) return;
    const s = typographyStateRef.current;
    el.style.setProperty("--rf-font-size", `${s.fontSize}px`);
    el.style.setProperty("--rf-line-height", String(s.lineHeight));
    el.style.setProperty("--rf-column-width", `${s.columnWidth}%`);
    el.style.setProperty("--rf-letter-spacing", `${s.letterSpacing}px`);
    el.style.setProperty("--rf-word-spacing", `${s.wordSpacing}px`);
    el.style.setProperty("--rf-text-align", s.textAlign || "left");
    el.style.setProperty("--rf-hue-intensity", String(hueIntensity));
    if (s.currentFontCss) el.style.setProperty("--rf-font-family", s.currentFontCss);
  }, [hueIntensity]);

  // Stable feature-toggle handlers (Perf H1). Without these, the three
  // reader-chrome toggles created a fresh onClick closure per render.
  const toggleNeuroDiv = useCallback(() => setNeuroDiv(v => !v), []);
  const toggleHueGuide = useCallback(() => setHueGuide(v => !v), []);
  const toggleFocusMode = useCallback(() => {
    setFocusMode(v => {
      const next = !v;
      if (!next) setFocusPara(-1);
      return next;
    });
  }, []);

  // Per-slider live writers: write a single CSS var directly to the wrapper on every drag tick.
  // App state isn't touched during drag — we update it once on release via the slider's onChange.
  // huePalette is in the same family: instead of plumbing palette colors as props through 146
  // sections / thousands of paragraphs (each re-walked by React on every palette change), the
  // palette's 5 colors are written to --rf-hue-0..4 on the doc wrapper. DocumentBody emits
  // `color: var(--rf-hue-N)` per word at render time using a slot index derived from word
  // position — that index is palette-independent, so the React tree never re-renders when the
  // user picks a different palette.
  const liveWriters = useMemo(() => {
    // rAF-coalesce: high-DPI pointer input fires `input` events faster than the
    // browser can paint (commonly 100+/sec), so an uncoalesced setProperty per
    // event blocks the main thread enough that the slider thumb itself lags
    // behind the cursor. Wrapping each writer so setProperty runs at most once
    // per frame with the latest pending value keeps the thumb glued to the
    // cursor on big docs (Don Quixote, 146 ch / 427K words).
    const coalesced = (apply) => {
      let pending = null;
      let rafId = 0;
      return (v) => {
        pending = v;
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          apply(pending);
        });
      };
    };
    return {
      fontSize: coalesced(v => docWrapperRef.current?.style.setProperty("--rf-font-size", `${v}px`)),
      lineHeight: coalesced(v => docWrapperRef.current?.style.setProperty("--rf-line-height", String(v))),
      columnWidth: coalesced(v => docWrapperRef.current?.style.setProperty("--rf-column-width", `${v}%`)),
      letterSpacing: coalesced(v => docWrapperRef.current?.style.setProperty("--rf-letter-spacing", `${v}px`)),
      wordSpacing: coalesced(v => docWrapperRef.current?.style.setProperty("--rf-word-spacing", `${v}px`)),
      hueIntensity: coalesced(v => docWrapperRef.current?.style.setProperty("--rf-hue-intensity", String(v))),
      // huePalette stays synchronous: it's click-driven (palette dropdown), not
      // drag-driven, and the mount-time seed in handleDocWrapperRef must run
      // before first paint to avoid a one-frame color flash on .rf-word.
      huePalette: (k) => {
        const el = docWrapperRef.current;
        if (!el) return;
        const colors = PALETTES[k]?.colors;
        if (!colors) return;
        for (let i = 0; i < colors.length; i++) el.style.setProperty(`--rf-hue-${i}`, colors[i]);
      },
      // neuroDivIntensity is structurally per-word (the bold-letter count
      // varies by word length), so it can't ride a single CSS variable like
      // hueIntensity. Previously a React state change here re-walked thousands
      // of memo'd Paragraphs — 2.9-3.6s commit on Don Quixote. Instead we
      // mutate the DOM directly: each `.rf-word` carries `data-word` with the
      // original text, the imperative updater rewrites the <strong> slice and
      // the trailing rest text node. React isn't involved on intensity change.
      // content-visibility:auto on .rf-section bounds the resulting reflow to
      // visible content, so the browser side stays cheap too.
      neuroDivIntensity: coalesced(v => {
        neuroDivIntensityRef.current = v;
        const el = docWrapperRef.current;
        if (!el) return;
        const t0 = import.meta.env.DEV ? performance.now() : 0;
        const words = el.querySelectorAll(".rf-word");
        for (let i = 0; i < words.length; i++) {
          const wEl = words[i];
          const word = wEl.dataset.word;
          if (!word) continue;
          const bl = Math.max(1, Math.round(word.length * v));
          const strong = wEl.firstElementChild;
          if (!strong || strong.tagName !== "STRONG") continue;
          strong.textContent = word.slice(0, bl);
          const rest = strong.nextSibling;
          if (rest && rest.nodeType === Node.TEXT_NODE) {
            rest.textContent = word.slice(bl);
          }
        }
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log(`[perf] neuroDivIntensity DOM walk: ${(performance.now() - t0).toFixed(0)}ms over ${words.length} words`);
        }
      }),
    };
  }, []);

  // huePalette is read from a ref inside handleDocWrapperRef so the ref callback
  // stays stable across palette changes (otherwise React would re-fire the ref
  // each time the user picks a palette).
  const huePaletteRef = useRef(huePalette);
  huePaletteRef.current = huePalette;

  // neuroDivIntensity is read from a ref by Paragraph at render time, so
  // intensity changes don't propagate via props (and so don't re-render any
  // memo'd Paragraph). The DOM is updated imperatively via
  // liveWriters.neuroDivIntensity instead. Keeping the ref in sync on every
  // render means any Paragraph that DOES re-render (theme change, doc swap)
  // reads the live value.
  const neuroDivIntensityRef = useRef(neuroDivIntensity);
  neuroDivIntensityRef.current = neuroDivIntensity;

  // Callback ref: writes vars synchronously the moment DocumentBody's wrapper mounts.
  // Without this, calc(var(--rf-font-size) * 1.5) on titles and calc(var(--rf-line-height) * 1.5em)
  // on dividers evaluate to invalid (no value, no fallback in calc) → headings collapse to body size.
  // Palette vars (--rf-hue-0..4) are seeded the same way so word color resolves on first paint.
  const handleDocWrapperRef = useCallback((el) => {
    docWrapperRef.current = el;
    if (el) {
      writeTypographyVars();
      liveWriters.huePalette(huePaletteRef.current);
    }
  }, [writeTypographyVars, liveWriters]);

  // Palette changes after mount: write the 5 vars on the wrapper. No React render of DocumentBody.
  useLayoutEffect(() => {
    liveWriters.huePalette(huePalette);
  }, [huePalette, liveWriters]);

  // Slider-driven updates: rAF-coalesced direct DOM writes, no React reconciliation in document tree.
  useLayoutEffect(() => {
    if (!docWrapperRef.current) return;
    if (typographyRafRef.current) cancelAnimationFrame(typographyRafRef.current);
    typographyRafRef.current = requestAnimationFrame(() => {
      typographyRafRef.current = null;
      writeTypographyVars();
    });
    return () => { if (typographyRafRef.current) cancelAnimationFrame(typographyRafRef.current); };
  }, [fontSize, lineHeight, columnWidth, letterSpacing, wordSpacing, textAlign, currentFontCss, hueIntensity, writeTypographyVars]);

  // ── Render settings: only props that genuinely change paragraph/section JSX (theme). ──
  //     NeuroDiv/HueGuide/Focus toggles are NOT here — they flip via featureClassRef and never trigger Section re-renders.
  //     huePalette is NOT here either — it's pushed to CSS vars (--rf-hue-0..4) via liveWriters,
  //     so palette changes don't invalidate this memo and don't re-render the document tree.
  //     neuroDivIntensity is NOT here either — Paragraph reads it from intensityRef.current
  //     and slider commits are pushed to the DOM imperatively via liveWriters.neuroDivIntensity,
  //     so changing the bold intensity is a per-word DOM mutation, never a React reconcile.
  const settings = useMemo(
    () => ({ fg: t.fg, fgSoft: t.fgSoft, border: t.border }),
    [t.fg, t.fgSoft, t.border],
  );

  // TEMP-PERF: instrument slider commits + palette/guide-mode clicks on Don Quixote so we can
  // see which phase (render+commit vs layout+paint) owns the seconds of perceived lag. Gated on
  // import.meta.env.DEV → Vite dead-code-eliminates the whole block in production builds.
  // Remove after slice-D scope is decided.
  const __perfRef = useRef(null);
  const __tracePerf = useCallback((name) => {
    if (!import.meta.env.DEV) return;
    __perfRef.current = { name, t0: performance.now() };
  }, []);
  useEffect(() => {
    if (!import.meta.env.DEV || !__perfRef.current) return;
    const t1 = performance.now();
    const { name, t0 } = __perfRef.current;
    __perfRef.current = null;
    requestAnimationFrame(() => {
      const t2 = performance.now();
      // eslint-disable-next-line no-console
      console.log(`[perf] ${name}: render+commit ${(t1 - t0).toFixed(0)}ms · +paint ${(t2 - t1).toFixed(0)}ms · total ${(t2 - t0).toFixed(0)}ms`);
    });
  }, [neuroDivIntensity, hueIntensity, huePalette, guideMode, guideColor]);

  // ── Handlers ──
  // Chapter jump — fast path for user clicks. Skips the settle pass + slow
  // body fade-in that the restore-on-load path uses; layout is already
  // stable for direct clicks (no async font/image loads pending), so the
  // ceremony was wasted ~1s of perceived delay on long books like Don
  // Quixote. Restore (effect below at the doc-load site) keeps the full
  // ceremony because font.ready + late shifts genuinely matter there.
  //
  //   1. Hide wrapper one frame so the click registers as feedback.
  //   2. rAF — force layout, compute target offset, instant-scroll.
  //   3. Reveal: short rf-chapter-snap fade (180ms wrapper-only); the
  //      paragraphs stay visible immediately.
  const scrollToSection = useCallback((idx) => {
    const container = readerRef.current;
    const wrapper = docWrapperRef.current;
    if (!container) return;
    setCurrentSectionIdx(idx);

    if (wrapper) {
      wrapper.classList.remove("rf-chapter-reveal");
      wrapper.classList.remove("rf-chapter-snap");
      wrapper.style.opacity = "0";
      void wrapper.offsetHeight;
    }

    requestAnimationFrame(() => {
      container.classList.add("rf-nav-jump");
      void container.offsetHeight;
      const TOP_GUTTER = 8;
      const target = titleRefs.current[idx] ?? sectionRefs.current[idx];
      if (target) {
        const tr = target.getBoundingClientRect();
        const cr = container.getBoundingClientRect();
        const top = Math.max(0, tr.top - cr.top + container.scrollTop - TOP_GUTTER);
        container.scrollTo({ top, behavior: "instant" });
      }
      container.classList.remove("rf-nav-jump");
      if (wrapper) {
        wrapper.style.opacity = "";
        wrapper.classList.add("rf-chapter-snap");
        window.setTimeout(() => wrapper.classList.remove("rf-chapter-snap"), 250);
      }
    });
  }, []);

  // Reset the active-chapter pointer whenever the doc changes.
  useEffect(() => { setCurrentSectionIdx(0); }, [docSections]);

  // When the chapter dropdown opens, scroll the active chapter into view.
  // rAF defers to the next frame so Radix has time to portal + mount the
  // Content + items before scrollIntoView runs. Block:center anchors the
  // active row near the middle of the dropdown's scroll viewport.
  useEffect(() => {
    if (!showChapterNav) return;
    const raf = requestAnimationFrame(() => {
      activeChapterRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
    });
    return () => cancelAnimationFrame(raf);
  }, [showChapterNav]);

  // Scroll watcher: keep the dropdown label in sync with whatever section
  // the user has scrolled to. RAF-throttled — at most one update per frame.
  // The active section is the topmost one whose top has scrolled at or above
  // an 80px gutter line below the toolbar.
  useEffect(() => {
    const container = readerRef.current;
    if (!container || !hasSections || !docSections?.length) return;
    let raf = null;
    const update = () => {
      raf = null;
      const cr = container.getBoundingClientRect();
      const gutter = 80;
      let active = 0;
      for (let i = 0; i < docSections.length; i++) {
        const el = sectionRefs.current[i];
        if (!el) continue;
        const top = el.getBoundingClientRect().top - cr.top;
        if (top <= gutter) active = i;
        else break;
      }
      setCurrentSectionIdx(prev => prev === active ? prev : active);
    };
    const onScroll = () => { if (raf == null) raf = requestAnimationFrame(update); };
    container.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [hasSections, docSections]);

  // Restore the user's last chapter when a doc loads. Lands at the
  // CHAPTER TITLE (titleRefs + TOP_GUTTER) — same as a chapter-dropdown
  // jump — not at the saved scrollOffset. Rationale: when the user opens
  // a doc they were reading, they want to see the chapter heading so
  // they know where they are. The in-chapter offset that we still save
  // would put them past the title (mid-paragraph), which loses
  // orientation. Same hide → fonts → settle → reveal pipeline as before.
  useEffect(() => {
    if (!docSections || !hasSections || !currentDocId) return;
    const container = readerRef.current;
    const wrapper = docWrapperRef.current;
    if (!container) return;
    let cancelled = false;
    (async () => {
      // Library books store position in Supabase (library_reads.position) so
      // it syncs across devices. Uploads stay on localStorage by design —
      // per-device per-doc, never leaves the browser.
      let pos = null;
      if (currentDocSource === "library" && user?.id) {
        try {
          const row = await cloudLoadLibraryPosition(user.id, currentDocId);
          pos = row?.position ?? null;
        } catch (err) {
          // Server reachable but returned an error (RLS, network). Fall
          // back to top-of-book and surface the error in the console;
          // we don't toast here to avoid blocking the reader.
          console.warn("[App] cloudLoadLibraryPosition failed; starting from top:", err.message);
          return;
        }
      } else {
        const stored = await storageGet(`pos:${currentDocId}`);
        if (cancelled || !stored) return;
        try {
          pos = JSON.parse(stored);
        } catch (err) {
          // Corrupt scroll-position key would loop on every open. Log + clear.
          console.warn(`[App] corrupt scroll position for doc ${currentDocId}; clearing:`, err.message);
          storageDel(`pos:${currentDocId}`);
          return;
        }
      }
      if (cancelled || !pos) return;
      const sectionIdx = Number(pos?.sectionIdx) || 0;
      // Section 0 is the default starting position — nothing to restore.
      if (sectionIdx === 0) return;

      if (wrapper) {
        wrapper.classList.remove("rf-chapter-reveal");
        wrapper.style.opacity = "0";
        void wrapper.offsetHeight;
      }

      if (document.fonts?.ready) {
        try { await document.fonts.ready; } catch {}
      }
      if (cancelled) { if (wrapper) wrapper.style.opacity = ""; return; }

      container.classList.add("rf-nav-jump");
      void container.offsetHeight;

      const TOP_GUTTER = 8;
      const computeTarget = () => {
        const target = titleRefs.current[sectionIdx] ?? sectionRefs.current[sectionIdx];
        if (!target) return null;
        const tr = target.getBoundingClientRect();
        const cr = container.getBoundingClientRect();
        return Math.max(0, tr.top - cr.top + container.scrollTop - TOP_GUTTER);
      };

      const first = computeTarget();
      if (first != null) container.scrollTo({ top: first, behavior: "instant" });

      let stableFrames = 0;
      let passes = 0;
      const MAX_PASSES = 30;
      const REQUIRED_STABLE = 3;
      const finish = () => {
        container.classList.remove("rf-nav-jump");
        setCurrentSectionIdx(sectionIdx);
        if (wrapper) {
          wrapper.style.opacity = "";
          wrapper.classList.add("rf-chapter-reveal");
          window.setTimeout(() => wrapper.classList.remove("rf-chapter-reveal"), 1100);
        }
      };
      const settle = () => {
        if (cancelled) { container.classList.remove("rf-nav-jump"); if (wrapper) wrapper.style.opacity = ""; return; }
        passes++;
        const corrected = computeTarget();
        if (corrected != null && Math.abs(corrected - container.scrollTop) > 1) {
          container.scrollTo({ top: corrected, behavior: "instant" });
          stableFrames = 0;
        } else {
          stableFrames++;
        }
        if (stableFrames >= REQUIRED_STABLE || passes >= MAX_PASSES) finish();
        else requestAnimationFrame(settle);
      };
      requestAnimationFrame(settle);
    })();
    return () => { cancelled = true; };
  }, [docSections, hasSections, currentDocId, currentDocSource, user]);

  // Save reading position on scroll, debounced. Computes sectionIdx +
  // pixel offset within that section from the container's scroll state
  // (no dependency on currentSectionIdx, which churns every RAF).
  //
  // Storage layer is source-aware: uploads write to localStorage (per-device,
  // never leaves the browser); library books write to Supabase library_reads
  // so positions sync across devices.
  useEffect(() => {
    if (!docSections || !hasSections || !currentDocId) return;
    const container = readerRef.current;
    if (!container) return;
    let saveTimer = null;
    const savePosition = () => {
      const cr = container.getBoundingClientRect();
      let sectionIdx = 0;
      let scrollOffset = 0;
      for (let i = 0; i < docSections.length; i++) {
        const el = sectionRefs.current[i];
        if (!el) continue;
        const top = el.getBoundingClientRect().top - cr.top;
        if (top <= 0) {
          sectionIdx = i;
          scrollOffset = -top;
        } else break;
      }
      const position = { sectionIdx, scrollOffset: Math.round(scrollOffset), savedAt: Date.now() };
      if (currentDocSource === "library" && user?.id) {
        cloudSaveLibraryPosition(user.id, currentDocId, position).catch(err => {
          console.warn("[position] library save failed:", err.message);
        });
      } else {
        storageSet(`pos:${currentDocId}`, JSON.stringify(position));
      }
    };
    const onScroll = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(savePosition, 600);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (saveTimer) { clearTimeout(saveTimer); savePosition(); }
    };
  }, [docSections, hasSections, currentDocId, currentDocSource, user]);

  const attemptUpload = useCallback((file) => {
    if (!file) return;
    if (!user) { setShowAuth(true); return; }
    // Lockout users skip the "X free uploads used" paywall (it'd be a lie)
    // and go straight to the pricing modal — only path forward is subscribe.
    if (sub.isLockedOut) { setShowPricing(true); return; }
    if (!sub.canUpload) { setShowPaywall(true); return; }
    // Pre-check file size against the server-derived per-tier ceiling.
    // The storage trigger enforces this too; this is the friendly UX gate
    // so the user doesn't watch a parse spinner before getting rejected.
    if (file.size > sub.maxFileSize) {
      const limitMb = Math.round(sub.maxFileSize / 1048576);
      const proHint = sub.isPro ? "" : " — upgrade to Pro for 50MB.";
      showToast(`This file is too large (${(file.size / 1048576).toFixed(1)}MB). Max ${limitMb}MB${proHint}`, "error", 7000);
      return;
    }
    doUpload(file);
  }, [user, sub.canUpload, sub.isLockedOut, sub.maxFileSize, sub.isPro, showToast]);

  // doUpload is the parser dispatcher. Each branch must produce Section[]
  // per docs/architecture/PARSER_CONTRACT.md (see §4 for the dispatch
  // protocol — fullText is joined from sections for the empty-content
  // guard, then setDocSections feeds the renderer).
  const doUpload = useCallback(async (file) => {
    setLoading(true); setLoadMsg("Reading file…");
    setConfidence(null); // reset whenever a new upload begins
    setChapterOverrides(null);
    let sections;
    const rawExt = file.name.split(".").pop().toLowerCase();
    let ext = rawExt;
    try {
      // Guard: reject anything outside the supported allowlist. Without this,
      // an image (.jpg/.png) or audio file falls through to the plain-text
      // branch and `.text()` decodes its binary bytes as UTF-8 garbage —
      // user sees a screen of gibberish instead of a clear error.
      if (!SUPPORTED_EXTS.has(rawExt)) {
        throw new Error(`TailorMyText doesn't support .${rawExt} files. Try a PDF, EPUB, DOCX, or text file (TXT, MD, JSON).`);
      }
      // Phase 2 sniff: route by content when the extension is wrong (a
      // .txt that's actually HTML, a renamed binary, etc.). Sniffer is
      // pure inspection of the file head; it never overrides a known
      // binary extension. Falls back to the user's extension on null.
      const sniffBuf = await file.arrayBuffer();
      const sniffed = await sniffDocumentType(file.name, sniffBuf);
      if (sniffed && sniffed !== rawExt) {
        console.warn(`[doUpload] sniffer routed .${rawExt} → .${sniffed} based on content`);
        ext = sniffed;
      }
      if (ext === "pdf") { setLoadMsg("Loading PDF engine…"); sections = await parsePDF(file); }
      else if (ext === "epub") { setLoadMsg("Unpacking EPUB…"); sections = await parseEPUB(file); }
      else if (ext === "docx") { setLoadMsg("Extracting DOCX…"); sections = await parseDOCX(file); }
      else if (ext === "html" || ext === "htm") { setLoadMsg("Parsing HTML…"); sections = parseHTMLStructured(await file.text()); }
      // MD + plain-text branches dispatch through the parser worker so even
      // a huge text file doesn't stall the loader animation. HTML stays on
      // main thread for now (uses DOMParser; not worker-safe without a
      // polyfill — Phase 3 territory if we want it moved).
      else if (ext === "md") { setLoadMsg("Parsing Markdown…"); sections = await parseInWorker("parse-md", await file.text()); }
      else { sections = await parseInWorker("parse-text", await file.text()); }
      // Normalize the parser result shape (Task D2):
      // - Binary parsers (PDF, EPUB, DOCX) return Section[] directly.
      // - Text parsers (HTML, MD, TXT) return { sections, confidence }.
      //   parseInWorker passes the worker postMessage payload through unchanged.
      const parserResult = sections;
      const normalizedSections = Array.isArray(parserResult) ? parserResult : parserResult.sections;
      const confidence = Array.isArray(parserResult) ? undefined : parserResult.confidence;
      sections = normalizedSections;
      // Derive the legacy depthFallback boolean from confidence.reasons so the
      // parse_outcomes telemetry row schema is unchanged (no ALTER TABLE needed).
      const depthFallback = confidence?.reasons?.includes("no_repeating_depth") ?? false;
      // Fire-and-forget telemetry — never block the UI render path on a DB insert.
      void trackParseOutcome({
        format: ext === "htm" ? "html" : ext,
        depthFallback,
        sectionCount: sections.length,
        docByteSize: file?.size ?? null,
        ext: file?.name?.split(".").pop()?.toLowerCase() ?? null,
      });
      const fullText = sections.map(s => [s.title, s.content].filter(Boolean).join("\n\n")).join("\n\n");
      // Empty-content guard: if the parser returned no readable text, the
      // file is most likely image-only (scanned PDF without OCR), encrypted,
      // or genuinely empty (e.g. an audio file mis-extension'd as .txt).
      // Fail before recording an upload or showing a blank reader.
      if (!fullText.trim()) {
        throw new Error("This file doesn't contain any readable text. It might be image-based, encrypted, or empty.");
      }
      setText(fullText); setDocSections(sections); setFileName(file.name);
      setCurrentDocSource("upload");
      // Hoist confidence to App state so the UncertaintyBadge can render.
      // Binary parsers leave `confidence` undefined; text parsers provide it.
      setConfidence(confidence ?? null);
      setReaderOpen(true);
    } catch (e) {
      // Map raw parser exceptions to user-friendly per-format messages.
      // The original exception is still in console for debugging.
      console.error(`[doUpload] ${ext} parser threw:`, e);
      const friendly = mapParserErrorToMessage(ext, e);
      showToast(friendly, "error", 7000);
      setLoading(false); setLoadMsg("");
      return;
    }
    // Save to recents separately so a quota/storage failure leaves the
    // freshly-parsed doc visible instead of being replaced by an error message.
    // recordUpload only fires after successful storage save so a Free user's
    // monthly quota isn't burned by a storage outage.
    const wasFirstUpload = recentDocs.recentList.length === 0;
    try {
      const saved = await recentDocs.saveDoc(file.name, sections, sections.map(s => [s.title, s.content].filter(Boolean).join("\n\n")).join("\n\n"));
      if (saved?.id) setCurrentDocId(saved.id);
      await sub.recordUpload();
      if (wasFirstUpload) track("first_upload");
    }
    catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("File too large")) {
        showToast(msg, "error", 7000);
      } else {
        showToast("Couldn't save to your library: " + msg, "error");
      }
    }
    finally { setLoading(false); setLoadMsg(""); }
  }, [sub, recentDocs, showToast]);

  // Cosmetic-gate helper: for Pro-only themes/palettes/guide-colors, free
  // users get the PricingModal instead of the change being applied.
  // adminBypass + Pro pass through.
  const gateCosmetic = useCallback((isFreeItem, applyFn) => {
    if (sub.isPro || isFreeItem) { applyFn(); return; }
    setShowPricing(true);
  }, [sub.isPro]);

  // Stable landing-page theme dot selector (Perf H3). Memo'd ThemeDot
  // requires a stable onSelect ref or the memo never hits. Declared AFTER
  // gateCosmetic — earlier placement caused a TDZ ReferenceError at runtime
  // (const binding in a dep array is read when useCallback evaluates).
  const onSelectTheme = useCallback((themeKey, e) => {
    const free = isThemeFree(themeKey);
    gateCosmetic(free, () => runThemeTransition(e, () => setTheme(themeKey)));
  }, [gateCosmetic]);

  // Open a library book by id. Shared by:
  //   - LibrarySection card clicks (fresh first open, passes the full book)
  //   - Bookshelf clicks / Recent Docs entries with source='library' (re-opens)
  //
  // cloudOpenLibraryBook handles the tier gate server-side. If gated, surface
  // the PricingModal (free user trying to open a Pro title); otherwise feed
  // the returned EPUB blob to the existing parseEPUB pipeline.
  const openLibraryBook = useCallback(async (bookOrId) => {
    if (!user?.id) { setShowAuth(true); return; }
    const bookId = typeof bookOrId === "string" ? bookOrId : bookOrId?.id;
    if (!bookId) return;
    setConfidence(null);
    setChapterOverrides(null);
    setLoading(true); setLoadMsg("Fetching from the library…");
    try {
      const result = await cloudOpenLibraryBook(user.id, bookId, sub.isPro);
      if (!result) {
        showToast("That book isn't available right now.", "error");
        return;
      }
      if (result.gated) {
        // Free user opened a Pro-only book — point them at the upgrade flow
        // instead of the parser. Keep the landing visible (no doc state change).
        setShowPricing(true);
        return;
      }
      const { blob, book, mirrorError } = result;
      if (mirrorError) {
        showToast("Your bookshelf may not refresh until you reload.", "warning", 5000);
      }
      setLoadMsg("Unpacking EPUB…");
      const sections = await parseEPUB(blob);
      const fullText = sections.map(s => [s.title, s.content].filter(Boolean).join("\n\n")).join("\n\n");
      if (!fullText.trim()) {
        throw new Error("This book doesn't contain readable text.");
      }
      setText(fullText);
      setDocSections(sections);
      setFileName(book.title);
      setCurrentDocId(book.id);
      setCurrentDocSource("library");
      setReaderOpen(true);
      // Refresh both lists so the freshly-opened book appears on the
      // bookshelf without waiting for the next mount.
      recentDocs.refreshLists();
    } catch (e) {
      console.error("[openLibraryBook] failed:", e);
      showToast(e.message || "Couldn't open that book.", "error", 7000);
    } finally {
      setLoading(false); setLoadMsg("");
    }
  }, [user, sub.isPro, recentDocs, showToast]);

  const loadRecentDoc = useCallback(async (entry) => {
    // Library entries route through cloudOpenLibraryBook so the EPUB blob
    // is re-fetched from the shared library bucket and the saved position
    // is restored. Uploads continue through the per-user documents bucket.
    if (entry?.source === "library" && entry?.book_id) {
      return openLibraryBook(entry.book_id);
    }
    setConfidence(null);
    setChapterOverrides(null);
    setLoading(true); setLoadMsg("Loading saved document…");
    try {
      const data = await recentDocs.loadDoc(entry);
      if (data && !data.error) {
        setText(data.text); setDocSections(data.sections); setFileName(data.name);
        setCurrentDocId(entry.id);
        setCurrentDocSource("upload");
        setChapterOverrides(data.chapterOverrides ?? null);
        setReaderOpen(true);
      } else if (data?.error === "corrupted") {
        setText("This document file is damaged and can't be opened. Please re-upload the original.");
        setDocSections(null); setFileName(data.name || entry.name); setCurrentDocId(null);
        setCurrentDocSource(null);
      } else {
        setText("Document no longer available. Try uploading it again.");
        setDocSections(null); setFileName(entry.name); setCurrentDocId(null);
        setCurrentDocSource(null);
      }
    } catch (err) {
      console.warn("[App] loadRecentDoc threw:", err);
      // Network failures from fetch/Supabase typically surface as TypeError
      // with "fetch failed" / "NetworkError" / "Failed to fetch". Anything
      // else falls through to the generic message.
      const msg = String(err?.message || "");
      if (/fetch|network/i.test(msg)) {
        setText("Couldn't reach the server to load this document. Check your connection and try again.");
      } else {
        setText("Error loading saved document.");
      }
      setDocSections(null); setCurrentDocId(null); setCurrentDocSource(null);
    }
    finally { setLoading(false); setLoadMsg(""); }
  }, [recentDocs, openLibraryBook]);

  const onDrop = useCallback((e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer?.files?.[0]) attemptUpload(e.dataTransfer.files[0]); }, [attemptUpload]);
  // Phase 8c — gate the checkout flow on a verified email. Supabase populates
  // user.email_confirmed_at when the user clicks the confirmation link sent
  // at signup. OAuth users (Google) are pre-verified by the provider, so they
  // pass this check immediately. Email/password signups must verify first.
  const handleSelectPlan = useCallback((billing) => {
    if (user && !user.email_confirmed_at) {
      showToast("Please verify your email before subscribing. Check your inbox for the verification link we sent at signup.", "error", 7000);
      setShowPricing(false);
      return;
    }
    setShowPricing(false);
    setCheckoutBilling(billing);
    setShowCheckout(true);
    track("checkout_started", { billing });
  }, [user, showToast]);
  // Open Stripe's hosted Customer Portal in the same tab. The function only
  // returns a URL if the user has a stripe_customer_id; we gate the menu
  // item on sub.hasStripeHistory so only past/current subscribers see it.
  const handleShowPaymentReceipts = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-portal-session`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ returnUrl: window.location.origin }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't open portal");
      window.location.href = json.url;
    } catch (err) {
      showToast(err.message, "error");
    }
  }, [showToast]);

  // Stripe Checkout return: read ?checkout=success or ?checkout=cancel set
  // by create-checkout-session, surface a toast, then clean the URL so a
  // refresh doesn't re-fire the toast. Subscription state itself is driven
  // by the realtime listener in useSubscription — no fetch needed here.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    if (!status) return;
    if (status === "success") {
      showToast("Welcome to Pro! Your trial has started.", "success");
    } else if (status === "cancel") {
      showToast("Checkout canceled.", "info");
    }
    params.delete("checkout");
    params.delete("session_id");
    const search = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (search ? `?${search}` : ""));
  }, [showToast]);

  // ── Modals ──
  // Wrapped in Suspense because each modal is React.lazy. Fallback is null
  // (no spinner) so the brief chunk fetch on first open isn't visually
  // jarring — modals already have their own enter animation that masks it.
  const modals = (
    <Suspense fallback={null}>
      {showPricing && <PricingModal onClose={() => setShowPricing(false)} onSelectPlan={handleSelectPlan} hasUsedTrial={sub.isTrial || sub.plan === "pro"} t={t} />}
      {showCheckout && <CheckoutModal billing={checkoutBilling} onClose={() => setShowCheckout(false)} t={t} />}
      {showPaywall && <PaywallModal uploadsUsed={sub.uploadsUsed} onUpgrade={() => { setShowPaywall(false); setShowPricing(true); }} onClose={() => setShowPaywall(false)} t={t} />}
      {showAuth && <AuthModal onClose={() => { setShowAuth(false); clearRecovery?.(); }} t={t} initialView={isRecovering ? "setPassword" : "login"} />}
      {/* AvatarSettingsModal stays mounted so Radix Dialog can run its proper
          open→close lifecycle. Force-unmounting via `{show && ...}` (the pattern
          we use for the others) leaks body styles like pointer-events:none on
          rapid open/close cycles, which froze the page after the second avatar
          pick. Controlled `open` lets Radix clean up cleanly each cycle. */}
      <AvatarSettingsModal open={showAvatarSettings} onOpenChange={setShowAvatarSettings} onSave={saveAvatar} currentAvatar={avatar} isPro={sub.isPro} onShowPricing={() => setShowPricing(true)} t={t} />
      {showSubscription && <SubscriptionModal open={showSubscription} onOpenChange={setShowSubscription} sub={sub} onShowPricing={() => setShowPricing(true)} t={t} />}
      {showDeleteAccount && <DeleteAccountModal open={showDeleteAccount} onOpenChange={setShowDeleteAccount} sub={sub} t={t} />}
      {showLibraryDrawer && <LibraryDrawer open={showLibraryDrawer} onOpenChange={setShowLibraryDrawer} books={library.books} isPro={sub.isPro} onOpen={openLibraryBook} t={t} />}
      {editChaptersOpen && (
        <EditChaptersModal
          open={editChaptersOpen}
          onClose={() => setEditChaptersOpen(false)}
          t={t}
          userId={user?.id}
          docId={currentDocId}
          docSections={docSections}
          initialBreaks={chapterOverrides?.breaks ?? null}
          initialTitles={chapterOverrides?.titles ?? null}
          onSaved={(next) => {
            setChapterOverrides(next);
            // useRecentDocs caches chapter_overrides from the SELECT; without
            // this refresh, closing + reopening the doc from Recent before
            // the next mount would re-read the stale entry and lose the save.
            recentDocs.refreshLists?.();
          }}
        />
      )}
    </Suspense>
  );

  // ═══════════════════════════════════════════
  // LOADING STATE
  // ═══════════════════════════════════════════
  if (!sub.loaded) return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><BookLoader size={160} t={t} style={{ marginBottom: 14 }} /><p style={{ fontSize: 14, color: t.fgSoft }}>Loading TailorMyText…</p></div>
    </div>
  );

  // Parse-loader overlay. Mounted whenever `loaderShown` is true, opacity
  // animated via `loaderOpaque`. Position fixed so it covers whatever route
  // is rendered underneath (landing during an upload; reader when loading a
  // saved doc). pointer-events follows opacity so a fading-out overlay
  // doesn't swallow clicks meant for the reader underneath.
  const loaderOverlay = loaderShown && (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: t.bg,
        color: t.fg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
        opacity: loaderOpaque ? 1 : 0,
        transition: "opacity 300ms ease",
        pointerEvents: loaderOpaque ? "auto" : "none",
      }}
    >
      <BookLoader size={220} t={t} style={{ marginBottom: 20 }} />
      <p style={{ fontSize: 16, fontWeight: 620, color: t.fg, marginBottom: 4 }}>{loadMsg}</p>
      <p style={{ fontSize: 13, color: t.fgSoft }}>This may take a moment for large files</p>
    </div>
  );

  // ═══════════════════════════════════════════
  // LANDING PAGE
  // ═══════════════════════════════════════════
  // Landing is gated by `!text && !readerOpen` so the reader chrome stays
  // mounted after the user closes a doc with the sidebar X — the reader's
  // empty-state prompt takes over instead of bouncing back to the landing.
  // Only the explicit "TailorMyText" back-button in the reader's top bar
  // clears readerOpen and returns here. During a file upload, the landing
  // stays mounted while the loader overlay covers it; when parse completes,
  // readerOpen flips true, the landing unmounts, and the reader mounts; the
  // overlay then fades out over the freshly-painted reader.
  if (!text && !readerOpen) return (
    <>
    <div
      className="tmt-marketing"
      style={{
        // marketingThemeVars(t) maps active theme tokens to the
        // .tmt-marketing custom properties so the editorial design
        // adapts to the active theme. Typography stays Fraunces/
        // Newsreader/Plex Mono; only colors flow from `t`.
        // Modals (Radix Portal → body) don't inherit this scope but
        // they spread the same helper on their own wrappers.
        ...marketingThemeVars(t),
        minHeight: "100vh",
        background: t.bg,
        color: t.fg,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
        position: "relative",
      }}
    >
      {/* Atmosphere — drifting blobs + paper grain. Fixed-position so they
          sit behind every section on the landing without affecting flow. */}
      <div className="tmt-blobs" aria-hidden="true">
        <div className="tmt-blob b1" />
        <div className="tmt-blob b2" />
        <div className="tmt-blob b3" />
      </div>
      <div className="tmt-grain" aria-hidden="true" />
      {user && deletionEffectiveAt && <PendingDeletionBanner user={user} effectiveAt={deletionEffectiveAt} onReactivated={refreshDeletionStatus} t={t} />}
      {user && sub.isLockedOut && <PostDeletionLockoutBanner lockoutUntil={sub.lockoutUntil} onSubscribe={() => setShowPricing(true)} />}
      {modals}
      <div style={{ position: "fixed", top: 14, right: 16, zIndex: 100 }}>
        <UserMenu t={t} onShowAuth={() => setShowAuth(true)} onShowAvatarSettings={() => setShowAvatarSettings(true)} onShowSubscription={() => setShowSubscription(true)} onShowPaymentReceipts={handleShowPaymentReceipts} showPaymentReceipts={sub.hasStripeHistory} onShowDeleteAccount={() => setShowDeleteAccount(true)} avatar={avatar} themePersistEnabled={themePref.persistEnabled} onToggleThemePersist={onToggleThemePersist} mockFreeMode={sub.mockFreeMode} onToggleMockFreeMode={sub.toggleMockFreeMode} isProGrantActive={sub.isProGrantActive} />
      </div>

      {/* ═══════════════ EDITORIAL HERO — 2-column ═══════════════
          LEFT: eyebrow + Fraunces value-prop headline (DiaTextReveal
          preserved, re-fires on theme change via key={theme}) + Newsreader
          subhead + game-button CTAs + status pill + trust pills.
          RIGHT: drop zone reimagined as the editorial reading-panel card
          (drag-drop, click-to-browse, file input — all handlers preserved).
          .tmt-hero class handles the responsive grid (stacks <980px). */}
      <div className="tmt-hero" style={{ position: "relative", zIndex: 2 }}>

        {/* ─── LEFT COLUMN ─── */}
        <div style={{ paddingTop: 16 }}>
          <div style={{ marginBottom: 28 }}>
            <span className="tmt-eyebrow lead">A reading app, built for human eyes</span>
          </div>

          <h1
            className="tmt-display"
            style={{
              fontSize: "clamp(40px, 5.4vw, 76px)",
              fontWeight: 380,
              lineHeight: 1.02,
              letterSpacing: "-0.025em",
              marginBottom: 28,
            }}
          >
            {/* DiaTextReveal preserved verbatim — key={theme} re-fires the
                gradient sweep on theme change. Wrapping a serif heading in
                it is exactly what the component was designed for. */}
            <DiaTextReveal
              key={theme}
              text="Tailor every text to the reader you actually are."
              colors={getRevealColors(theme)}
              textColor={t.fg}
              duration={2}
            />
          </h1>

          <p style={{
            fontFamily: "var(--tmt-serif-body)",
            fontSize: 18,
            lineHeight: 1.55,
            color: "var(--tmt-ink-soft)",
            maxWidth: 480,
            marginBottom: 36,
          }}>
            PDF, EPUB, DOCX &mdash; adapted in a tap to the typography your eyes
            actually need. Built for dyslexia, low vision, ADHD, eye strain,
            and every reader in between.
          </p>

          {/* Status pill — preserved from original hero */}
          {(sub.isPro || sub.uploadsUsed > 0) && (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 999,
              background: "var(--tmt-paper-deep)",
              border: "1px solid var(--tmt-rule)",
              marginBottom: 24,
              fontFamily: "var(--tmt-mono)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "var(--tmt-ink-soft)",
            }}>
              {sub.isPro
                ? <><Crown size={12} style={{ color: "var(--tmt-terra)" }} /><span style={{ color: "var(--tmt-terra)" }}>{sub.isTrial ? `Pro Trial · ${sub.trialDaysLeft}d left` : "Pro Plan"}</span></>
                : <><FileText size={12} /> {sub.uploadsUsed}/3 free docs used</>}
              {!sub.isPro && (
                <button
                  onClick={() => setShowPricing(true)}
                  className="rf-btn-solid"
                  style={{
                    background: t.accent,
                    border: "none",
                    cursor: "pointer",
                    color: "#fff",
                    fontFamily: "var(--tmt-mono)",
                    fontSize: 10,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    padding: "5px 10px",
                    borderRadius: 6,
                    marginLeft: 6,
                  }}
                >
                  Upgrade
                </button>
              )}
            </div>
          )}

          {/* CTAs — primary triggers file picker, secondaries load demo / open pricing.
              All three use the rf-btn-solid game-button mechanic (raised ledge,
              hover lift, press-down). */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 28 }}>
            <button
              type="button"
              onClick={() => !loading && fileRef.current?.click()}
              className="rf-btn-solid tmt-btn"
            >
              Start reading free
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M13 5l7 7-7 7"/></svg>
            </button>
            <button
              type="button"
              onClick={() => { const { sections: s } = detectTextStructure(DEMO_TEXT); setText(DEMO_TEXT); setDocSections(s); setFileName("demo-article.txt"); setCurrentDocSource("upload"); setReaderOpen(true); setPanelOpen(false); }}
              className="rf-btn-solid tmt-btn ghost"
            >
              <FileText size={13} /> Try demo article
            </button>
            {!sub.isPro && (
              <button
                type="button"
                onClick={() => setShowPricing(true)}
                className="rf-btn-solid tmt-btn ghost"
              >
                <Crown size={13} /> See Pro plans
              </button>
            )}
          </div>

          {/* Trust pills — small editorial badges. Don't get the game-button
              mechanic (rf-static suppresses it) since they're informational. */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span className="tmt-pill">No card to start</span>
            <span className="tmt-pill">7-day private storage</span>
            <span className="tmt-pill">Accessibility-first</span>
          </div>
        </div>

        {/* ─── RIGHT COLUMN — drop zone as editorial reading panel ─── */}
        <div style={{ position: "relative", paddingTop: 16 }}>
          {/* Drop zone — sized to fill ~half the right column's height so it
              meets the flip card in the middle and visually balances the
              left column's editorial stack. Drag-drop + click handlers,
              file input — all preserved verbatim. */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !loading && fileRef.current?.click()}
            onMouseEnter={() => setHoverUpload(true)}
            onMouseLeave={() => setHoverUpload(false)}
            style={{
              position: "relative",
              background: "var(--tmt-paper-card)",
              border: dragging || hoverUpload ? `2px dashed ${t.accent}` : "1px solid var(--tmt-rule)",
              borderRadius: 28,
              padding: "92px 44px 100px",
              cursor: "pointer",
              textAlign: "center",
              transition: "transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease",
              transform: hoverUpload ? "translateY(-3px)" : "translateY(0)",
              boxShadow: hoverUpload
                ? `0 28px 70px -28px ${t.accent}55, 0 1px 0 rgba(255,255,255,0.6) inset`
                : "0 24px 60px -32px rgba(31, 24, 18, 0.35), 0 6px 16px -8px rgba(31, 24, 18, 0.18), 0 1px 0 rgba(255,255,255,0.6) inset",
            }}
          >
            {/* Editorial demo-corner badge — sits on the top edge of the card,
                signals "this is your live workspace." */}
            <span style={{
              position: "absolute",
              top: -14,
              left: 32,
              background: "var(--tmt-ink)",
              color: "var(--tmt-paper)",
              fontFamily: "var(--tmt-mono)",
              fontSize: 10.5,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              padding: "6px 14px",
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 4px 0 rgba(0,0,0,0.12)",
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: t.accent,
                boxShadow: `0 0 0 3px ${t.accent}33`,
              }} />
              Your reading panel
            </span>

            <Upload size={52} strokeWidth={1.6} style={{ color: hoverUpload || dragging ? t.accent : "var(--tmt-ink-muted)", marginBottom: 22, transition: "color 0.2s ease" }} />
            <p className="tmt-display" style={{ fontSize: 26, fontWeight: 420, color: "var(--tmt-ink)", marginBottom: 12, letterSpacing: "-0.015em" }}>
              Drop a file here, or click to browse
            </p>
            <p style={{ fontFamily: "var(--tmt-mono)", fontSize: 11, color: hoverUpload ? t.accent : "var(--tmt-ink-muted)", textTransform: "uppercase", letterSpacing: "0.16em", transition: "color 0.2s ease" }}>
              PDF · EPUB · DOCX · TXT · MD
            </p>
            <input
              ref={fileRef}
              type="file"
              accept={FILE_ACCEPT}
              style={{ display: "none" }}
              onChange={e => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) attemptUpload(f);
              }}
            />
          </div>

          {/* Auto-cycling feature flip card — Privacy + 5 feature highlights
              cycling on a 3D page-flip animation. Sized to roughly match
              the drop zone so the right column reads as two balanced
              stacked elements. Click the dots to jump. */}
          <HeroFeatureFlip />
        </div>
      </div>

      {/* ─── CONTINUE READING + YOUR BOOKSHELF — two parallel personal
          surfaces. Continue Reading lists uploads; Your Bookshelf lists
          library books the user has opened (the borrow-from-library
          metaphor — books that live on the shelf between reading sessions).
          Both are authed-only; anonymous visitors see neither. */}
      {user && (
        <div style={{ position: "relative", zIndex: 2, padding: "0 24px 36px", display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          <LandingRecentDocs recentList={recentDocs.recentList} onLoad={loadRecentDoc} isPro={sub.isPro} t={t} />
          <LandingBookshelf bookshelfList={recentDocs.bookshelfList} onOpen={loadRecentDoc} t={t} />
        </div>
      )}

      {/* ─── THEME PICKER — slim editorial row below the hero. Preserves
          the radial reveal animation (runThemeTransition uses the View
          Transitions API to wipe-reveal the new theme outward from the
          click point). The dots themselves still call setTheme via
          runThemeTransition exactly as before. Sits directly under
          Continue Reading so the typography-controls beat stays adjacent
          to the user's personal reading surfaces. */}
      <div style={{ position: "relative", zIndex: 2, padding: "0 24px 56px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <span className="tmt-label">Try a theme — the whole app follows</span>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(THEMES).map(([key, th]) => {
            const free = isThemeFree(key);
            const locked = !sub.isPro && !free;
            const label = `${key[0].toUpperCase()}${key.slice(1)}${locked ? " (Pro)" : ""}`;
            return (
              <Tip key={key} label={label} t={t} themeKey={key} side="top">
                <ThemeDot
                  themeKey={key}
                  accent={th.accent}
                  isActive={theme === key}
                  locked={locked}
                  fg={t.fg}
                  bg={t.bg}
                  onSelect={onSelectTheme}
                />
              </Tip>
            );
          })}
        </div>
      </div>

      {/* ─── CURATED LIBRARY — Project Gutenberg catalog. Authed-only;
          anonymous visitors get the marketing tease (added separately so
          signing in remains a "pleasant surprise"). Free users see the
          full catalog with Pro titles lock-pilled. Top rule + generous
          padding mirror the conditions-grid section divider below. */}
      {user && library.books.length > 0 && (
        <section style={{ position: "relative", zIndex: 2, padding: "100px 24px 60px", borderTop: `1px solid var(--tmt-rule)`, maxWidth: 1240, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <LibrarySection books={library.books} isPro={sub.isPro} onOpen={openLibraryBook} />
        </section>
      )}

      {/* ─── ANONYMOUS LIBRARY TEASE — same slot, different surface.
          Hints at the curated catalog (era-classified spines, no titles)
          and routes the visitor to AuthModal via "Get a library card."
          Sign-in surfaces the real Reading Room as a pleasant surprise. */}
      {!user && (
        <LibraryTeaseSection onSignUp={() => setShowAuth(true)} t={t} />
      )}

      {/* ═══════════════ MARKETING — CONDITIONS GRID ═══════════════
          Six editorial cards explaining who the product is for.
          Below-the-fold; doesn't interfere with the upload-first hero. */}
      <section style={{ position: "relative", zIndex: 2, padding: "100px 24px 60px", borderTop: `1px solid var(--tmt-rule)`, maxWidth: 1240, width: "100%", margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 60, alignItems: "end", marginBottom: 64 }}>
          <div>
            <div style={{ marginBottom: 14 }}>
              <span className="tmt-eyebrow sage">For the way you actually read</span>
            </div>
            <h2 className="tmt-display" style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 350 }}>
              One reader,<br /><em>countless</em> ways<br />of seeing.
            </h2>
          </div>
          <p style={{ fontFamily: "var(--tmt-serif-body)", fontSize: 18, lineHeight: 1.6, color: "var(--tmt-ink-soft)", maxWidth: 540 }}>
            Most reading apps were designed for one kind of eye. TailorMyText starts from the
            opposite premise: every reader brings a different visual system, attention shape,
            and energy budget &mdash; and the page should bend to meet them, not the other way round.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--tmt-rule)", border: "1px solid var(--tmt-rule)", borderRadius: "var(--tmt-radius)", overflow: "hidden" }}>
          {[
            { num: "i.",   name: "Dyslexia & reading fatigue", desc: "Wider letter spacing, tuned fonts, and reading-guide overlays that calm the line you're on without freezing the rest of the page.", tag: "Reading guide · spacing · fonts" },
            { num: "ii.",  name: "Low vision & aging eyes",    desc: "Step text up to magazine-poster scale without losing the document's structure. High-contrast and warm-paper themes, side by side.", tag: "Scale · contrast · sepia" },
            { num: "iii.", name: "ADHD & sensory overload",    desc: "A single line in focus, the rest gently dimmed. Section navigation that lets you skip without losing where you were.", tag: "Focus mode · sectioning" },
            { num: "iv.",  name: "Eye strain & long sessions", desc: "Night themes that stay warm enough to read by, line heights that let the page breathe, and zero animation noise once you're reading.", tag: "Night mode · airy spacing" },
            { num: "v.",   name: "Color sensitivity",          desc: "Six accessibility-oriented font families, eleven palettes, and tunable intensity — combine until the page genuinely disappears into the words.", tag: "Palettes · intensity" },
            { num: "vi.",  name: "Privacy as accessibility",   desc: "Documents you upload are auto-deleted seven days after you last opened them. Storage is per-account; nothing is shared, nothing trains a model.", tag: "7-day TTL · private bucket" },
          ].map((c) => (
            <div key={c.num} style={{ background: "var(--tmt-paper-card)", padding: "32px 28px 34px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontFamily: "var(--tmt-serif-display)", fontStyle: "italic", fontWeight: 300, fontSize: 30, color: "var(--tmt-terra)", lineHeight: 1, fontVariationSettings: '"opsz" 144, "SOFT" 100' }}>{c.num}</div>
              <div style={{ fontFamily: "var(--tmt-serif-display)", fontWeight: 450, fontSize: 21, letterSpacing: "-0.01em", color: "var(--tmt-ink)" }}>{c.name}</div>
              <p style={{ fontFamily: "var(--tmt-serif-body)", color: "var(--tmt-ink-soft)", fontSize: 15.5, lineHeight: 1.55 }}>{c.desc}</p>
              <div style={{ marginTop: "auto", fontFamily: "var(--tmt-mono)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--tmt-sage)", paddingTop: 16, borderTop: "1px dashed var(--tmt-rule)" }}>{c.tag}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════ MARKETING — PROMISE QUOTE ═══════════════ */}
      <section style={{ position: "relative", zIndex: 2, padding: "120px 24px 100px", textAlign: "center", maxWidth: 880, margin: "0 auto" }}>
        <p className="tmt-display" style={{ fontStyle: "italic", fontWeight: 320, fontSize: "clamp(28px, 4vw, 48px)", letterSpacing: "-0.015em", lineHeight: 1.15 }}>
          <span style={{ color: "var(--tmt-terra)" }}>&ldquo;</span>The page should bend to your eyes<br /><span style={{ whiteSpace: "nowrap" }}>&mdash; not your eyes to the page.<span style={{ color: "var(--tmt-terra)" }}>&rdquo;</span></span>
        </p>
        <div style={{ marginTop: 32, fontFamily: "var(--tmt-mono)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--tmt-ink-muted)" }}>
          &mdash; TailorMyText, in one sentence
        </div>
        <div style={{ marginTop: 48 }}>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="rf-btn-solid tmt-btn ink"
            style={{ fontFamily: "var(--tmt-mono)" }}
          >
            Start reading free
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 5l7 7-7 7" /></svg>
          </button>
        </div>
      </section>

      <Footer t={t} />
    </div>
    {loaderOverlay}
    </>
  );

  // ═══════════════════════════════════════════
  // READER VIEW
  // ═══════════════════════════════════════════
  return (
    <>
    <div style={{ height: "100vh", overflow: "hidden", background: t.bg, color: t.fg, fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column" }}>
      {user && deletionEffectiveAt && <PendingDeletionBanner user={user} effectiveAt={deletionEffectiveAt} onReactivated={refreshDeletionStatus} t={t} />}
      {user && sub.isLockedOut && <PostDeletionLockoutBanner lockoutUntil={sub.lockoutUntil} onSubscribe={() => setShowPricing(true)} />}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
      {modals}

      {/* ── SIDEBAR ── */}
      <div className="rf-no-select" style={{ width: panelOpen ? 296 : 0, minWidth: panelOpen ? 296 : 0, height: "100%", overflowY: "auto", overflowX: "hidden", borderRight: panelOpen ? `1px solid ${t.border}` : "none", background: t.bg, transition: "width 0.3s ease, min-width 0.3s ease" }}>
        {panelOpen && (
          <div style={{ width: 296 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 12px 0px" }}>
              {/* Back-to-home — explicit landing-page return, separate from
                  the Currently-Reading X (which only closes the current doc).
                  Editorial Fraunces italic on the label keeps it visually
                  distinct from the sans-serif sidebar chrome and signals it's
                  a navigation crossing into the marketing/landing surface. */}
              <Tip label="Back to home" t={t} side="bottom">
                <button
                  onClick={() => { setText(""); setDocSections(null); setFileName(""); setFocusPara(-1); setCurrentDocId(null); setCurrentDocSource(null); setReaderOpen(false); }}
                  aria-label="Back to home"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 34,
                    padding: "0 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "transparent",
                    color: t.fgSoft,
                    cursor: "pointer",
                    fontSize: 13,
                    fontFamily: "'Newsreader', Georgia, serif",
                    fontStyle: "italic",
                    lineHeight: 1,
                    letterSpacing: "0.005em",
                    boxSizing: "border-box",
                  }}
                  onMouseEnter={ev => { ev.currentTarget.style.color = t.fg; ev.currentTarget.style.background = t.surfaceHover; }}
                  onMouseLeave={ev => { ev.currentTarget.style.color = t.fgSoft; ev.currentTarget.style.background = "transparent"; }}
                >
                  <ArrowLeft size={14} strokeWidth={2} />
                  {/* Italic Newsreader's cap-height sits in the upper ~73% of
                      the line-box, so flex-centering the line-box leaves the
                      visible glyphs floating above the icon's visual center.
                      A 1.5px downward shift on JUST the text re-centers it
                      against the ArrowLeft (and, by extension, the X in the
                      close-panel button on the other end of the row). */}
                  <span style={{ display: "inline-block", transform: "translateY(1.5px)" }}>Back to home</span>
                </button>
              </Tip>
              <Tip label="Close panel" t={t} side="bottom">
                <button onClick={() => setPanelOpen(false)} style={{ width: 34, height: 34, borderRadius: 8, border: "none", background: "transparent", color: t.icon, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><PanelLeftClose size={16} strokeWidth={2} /></button>
              </Tip>
            </div>

            <div style={{ padding: "10px 0 2px" }}>
              <UploadBadge sub={sub} onUpgrade={() => setShowPricing(true)} onCancel={() => sub.cancelTrial()} t={t} />
              {/* DEV ONLY — admin role only */}
            </div>

            {text && (
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${t.borderSoft}` }}>
                <p style={{ fontSize: 10.5, fontWeight: 500, color: t.fgSoft, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 10px", padding: "0 2px" }}>Currently Reading</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.fgSoft }}>
                  <FileText size={13} style={{ color: t.accent, flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Newsreader', Georgia, serif", fontStyle: "italic", fontSize: 14, color: t.fg }}>{fileName}</span>
                  <button aria-label="Close document" title="Close — pick another from your shelf" onClick={() => { setText(""); setDocSections(null); setFileName(""); setFocusPara(-1); setCurrentDocId(null); setCurrentDocSource(null); /* keep readerOpen so user lands on the empty-state prompt, not the landing page */ }} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "transparent", color: t.icon, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={15} strokeWidth={2} /></button>
                </div>
              </div>
            )}

            <Section title="Enhancements" icon={Sparkles} t={t} open={false} active={neuroDiv || hueGuide || focusMode}>
              <Toggle on={neuroDiv} onChange={setNeuroDiv} label="NeuroDiv Anchoring" icon={Baseline} t={t} />
              {neuroDiv && <Slider value={neuroDivIntensity} min={0.2} max={0.7} step={0.01} onChange={v => { __tracePerf("neuroDivIntensity"); setNeuroDivIntensity(v); }} onLiveChange={liveWriters.neuroDivIntensity} label="Bold intensity" format={FMT_PCT_FROM_FRAC} t={t} />}
              <Toggle on={hueGuide} onChange={setHueGuide} label="HueGuide Tracking" icon={Palette} t={t} />
              {hueGuide && <div style={{ padding: "6px 12px", display: "flex", flexWrap: "wrap", gap: 6 }}>{Object.entries(PALETTES).map(([k, pal]) => {
                const free = isPaletteFree(k);
                const locked = !sub.isPro && !free;
                const tipLabel = `${pal.label}${pal.cvdSafe ? " · colorblind-safe" : ""}${locked ? " (Pro)" : ""}`;
                return (
                  <Tip key={k} label={tipLabel} t={t} side="top">
                    <button
                      onClick={() => gateCosmetic(free, () => { __tracePerf("huePalette"); setHuePalette(k); })}
                      aria-label={tipLabel}
                      aria-pressed={huePalette === k}
                      style={{ position: "relative", width: 42, height: 26, borderRadius: 8, overflow: "hidden", display: "flex", padding: 0, cursor: "pointer", border: huePalette === k ? `2px solid ${t.accent}` : `1px solid ${t.border}`, boxShadow: huePalette === k ? `0 0 0 2px ${t.accentSoft}` : "none", transition: "all 0.15s", opacity: locked ? 0.55 : 1 }}
                    >
                      {pal.colors.map((c, i) => <div key={i} style={{ flex: 1, background: c, height: "100%" }} />)}
                      {locked && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Lock size={11} style={{ color: "#fff", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }} /></span>}
                    </button>
                  </Tip>
                );
              })}</div>}
              {hueGuide && <Slider value={hueIntensity} min={0} max={1} step={0.01} onChange={v => { __tracePerf("hueIntensity"); setHueIntensity(v); }} onLiveChange={liveWriters.hueIntensity} label="Hue intensity" format={FMT_PCT_FROM_FRAC} t={t} />}
              <Toggle on={focusMode} onChange={v => { setFocusMode(v); if (!v) setFocusPara(-1); }} label="Focus Mode" icon={Focus} t={t} />
            </Section>

            <Section title="Reading Guide" icon={MousePointer2} t={t} open={false} active={guideMode !== "none"}>
              <div style={{ padding: "4px 12px" }}>
                <Segment options={[{ value: "none", label: "Off", icon: EyeOff }, { value: "highlight", label: "Highlight", icon: Highlighter }, { value: "underline", label: "Line", icon: UnderlineIcon }, { value: "dim", label: "Dim", icon: Eye }]} value={guideMode} onChange={v => { __tracePerf("guideMode"); setGuideMode(v); }} t={t} />
              </div>
              {guideMode === "dim" && <Slider value={guideDimOpacity} min={0.05} max={0.7} step={0.01} onChange={setGuideDimOpacity} label="Dim opacity" format={FMT_PCT_FROM_FRAC} t={t} />}
              {(guideMode === "highlight" || guideMode === "underline") && (
                <div style={{ padding: "10px 12px 4px" }}>
                  <span style={{ fontSize: 12, color: t.fgSoft, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", marginBottom: 8, display: "block" }}>Guide color</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {Object.entries(GUIDE_COLORS).map(([k, gc]) => {
                      const active = guideColor === k;
                      const dot = gc.dot || t.accent;
                      const free = isGuideColorFree(k);
                      const locked = !sub.isPro && !free;
                      return (
                        <button
                          key={k}
                          onClick={() => gateCosmetic(free, () => { __tracePerf("guideColor"); setGuideColor(k); })}
                          aria-label={`Guide color: ${gc.label}${locked ? " (Pro)" : ""}`}
                          aria-pressed={active}
                          title={`${gc.label}${locked ? " (Pro)" : ""}`}
                          style={{ width: 28, height: 28, borderRadius: 8, cursor: "pointer", border: active ? `2px solid ${dot}` : `1.5px solid ${t.border}`, background: k === "accent" ? `conic-gradient(from 0deg, ${t.accent}, ${t.accent}88, ${t.accent})` : (gc.highlight || dot), boxShadow: active ? `0 0 0 2px ${dot}33` : "none", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", opacity: locked ? 0.55 : 1 }}
                        >
                          {locked
                            ? <Lock size={11} style={{ color: "#fff", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }} />
                            : (active && <Check size={12} style={{ color: k === "accent" || k === "yellow" || k === "orange" ? "#333" : "#fff" }} />)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </Section>

            <Section title="Typography" icon={Type} t={t} open={false}>
              <FontPicker value={fontFamily} onChange={setFontFamily} t={t} />
              <Slider value={fontSize} min={12} max={36} step={1} onChange={setFontSize} onLiveChange={liveWriters.fontSize} label="Font size" format={FMT_PX} t={t} />
              <Slider value={lineHeight} min={1.0} max={3} step={0.05} onChange={setLineHeight} onLiveChange={liveWriters.lineHeight} label="Line height" format={FMT_LH} t={t} />
              <Slider value={letterSpacing} min={-1} max={5} step={0.1} onChange={setLetterSpacing} onLiveChange={liveWriters.letterSpacing} label="Letter spacing" format={FMT_FIXED1_PX} t={t} />
              <Slider value={wordSpacing} min={0} max={12} step={0.5} onChange={setWordSpacing} onLiveChange={liveWriters.wordSpacing} label="Word spacing" format={FMT_FIXED1_PX} t={t} />
              <Slider value={columnWidth} min={40} max={100} step={1} onChange={setColumnWidth} onLiveChange={liveWriters.columnWidth} label="Column width" format={FMT_PCT} t={t} />
              <div style={{ padding: "4px 12px 8px" }}>
                <span style={{ fontSize: 12, color: t.fgSoft, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", marginBottom: 6, display: "block" }}>Text alignment</span>
                <Segment options={[{ value: "left", label: "Left", icon: AlignLeft }, { value: "center", label: "Center", icon: AlignCenter }, { value: "right", label: "Right", icon: AlignRight }, { value: "justify", label: "Justify", icon: AlignJustify }]} value={textAlign} onChange={setTextAlign} t={t} />
              </div>
            </Section>

            <Section title="Theme" icon={Sun} t={t} open={false}>
              <div style={{ padding: "6px 12px 4px", display: "grid", gridTemplateColumns: "1fr 1fr", gridAutoFlow: "column", gridTemplateRows: "repeat(5, auto)", gap: 10 }}>
                {[...LIGHT_THEME_KEYS, ...DARK_THEME_KEYS].map(key => {
                  const th = THEMES[key];
                  const isActive = theme === key;
                  const isDark = DARK_THEME_KEYS.includes(key);
                  const free = isThemeFree(key);
                  const locked = !sub.isPro && !free;
                  return (
                    <button
                      key={key}
                      onClick={(e) => gateCosmetic(free, () => runThemeTransition(e, () => setTheme(key)))}
                      aria-label={`Theme: ${key}${locked ? " (Pro)" : ""}`}
                      aria-pressed={isActive}
                      className="rf-btn-icon-active"
                      style={{
                        padding: "9px 14px",
                        borderRadius: 10,
                        border: isActive ? `2px solid ${t.accent}` : "2px solid transparent",
                        backgroundColor: th.bg,
                        // Suppress the rf-btn-icon-active radial white highlight on dark tiles
                        // (it reads as a glaring shine on dark backgrounds). Light tiles keep it
                        // because there it adds a subtle paper-like sheen.
                        backgroundImage: isDark ? "none" : undefined,
                        color: th.fg,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        minHeight: 40,
                        fontFamily: "'DM Sans', sans-serif",
                        boxSizing: "border-box",
                        outline: "none",
                        transition: "transform 0.15s, box-shadow 0.15s, filter 0.15s, border-color 0.15s",
                        opacity: locked ? 0.55 : 1,
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: th.fg, textTransform: "capitalize", letterSpacing: "0.02em", textAlign: "left" }}>
                        {locked && <Lock size={11} style={{ color: th.fg }} />}
                        {key}
                      </span>
                      <span style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        background: th.accent,
                        flexShrink: 0,
                        border: isActive ? `2px solid ${th.fg}` : "2px solid transparent",
                        boxShadow: isActive ? `0 0 0 2px ${th.bg}` : "none",
                        boxSizing: "border-box",
                        transition: "border-color 0.15s, box-shadow 0.15s",
                      }} />
                    </button>
                  );
                })}
              </div>
            </Section>

            <div style={{ padding: "14px 14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => sub.canUpload ? fileRef.current?.click() : setShowPaywall(true)} className="rf-btn" style={{ width: "100%", padding: "10px 16px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.surface, color: t.fgSoft, cursor: "pointer", fontSize: 13, fontWeight: 560, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxSizing: "border-box" }}><Upload size={14} /> Upload new file</button>
              <input ref={fileRef} type="file" accept={FILE_ACCEPT} style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) attemptUpload(f); }} />
              {library.books.length > 0 && (
                <button
                  onClick={() => setShowLibraryDrawer(true)}
                  className="rf-btn"
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: "transparent",
                    color: t.fg,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 560,
                    fontFamily: "'DM Sans', sans-serif",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    boxSizing: "border-box",
                  }}
                >
                  <LibraryBig size={14} /> Browse the Library
                </button>
              )}
            </div>

            <SidebarRecentDocs recentList={recentDocs.recentList} fileName={fileName} onLoad={loadRecentDoc} onRemove={id => recentDocs.removeDoc(id)} isPro={sub.isPro} t={t} />
            <SidebarBookshelf bookshelfList={recentDocs.bookshelfList} fileName={fileName} onOpen={loadRecentDoc} onRemove={id => recentDocs.removeDoc(id)} t={t} />
          </div>
        )}
      </div>

      {/* ── READER ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%", overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 16px", borderBottom: `1px solid ${t.borderSoft}`, minHeight: 44, background: t.bg }}>
          {!panelOpen && (
            <Tip label="Open panel" t={t} side="bottom">
              <button onClick={() => setPanelOpen(true)} style={{ width: 34, height: 34, borderRadius: 8, border: "none", background: "transparent", color: t.icon, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><PanelLeft size={16} strokeWidth={2} /></button>
            </Tip>
          )}
          <button
            onClick={() => { setText(""); setDocSections(null); setFileName(""); setFocusPara(-1); setCurrentDocId(null); setCurrentDocSource(null); setReaderOpen(false); }}
            className="rf-static"
            title="Back to home"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontSize: 20, fontWeight: 620, color: t.fg, fontFamily: currentFont?.css ?? "'DM Sans', sans-serif", outline: "none", transition: "font-family 0.2s" }}
          >
            {/* key={fontFamily} forces remount on font change so the gradient
                sweep animation re-fires — a cute visual confirmation that the
                font swap took effect. */}
            <DiaTextReveal
              key={fontFamily}
              text="TailorMyText"
              colors={getRevealColors(theme)}
              textColor={t.fg}
              duration={1.5}
            />
          </button>
          <div style={{ flex: 1 }} />

          {sub.isPro && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 8, background: t.accentSoft, fontSize: 11, fontWeight: 620, color: t.accent, fontFamily: "'DM Sans', sans-serif" }}>
              {sub.isTrial
                ? <><Clock size={12} /> Trial — {sub.trialDaysLeft}d left</>
                : <><Crown size={12} /> Pro</>}
            </div>
          )}

          {/* Chapter navigator */}
          {hasSections && docSections.length > 1 && (
            <DropdownMenu.Root open={showChapterNav} onOpenChange={setShowChapterNav}>
              <DropdownMenu.Trigger asChild>
                <button className="rf-static" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: showChapterNav ? t.surface : "transparent", color: t.fg, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}>
                  <List size={14} style={{ color: t.icon }} />
                  {(() => {
                    const cur = docSections[currentSectionIdx] ?? docSections[0];
                    const isPage = cur?.type === "page";
                    const label = cur?.title || (isPage ? `Page ${cur?.number ?? currentSectionIdx + 1}` : `Chapter ${cur?.number ?? currentSectionIdx + 1}`);
                    return <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>;
                  })()}
                  <ChevronDown size={14} style={{ color: t.icon, transform: showChapterNav ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: "0 12px 36px rgba(0,0,0,0.18)", maxHeight: "60vh", overflowY: "auto", width: 220, zIndex: 999 }}
                >
                  <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${t.borderSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 650, color: t.fgSoft, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.05em", textTransform: "uppercase" }}>Table of Contents</span>
                    <span style={{ fontSize: 11, color: t.fgSoft, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", letterSpacing: "0.04em", flexShrink: 0 }}>{currentSectionIdx + 1} of {docSections.length}</span>
                  </div>
                  {docSections.map((sec, si) => (
                    <ChapterDropdownItem
                      key={si}
                      ref={si === currentSectionIdx ? activeChapterRef : null}
                      index={si}
                      label={sec.title || (sec.type === "page" ? `Page ${sec.number || si + 1}` : `Chapter ${sec.number || si + 1}`)}
                      active={si === currentSectionIdx}
                      isLast={si === docSections.length - 1}
                      theme={t}
                      onSelect={scrollToSection}
                    />
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}

          {/* Uncertainty badge — surfaces when text-parser confidence < 0.70.
              D6 will add the EditChaptersModal; for now editChaptersOpen is
              wired but unconsumed. */}
          <UncertaintyBadge
            score={confidence?.score}
            onClick={() => setEditChaptersOpen(true)}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Reader feature toggles. Tooltips use the short product name
               only; longer descriptions live in the sidebar Toggle labels +
               settings, so the reader chrome stays scannable on hover.
               aria-label mirrors the tip for screen readers, which never see
               the tooltip. */}
            <FeatureToggleButton on={neuroDiv} label="NeuroDiv" Icon={Baseline} accent={t.accent} iconColor={t.icon} onToggle={toggleNeuroDiv} t={t} />
            <FeatureToggleButton on={hueGuide} label="HueGuide" Icon={Palette} accent={t.accent} iconColor={t.icon} onToggle={toggleHueGuide} t={t} />
            <FeatureToggleButton on={focusMode} label="Focus" Icon={Focus} accent={t.accent} iconColor={t.icon} onToggle={toggleFocusMode} t={t} />
          </div>
          <UserMenu t={t} onShowAuth={() => setShowAuth(true)} onShowAvatarSettings={() => setShowAvatarSettings(true)} onShowSubscription={() => setShowSubscription(true)} onShowPaymentReceipts={handleShowPaymentReceipts} showPaymentReceipts={sub.hasStripeHistory} onShowDeleteAccount={() => setShowDeleteAccount(true)} avatar={avatar} themePersistEnabled={themePref.persistEnabled} onToggleThemePersist={onToggleThemePersist} mockFreeMode={sub.mockFreeMode} onToggleMockFreeMode={sub.toggleMockFreeMode} isProGrantActive={sub.isProGrantActive} />
        </div>

        {/* Reader scroll area */}
        <div ref={readerRef} className="rf-reader-scroll"
          onMouseMove={e => { guide.handleMouseMove(e, readerRef.current); if (!showGuide && guideMode !== "none") setShowGuide(true); }}
          onMouseLeave={() => { guide.handleMouseLeave(); setShowGuide(false); }}
          onScroll={() => guide.handleScroll()}
          style={{ flex: 1, overflowY: "auto", position: "relative", background: t.reader }}>
          {guide.renderOverlay(showGuide)}
          <ErrorBoundary
            t={t}
            title="Couldn't render this document"
            description="The reader hit an error displaying this file. It may be malformed or use unsupported markup. Try another document, or reset to clear the error."
            onReset={() => { setText(""); setDocSections(null); setFileName(""); setCurrentDocId(null); setCurrentDocSource(null); setReaderOpen(false); }}
          >
            {text ? (
              <DocumentBody
                text={text} docSections={displaySections} hasSections={hasSections}
                wrapperRef={handleDocWrapperRef} featureClassRef={handleFeatureClassRef}
                settings={settings} intensityRef={neuroDivIntensityRef} focusModeRef={focusModeRef}
                setFocusPara={setFocusPara} sectionRefs={sectionRefs} titleRefs={titleRefs}
              />
            ) : (
              <ReaderEmptyState
                t={t}
                hasLibrary={library.books.length > 0}
                hasBookshelf={recentDocs.bookshelfList.length > 0}
                onBrowseLibrary={() => setShowLibraryDrawer(true)}
                onUpload={() => sub.canUpload ? fileRef.current?.click() : setShowPaywall(true)}
                canUpload={true}
              />
            )}
          </ErrorBoundary>
        </div>
      </div>
      </div>
    </div>
    {loaderOverlay}
    </>
  );
}
