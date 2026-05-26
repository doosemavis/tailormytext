import { useState, useRef, useEffect, useMemo } from "react";
import { applyChapterOverrides } from "../utils";

// Document-state bucket extracted from App.jsx per Phase 1 of the
// state-colocation refactor (docs/architecture/STATE_COLOCATION_PLAN.md).
//
// Owns:
//   - The loaded document's text, sections, identity, and source.
//   - Reader-vs-landing visibility (`readerOpen`).
//   - Loader overlay timing — `loaderShown` / `loaderOpaque` are derived from
//     `loading` by an internal effect that enforces MIN_VISIBLE_MS so a fast
//     parse can't flash and a slow parse can fade in/out cleanly.
//   - The override-aware `displaySections` memo used by DocumentBody.
//   - Parser confidence + persisted chapter-break overrides for the current
//     upload doc (consumed by UncertaintyBadge + EditChaptersModal).
//
// C1 scope: scaffold only. All state, the loaderStartedAt ref, the loader
// fade effect, and the displaySections memo move here. Setters are exposed
// broadly so App.jsx's still-in-place handlers (attemptUpload, doUpload,
// openLibraryBook, loadRecentDoc) can keep writing to the state. C2 will
// move those handlers into the hook and narrow the setter surface; C3 adds
// the closeDoc() helper.
export function useDocumentState() {
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

  return {
    // Read state
    text, docSections, displaySections, fileName,
    currentDocId, currentDocSource, readerOpen,
    loading, loadMsg, loaderShown, loaderOpaque,
    confidence, chapterOverrides,
    // Setters — broadly exposed during C1 so App.jsx's still-in-place
    // handlers can keep writing. C2 narrows this surface when the handlers
    // move into the hook.
    setText, setDocSections, setFileName,
    setCurrentDocId, setCurrentDocSource, setReaderOpen,
    setLoading, setLoadMsg,
    setConfidence, setChapterOverrides,
  };
}
