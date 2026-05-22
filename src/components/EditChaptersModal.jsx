import React, { useState, useMemo, useCallback } from "react";
import { X, BookOpen, AlignLeft } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { cloudSaveChapterOverrides } from "../utils/cloudDocs";
import { marketingThemeVars } from "../utils/marketingTheme";

const OVERLAY = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  zIndex: 1010,
};

// Extract flat paragraphs from docSections. Each section contributes its
// content split on blank lines; section title is prepended if present.
// Returns [{ text, sectionIdx, isTitle }].
export function buildParagraphs(docSections) {
  if (!docSections?.length) return [];
  const paras = [];
  for (let si = 0; si < docSections.length; si++) {
    const sec = docSections[si];
    if (sec.title) {
      paras.push({ text: sec.title, sectionIdx: si, isTitle: true });
    }
    const chunks = (sec.content || "").split(/\n{2,}/);
    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (trimmed) {
        paras.push({ text: trimmed, sectionIdx: si, isTitle: false });
      }
    }
  }
  return paras;
}

// Derive initial breaks from docSections: each section boundary (except the
// first section) becomes a break at the first paragraph of that section.
export function deriveBreaksFromSections(paras, docSections) {
  if (!docSections?.length || !paras.length) return [];
  const breaks = [];
  let currentSection = paras[0]?.sectionIdx ?? 0;
  for (let i = 1; i < paras.length; i++) {
    const si = paras[i].sectionIdx;
    if (si !== currentSection) {
      breaks.push(i);
      currentSection = si;
    }
  }
  return breaks;
}

// Build the live chapter list from the current break set + title overrides.
export function buildChapters(paras, breaks, titles) {
  if (!paras.length) return [];
  const breakSet = new Set(breaks);
  const chapters = [];
  let current = [];
  let startIdx = 0;

  for (let i = 0; i < paras.length; i++) {
    if (i > 0 && breakSet.has(i)) {
      chapters.push({ startIdx, paras: current, titleOverride: titles[startIdx] });
      current = [paras[i]];
      startIdx = i;
    } else {
      current.push(paras[i]);
    }
  }
  if (current.length) {
    chapters.push({ startIdx, paras: current, titleOverride: titles[startIdx] });
  }
  return chapters;
}

export default function EditChaptersModal({
  open,
  onClose,
  t,
  userId,
  docId,
  docSections,
  initialBreaks,
  initialTitles,
  onSaved,
}) {
  // Build flat paragraph list once per open (docSections is stable per open).
  const paras = useMemo(() => buildParagraphs(docSections), [docSections]);

  // Compute initial breaks: prefer explicit initialBreaks (from chapterOverrides
  // on the loaded entry); fall back to deriving from the parsed section boundaries.
  const seedBreaks = useMemo(() => {
    if (initialBreaks?.length) return initialBreaks;
    return deriveBreaksFromSections(paras, docSections);
  }, [initialBreaks, paras, docSections]);

  const [breaks, setBreaks] = useState(() => new Set(seedBreaks));
  const [titles, setTitles] = useState(() => initialTitles ?? {});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Immutably toggle a break at paragraph index idx.
  const toggleBreak = useCallback((idx) => {
    setBreaks((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  // Update a chapter title override keyed by the paragraph start index.
  const setTitleAt = useCallback((startIdx, value) => {
    setTitles((prev) => ({ ...prev, [startIdx]: value }));
  }, []);

  const chapters = useMemo(
    () => buildChapters(paras, breaks, titles),
    [paras, breaks, titles],
  );

  const handleSave = async () => {
    if (!userId || !docId) {
      setSaveError("No document loaded.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const sortedBreaks = [...breaks].sort((a, b) => a - b);
      await cloudSaveChapterOverrides(userId, docId, {
        breaks: sortedBreaks,
        titles,
      });
      onSaved?.();
      onClose();
    } catch (e) {
      console.error("[EditChaptersModal] save failed:", e);
      setSaveError(e.message || "Save failed. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (next) => {
    if (!next) onClose();
  };

  const paraCount = paras.length;
  const chapterCount = chapters.length;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={OVERLAY} />
        <Dialog.Content
          aria-describedby="edit-chapters-desc"
          className="tmt-marketing"
          style={{
            ...marketingThemeVars(t),
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "var(--tmt-paper)",
            borderRadius: 22,
            width: "min(960px, calc(100vw - 48px))",
            maxHeight: "calc(100vh - 64px)",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 28px 70px rgba(0,0,0,0.28)",
            zIndex: 1011,
            outline: "none",
            fontFamily: "var(--tmt-sans)",
            overflow: "hidden",
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              padding: "28px 28px 18px",
              borderBottom: `1px solid ${t.borderSoft}`,
              gap: 12,
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1 }}>
              <span
                className="tmt-label"
                style={{ display: "block", marginBottom: 6 }}
              >
                Chapter detection
              </span>
              <Dialog.Title
                className="tmt-display"
                style={{
                  fontSize: 24,
                  fontWeight: 380,
                  color: "var(--tmt-ink)",
                  margin: 0,
                  letterSpacing: "-0.015em",
                  lineHeight: 1.2,
                }}
              >
                Edit chapter breaks
              </Dialog.Title>
              <Dialog.Description
                id="edit-chapters-desc"
                style={{
                  fontSize: 13,
                  color: "var(--tmt-ink-muted)",
                  margin: "6px 0 0",
                  fontFamily: "var(--tmt-sans)",
                  lineHeight: 1.5,
                }}
              >
                Click any paragraph to mark or unmark it as a chapter start.
                Changes are saved to your document.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  border: "none",
                  background: "transparent",
                  color: t.icon,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </Dialog.Close>
          </div>

          {/* ── Body: two panes ── */}
          <div
            style={{
              display: "flex",
              flex: 1,
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            {/* Left pane — paragraph list (~60%) */}
            <div
              style={{
                flex: "0 0 60%",
                borderRight: `1px solid ${t.borderSoft}`,
                overflowY: "auto",
                padding: "16px 0",
              }}
            >
              <div
                style={{
                  padding: "0 20px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <AlignLeft size={13} style={{ color: t.icon }} />
                <span
                  style={{
                    fontFamily: "var(--tmt-mono)",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--tmt-ink-muted)",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  {paraCount} paragraph{paraCount !== 1 ? "s" : ""}
                </span>
              </div>

              {paras.length === 0 ? (
                <p
                  style={{
                    padding: "24px 20px",
                    fontSize: 13,
                    color: "var(--tmt-ink-muted)",
                    margin: 0,
                  }}
                >
                  No paragraphs found in this document.
                </p>
              ) : (
                paras.map((para, i) => {
                  const isBreak = breaks.has(i);
                  return (
                    <button
                      key={i}
                      aria-pressed={i > 0 ? isBreak : undefined}
                      onClick={() => {
                        if (i > 0) toggleBreak(i);
                      }}
                      disabled={i === 0}
                      title={
                        i === 0
                          ? "The first paragraph always starts a chapter"
                          : isBreak
                          ? "Remove chapter break before this paragraph"
                          : "Add chapter break before this paragraph"
                      }
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        borderTop:
                          isBreak && i > 0
                            ? `2px solid ${t.accent}`
                            : `1px solid transparent`,
                        padding: "8px 20px",
                        cursor: i === 0 ? "default" : "pointer",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        if (i > 0) {
                          e.currentTarget.style.background = `${t.accent}12`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {/* Chapter-start indicator */}
                      {isBreak && i > 0 && (
                        <span
                          style={{
                            display: "inline-block",
                            marginBottom: 4,
                            padding: "1px 7px",
                            borderRadius: 999,
                            background: t.accent,
                            color: "#fff",
                            fontSize: 9,
                            fontWeight: 700,
                            fontFamily: "var(--tmt-mono)",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                          }}
                        >
                          chapter start
                        </span>
                      )}
                      {/* First paragraph — implicit chapter start, non-interactive */}
                      {i === 0 && (
                        <span
                          style={{
                            display: "inline-block",
                            marginBottom: 4,
                            padding: "1px 7px",
                            borderRadius: 999,
                            background: `${t.accent}30`,
                            color: t.accent,
                            fontSize: 9,
                            fontWeight: 700,
                            fontFamily: "var(--tmt-mono)",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                          }}
                        >
                          document start
                        </span>
                      )}
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          lineHeight: 1.55,
                          color: para.isTitle
                            ? "var(--tmt-ink)"
                            : "var(--tmt-ink-soft)",
                          fontWeight: para.isTitle ? 600 : 400,
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {para.text}
                      </p>
                    </button>
                  );
                })
              )}
            </div>

            {/* Right pane — live chapter preview (~40%) */}
            <div
              style={{
                flex: "0 0 40%",
                overflowY: "auto",
                padding: "16px 0",
              }}
            >
              <div
                style={{
                  padding: "0 20px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <BookOpen size={13} style={{ color: t.icon }} />
                <span
                  style={{
                    fontFamily: "var(--tmt-mono)",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--tmt-ink-muted)",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  {chapterCount} chapter{chapterCount !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Empty state: no paragraphs at all */}
              {paras.length === 0 && (
                <p
                  style={{
                    padding: "24px 20px",
                    fontSize: 13,
                    color: "var(--tmt-ink-muted)",
                    margin: 0,
                  }}
                >
                  Single chapter — entire document
                </p>
              )}

              {chapters.map((ch, ci) => {
                const autoTitle =
                  ch.paras.find((p) => p.isTitle)?.text ||
                  ch.paras[0]?.text?.slice(0, 60) ||
                  `Chapter ${ci + 1}`;
                const snippetPara = ch.paras.find(
                  (p) => !p.isTitle && p.text,
                );
                const snippet = snippetPara?.text?.slice(0, 120) || "";

                return (
                  <div
                    key={ci}
                    style={{
                      padding: "10px 20px",
                      borderBottom: `1px solid ${t.borderSoft}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--tmt-mono)",
                          fontSize: 9,
                          fontWeight: 700,
                          color: t.accent,
                          letterSpacing: "0.1em",
                          flexShrink: 0,
                        }}
                      >
                        {ci + 1}
                      </span>
                      {/* Inline title editor: empty = use auto-detected title */}
                      <input
                        type="text"
                        value={ch.titleOverride ?? ""}
                        placeholder={autoTitle}
                        aria-label={`Title for chapter ${ci + 1}`}
                        onChange={(e) =>
                          setTitleAt(ch.startIdx, e.target.value)
                        }
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: "var(--tmt-sans)",
                          color: "var(--tmt-ink)",
                          background: "transparent",
                          border: "none",
                          borderBottom: `1px solid ${t.borderSoft}`,
                          padding: "2px 0",
                          outline: "none",
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderBottomColor = t.accent;
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderBottomColor = t.borderSoft;
                          // Clear the override if user empties the field so the
                          // auto-detected title is used instead.
                          if (!e.currentTarget.value) {
                            setTitles((prev) => {
                              const next = { ...prev };
                              delete next[ch.startIdx];
                              return next;
                            });
                          }
                        }}
                      />
                    </div>
                    {snippet ? (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 11,
                          lineHeight: 1.5,
                          color: "var(--tmt-ink-muted)",
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {snippet}
                        {snippet.length === 120 ? "…" : ""}
                      </p>
                    ) : (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 11,
                          color: "var(--tmt-ink-muted)",
                          fontStyle: "italic",
                        }}
                      >
                        (no body text)
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Footer ── */}
          <div
            style={{
              borderTop: `1px solid ${t.borderSoft}`,
              padding: "16px 28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexShrink: 0,
            }}
          >
            {/* Inline error message — keeps the modal open so user can retry */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {saveError && (
                <p
                  role="alert"
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "#E25C5C",
                    lineHeight: 1.4,
                  }}
                >
                  {saveError}
                </p>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                onClick={onClose}
                disabled={saving}
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: `1px solid ${t.border}`,
                  background: "transparent",
                  color: t.fg,
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 550,
                  fontFamily: "var(--tmt-sans)",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                aria-disabled={saving}
                aria-busy={saving}
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: "none",
                  background: saving ? `${t.accent}99` : t.accent,
                  color: "#fff",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 660,
                  fontFamily: "var(--tmt-sans)",
                  minWidth: 80,
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
