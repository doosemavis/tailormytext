import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { applyChapterOverrides, parsePDF, parseEPUB, parseDOCX, parseHTMLStructured, parseInWorker, sniffDocumentType } from "../utils";
import { track, trackParseOutcome } from "../utils/track";
import { cloudOpenLibraryBook } from "../utils/cloudDocs";

// File-picker `accept` attribute (HTML hint) and the strict allowlist
// doUpload validates against. Picker hint and runtime check stay in sync
// because both derive from the same source. The `accept` attribute alone
// can't be relied on — drag-and-drop and "show all files" both bypass it.
// Exported so App.jsx's hidden <input type="file"> picks the same set.
export const FILE_ACCEPT = ".pdf,.epub,.txt,.md,.docx,.json";
const SUPPORTED_EXTS = new Set(FILE_ACCEPT.split(",").map(s => s.replace(/^\./, "")));

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

// Document-state bucket extracted from App.jsx per Phases 1+2 of the
// state-colocation refactor (docs/architecture/STATE_COLOCATION_PLAN.md).
//
// Owns:
//   - The loaded document's text, sections, identity, and source.
//   - Reader-vs-landing visibility (`readerOpen`).
//   - Loader overlay timing — `loaderShown` / `loaderOpaque` are derived from
//     `loading` by an internal effect that enforces MIN_VISIBLE_MS so a fast
//     parse can't flash.
//   - The override-aware `displaySections` memo used by DocumentBody.
//   - Parser confidence + persisted chapter-break overrides.
//   - The 4 upload/load handlers (`attemptUpload`, `openLibraryBook`,
//     `loadRecentDoc`, plus the internal `doUpload` dispatcher) and the
//     signout-driven state reset.
//
// Inputs:
//   user, authLoading from useAuth.
//   sub from useSubscription — handlers read isPro/canUpload/isLockedOut/
//     maxFileSize and call recordUpload.
//   recentDocs from useRecentDocs — handlers call saveDoc/loadDoc/refreshLists
//     and read recentList.
//   showToast from useToast.
//   onGate ({ kind: 'auth' | 'pricing' | 'paywall' }) => void — unified
//     callback for opening the three modal gates handlers can trip into.
//     App routes the kind to its setShow* setters. Must be memoized with
//     stable identity (useCallback with empty deps); otherwise every App
//     render rebuilds every hook handler via the deps cascade.
//
// C3 will add a `closeDoc({ keepReaderOpen })` helper and narrow the setter
// surface accordingly.
export function useDocumentState({ user, authLoading, sub, recentDocs, showToast, onGate }) {
  // Currently-loaded document — text + parsed sections + identity.
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
  // bouncing the user back to the landing page.
  const [readerOpen, setReaderOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");

  // Loader overlay state. The raw `loading` boolean flips instantly; the overlay
  // fades in/out around it so a fast parse doesn't flash and a finishing parse
  // doesn't hard-cut to the reader before the reader has rendered underneath.
  //   - `loaderShown` controls whether the overlay is mounted at all.
  //   - `loaderOpaque` drives the CSS opacity transition (1 = covering, 0 = fading out).
  //   - `loaderStartedAt` enforces a minimum visible duration so fast parses
  //     don't flicker.
  const [loaderShown, setLoaderShown] = useState(false);
  const [loaderOpaque, setLoaderOpaque] = useState(false);
  const loaderStartedAt = useRef(null);

  // Parser confidence score for the currently-loaded text document.
  // Null for binary parsers (PDF, EPUB, DOCX) and library books.
  const [confidence, setConfidence] = useState(null);
  // Persisted chapter break overrides for the currently-loaded upload doc.
  // Set when cloudLoadDoc returns chapterOverrides; null for fresh uploads,
  // library books, and when the user hasn't saved overrides yet.
  const [chapterOverrides, setChapterOverrides] = useState(null);

  // Reset document state on signout. Bucket-C state (`focusPara`) is reset
  // by a sibling one-line effect in App.jsx — it belongs to the enhancement
  // bucket that Phase 2 of the refactor will own.
  useEffect(() => {
    if (!authLoading && !user) {
      setText("");
      setDocSections(null);
      setFileName("");
      setCurrentDocId(null);
      setCurrentDocSource(null);
      setReaderOpen(false);
      setConfidence(null);
      setChapterOverrides(null);
    }
  }, [user, authLoading]);

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

  // Override-aware sections for the renderer. docSections (raw parser output)
  // stays untouched so EditChaptersModal paragraph indices remain stable.
  const displaySections = useMemo(
    () => (docSections && chapterOverrides ? applyChapterOverrides(docSections, chapterOverrides) : docSections),
    [docSections, chapterOverrides],
  );

  // Tier + auth + file-size gates BEFORE we touch the parser. Signed-out users
  // and lockout users go straight to the relevant modal via onGate; quota
  // ceilings get a friendly toast (the storage trigger enforces ceilings
  // server-side too — this is just the UX gate to avoid spinner-then-reject).
  const attemptUpload = useCallback((file) => {
    if (!file) return;
    if (!user) { onGate({ kind: "auth" }); return; }
    if (sub.isLockedOut) { onGate({ kind: "pricing" }); return; }
    if (!sub.canUpload) { onGate({ kind: "paywall" }); return; }
    if (file.size > sub.maxFileSize) {
      const limitMb = Math.round(sub.maxFileSize / 1048576);
      const proHint = sub.isPro ? "" : " — upgrade to Pro for 50MB.";
      showToast(`This file is too large (${(file.size / 1048576).toFixed(1)}MB). Max ${limitMb}MB${proHint}`, "error", 7000);
      return;
    }
    doUpload(file);
    // doUpload is declared below; its identity is rebuilt when `sub` /
    // `recentDocs` rebuild, but it's read by name at call time (not in deps),
    // matching the pre-extraction behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sub.canUpload, sub.isLockedOut, sub.maxFileSize, sub.isPro, showToast, onGate]);

  // doUpload is the parser dispatcher. Each branch must produce Section[]
  // per docs/architecture/PARSER_CONTRACT.md (see §4 for the dispatch
  // protocol — fullText is joined from sections for the empty-content
  // guard, then setDocSections feeds the renderer).
  const doUpload = useCallback(async (file) => {
    setLoading(true); setLoadMsg("Reading file…");
    setConfidence(null);
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
      const confidenceFromParser = Array.isArray(parserResult) ? undefined : parserResult.confidence;
      sections = normalizedSections;
      // Derive the legacy depthFallback boolean from confidence.reasons so the
      // parse_outcomes telemetry row schema is unchanged (no ALTER TABLE needed).
      const depthFallback = confidenceFromParser?.reasons?.includes("no_repeating_depth") ?? false;
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
      setConfidence(confidenceFromParser ?? null);
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

  // Open a library book by id. Shared by:
  //   - LibrarySection card clicks (fresh first open, passes the full book)
  //   - Bookshelf clicks / Recent Docs entries with source='library' (re-opens)
  //
  // cloudOpenLibraryBook handles the tier gate server-side. If gated, surface
  // the PricingModal (free user trying to open a Pro title); otherwise feed
  // the returned EPUB blob to the existing parseEPUB pipeline.
  const openLibraryBook = useCallback(async (bookOrId) => {
    if (!user?.id) { onGate({ kind: "auth" }); return; }
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
        onGate({ kind: "pricing" });
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
  }, [user, sub.isPro, recentDocs, showToast, onGate]);

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

  return {
    // Read state
    text, docSections, displaySections, fileName,
    currentDocId, currentDocSource, readerOpen,
    loading, loadMsg, loaderShown, loaderOpaque,
    confidence, chapterOverrides,
    // Setters still needed by App's inline reset sites + EditChaptersModal +
    // ErrorBoundary onReset. C3 narrows further by introducing closeDoc.
    setText, setDocSections, setFileName,
    setCurrentDocId, setCurrentDocSource, setReaderOpen,
    setChapterOverrides,
    // Handlers
    attemptUpload, openLibraryBook, loadRecentDoc,
  };
}
