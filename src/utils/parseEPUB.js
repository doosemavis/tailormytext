import { loadScript } from "./scriptLoader.js";

// CONTRACT: emits Section[] per docs/architecture/PARSER_CONTRACT.md.
// Sections have type:"chapter", title from NCX/h1-h3 (null if neither),
// number from spine order, content in the private pseudo-Markdown format.
//
// NOTE on main-thread vs worker placement (Phase 4 decision, 2026-05-13):
//
// parseEPUB stays on the main thread for now. The blocker is `DOMParser` +
// DOM tree walking (node.nodeType, node.childNodes, querySelectorAll):
// Web Workers don't have a DOM. To move this into a worker we'd either
//   (a) swap DOMParser for parse5 / linkedom (~50-100KB worker bundle,
//       ~half-day to rewrite walk() against the new tree shape), or
//   (b) extract XHTML strings in the worker and parse DOM on main thread —
//       which doesn't help, because the main-thread cost IS the DOM walk.
//
// Empirically the per-chapter walk() is ~5-20ms on typical novels — below
// the loader's ~50ms stutter threshold. PDF analysis was the big offender
// (moved to worker in Phase 3, src/workers/pdfAnalysis.js). EPUB stays
// main-thread until measured stutter on real EPUBs justifies the parse5
// rewrite. Tracked as a deferred TODO in TAILORMYTEXT_LAUNCH_PLAN.md.

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripLeadingTitle(content, title) {
  if (!title) return content;
  const re = new RegExp("^" + escapeRegExp(title.trim()) + "\\s*", "i");
  return content.replace(re, "").trim();
}

export async function parseEPUB(file) {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
  const JSZip = window.JSZip;
  if (!JSZip) throw new Error("ZIP library failed to load");

  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) throw new Error("Invalid EPUB: missing container.xml");
  const rootMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!rootMatch) throw new Error("Invalid EPUB: no rootfile found");

  const opfPath = rootMatch[1];
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";
  const opfXml = await zip.file(opfPath)?.async("text");
  if (!opfXml) throw new Error("Invalid EPUB: missing OPF");

  const opfDoc = new DOMParser().parseFromString(opfXml, "application/xml");
  // OPF is the spine; without it we cannot enumerate chapters. Hard-fail
  // so App.jsx surfaces a real error message instead of "no content".
  if (opfDoc.querySelector("parsererror")) {
    throw new Error("Invalid EPUB: OPF metadata is malformed");
  }
  const manifest = {};
  opfDoc.querySelectorAll("item").forEach(item => { manifest[item.getAttribute("id")] = item.getAttribute("href"); });
  const spineRefs = [];
  opfDoc.querySelectorAll("itemref").forEach(ref => { spineRefs.push(ref.getAttribute("idref")); });

  // Fragment-aware NCX index: filename → ordered list of { fragment: string|null, label: string }
  // When a navPoint targets "file.xhtml#anchor", fragment is "anchor".
  // When it targets "file.xhtml" with no fragment, fragment is null.
  // Multiple navPoints targeting the same file are kept in navMap order so we
  // can split that file's body at each anchor element.
  const tocEntries = new Map();
  const ncxItem = Array.from(opfDoc.querySelectorAll("item")).find(i => i.getAttribute("media-type") === "application/x-dtbncx+xml");
  if (ncxItem) {
    const ncxHref = opfDir + ncxItem.getAttribute("href");
    const ncxXml = await zip.file(ncxHref)?.async("text");
    if (ncxXml) {
      const ncxDoc = new DOMParser().parseFromString(ncxXml, "application/xml");
      // NCX only supplies human titles. Soft-fail: warn and skip TOC; the
      // book still reads, chapters fall back to null/h1 titles.
      if (ncxDoc.querySelector("parsererror")) {
        console.warn("[parseEPUB] NCX (table of contents) is malformed — chapter titles will be lost");
      } else {
        ncxDoc.querySelectorAll("navPoint").forEach(np => {
          const label = np.querySelector("navLabel text")?.textContent?.trim();
          const rawSrc = np.querySelector("content")?.getAttribute("src");
          if (!label || !rawSrc) return;
          const [path, fragment = null] = rawSrc.split("#");
          if (!tocEntries.has(path)) tocEntries.set(path, []);
          tocEntries.get(path).push({ fragment: fragment || null, label });
        });
      }
    }
  }

  const walk = (node) => {
    if (node.nodeType === 3) return node.textContent.replace(/[\r\n]+/g, " ").replace(/ {2,}/g, " ");
    if (node.nodeName === "BR") return " ";
    const tag = node.nodeName.toLowerCase();
    const isBlock = /^(p|div|h[1-6]|li|blockquote|section|article|tr|dt|dd)$/.test(tag);
    const inner = Array.from(node.childNodes).map(walk).join("");
    if (isBlock && inner.trim()) return "\n\n" + inner.trim();
    return inner;
  };

  const sections = [];
  let chapterNum = 0;
  for (const idref of spineRefs) {
    const href = manifest[idref]; if (!href) continue;
    const xhtml = await zip.file(opfDir + href)?.async("text"); if (!xhtml) continue;
    const parsed = new DOMParser().parseFromString(xhtml, "application/xhtml+xml");
    // Soft-fail per chapter: warn and skip this one; remaining chapters
    // still parse so the user gets a usable subset of the book.
    if (parsed.querySelector("parsererror")) {
      console.warn(`[parseEPUB] chapter XHTML is malformed; skipping: ${href}`);
      continue;
    }
    const body = parsed.body || parsed.documentElement;

    // Determine which NCX entries map to this spine file.
    const entries = tocEntries.get(href) ?? [];

    // Use fragment-splitting whenever at least one navPoint for this file
    // specifies a fragment. A null-fragment entry[0] means "start of file" —
    // its segment accumulates content from the beginning until the next
    // fragment-anchored entry fires. Switched from .every() to .some() so
    // mixed layouts (entry[0] = whole file, entry[1+] = fragments) split
    // correctly instead of collapsing to one section.
    const hasFragments = entries.length > 1 && entries.some(e => e.fragment !== null);

    if (!hasFragments) {
      // Single navPoint or no NCX entry — emit one section per spine file.
      const headings = body.querySelectorAll("h1, h2, h3");
      let title = entries[0]?.label ?? null;
      if (!title && headings.length > 0) title = headings[0].textContent.trim();

      const rawText = walk(body).trim();
      if (!rawText) continue;

      chapterNum++;
      const content = stripLeadingTitle(rawText, title);
      sections.push({ type: "chapter", title: title || null, number: chapterNum, content });
      continue;
    }

    // Multi-navPoint case: split body children at each fragment anchor.
    // Build a lookup: fragmentId → NCX label for that anchor.
    const fragmentToLabel = new Map(
      entries.filter(e => e.fragment !== null).map(e => [e.fragment, e.label]),
    );

    // Verify at least one fragment anchor exists in the document before
    // committing to the split path. If none match, fall back gracefully.
    const anyFragmentMatched = entries.some(
      e => e.fragment && body.querySelector(`[id="${e.fragment}"]`) !== null,
    );
    if (!anyFragmentMatched) {
      console.warn(`[parseEPUB] NCX fragment anchors not found in ${href} — falling back to single section`);
      const rawText = walk(body).trim();
      if (!rawText) continue;
      chapterNum++;
      const fallbackTitle = entries[0]?.label ?? null;
      const content = stripLeadingTitle(rawText, fallbackTitle);
      sections.push({ type: "chapter", title: fallbackTitle, number: chapterNum, content });
      continue;
    }

    // Walk body's direct child nodes in DOM order, building segments in
    // encounter order (not NCX order). This ensures out-of-order NCX entries
    // don't produce wrong section ordering.
    //
    // Preamble handling: content before the first recognised fragment anchor
    // lands in a sentinel preamble segment. If entry[0] has no fragment it
    // represents the start-of-file, so the preamble label is set to
    // entries[0].label and the preamble merges into that entry naturally.
    // If entry[0] has a fragment, preamble stays null-titled.
    const preambleLabel = entries[0].fragment === null ? entries[0].label : null;
    // segments is built in DOM-encounter order during the walk.
    const segments = [{ label: preambleLabel, nodes: [] }];

    for (const child of Array.from(body.childNodes)) {
      if (child.nodeType === 1 && child.id) {
        const label = fragmentToLabel.get(child.id);
        if (label !== undefined) {
          // Start a new segment in document-encounter order.
          segments.push({ label, nodes: [] });
        }
      }
      segments[segments.length - 1].nodes.push(child);
    }

    for (const seg of segments) {
      if (seg.nodes.length === 0) continue;
      // Wrap nodes in a temporary element so walk() can recurse naturally.
      const wrapper = parsed.createElement("div");
      seg.nodes.forEach(n => wrapper.appendChild(n.cloneNode(true)));
      const rawText = walk(wrapper).trim();
      if (!rawText) {
        // Empty fragment is unusual enough to be worth noting for debugging.
        if (seg.label !== null) {
          console.warn(`[parseEPUB] navPoint '${seg.label}' in ${href} has empty content — skipping`);
        }
        continue;
      }

      chapterNum++;
      const content = stripLeadingTitle(rawText, seg.label);
      sections.push({ type: "chapter", title: seg.label, number: chapterNum, content });
    }
  }
  if (sections.length === 0) throw new Error("No readable content found in EPUB");
  return sections;
}
