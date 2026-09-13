#!/usr/bin/env node
//
// Generates synthetic EPUB fixtures for the parser eval harness.
//
// EPUB is a zip of: mimetype + META-INF/container.xml + OEBPS/content.opf
// + OEBPS/toc.ncx + OEBPS/<chapter>.xhtml. We own every byte, so the
// expectedSections counts in MANIFEST stay accurate as parser fixes
// land. No third-party content; no copyright risk.
//
// Run: node scripts/gen-epub-fixtures.mjs
// Outputs into tests/fixtures/epub/.

import JSZip from "jszip";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "tests/fixtures/epub");
mkdirSync(OUT, { recursive: true });

function chapter(title, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${title}</title></head>
<body>
<h1>${title}</h1>
<p>${body}</p>
</body>
</html>`;
}

function container() {
  return `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;
}

function opf({ chapters, withNCX = true }) {
  const manifestItems = chapters
    .map((c, i) => `    <item id="ch${i + 1}" href="ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`)
    .join("\n");
  const ncxRow = withNCX ? `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n` : "";
  const spineRefs = chapters.map((_, i) => `    <itemref idref="ch${i + 1}"/>`).join("\n");
  const spineOpts = withNCX ? ' toc="ncx"' : "";
  return `<?xml version="1.0"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Fixture</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
${ncxRow}${manifestItems}
  </manifest>
  <spine${spineOpts}>
${spineRefs}
  </spine>
</package>`;
}

function ncx(chapters) {
  const navPoints = chapters
    .map(
      (c, i) => `    <navPoint id="np${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${c.title}</text></navLabel>
      <content src="ch${i + 1}.xhtml"/>
    </navPoint>`,
    )
    .join("\n");
  return `<?xml version="1.0"?>
<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <head></head>
  <docTitle><text>Test Fixture</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;
}

async function buildEpub(outName, chapters, opts = {}) {
  const zip = new JSZip();
  // EPUB rule: mimetype MUST be the first file and stored uncompressed.
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", container());
  zip.file("OEBPS/content.opf", opf({ chapters, withNCX: opts.withNCX !== false }));
  if (opts.withNCX !== false) zip.file("OEBPS/toc.ncx", ncx(chapters));
  for (let i = 0; i < chapters.length; i++) {
    zip.file(`OEBPS/ch${i + 1}.xhtml`, chapter(chapters[i].title, chapters[i].body));
  }
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  writeFileSync(join(OUT, outName), buf);
  console.log(`wrote ${outName} (${buf.length} bytes)`);
}

// Fixture 1: happy-path 3 chapters with NCX titles.
await buildEpub("clean-3-chapter.epub", [
  { title: "Chapter One", body: "The first chapter sets the scene with quiet, conversational prose." },
  { title: "Chapter Two", body: "The second chapter introduces conflict and a complication that demands resolution." },
  { title: "Chapter Three", body: "The third chapter raises the stakes and points toward the resolution." },
]);

// Fixture 2: 5 chapters, longer bodies.
await buildEpub("longer-5-chapter.epub", [
  { title: "Prologue", body: "A short prologue that hints at what is to come." },
  { title: "Departure", body: "The protagonist leaves home for the first time, uncertain but determined." },
  { title: "The Encounter", body: "An unexpected meeting changes the course of the journey entirely." },
  { title: "Return", body: "The road home is longer than the road out." },
  { title: "Epilogue", body: "Years later, the events of that summer are remembered differently by each who lived them." },
]);

// Fixture 3: EPUB with NO NCX — chapters lose their titles. Tests that
// parseEPUB falls back to h1 inside the XHTML body.
await buildEpub(
  "no-ncx.epub",
  [
    { title: "First", body: "Body of the first chapter; the title should be recovered from the h1 inside the XHTML." },
    { title: "Second", body: "Body of the second chapter." },
    { title: "Third", body: "Body of the third chapter." },
  ],
  { withNCX: false },
);

// Fixture 4: single-chapter EPUB.
await buildEpub("single-chapter.epub", [
  { title: "The Whole Book", body: "Some EPUBs ship as one big chapter; this fixture tests that path." },
]);

// Fixture 5: many short chapters to stress numbering + memory.
await buildEpub(
  "many-short-chapters.epub",
  Array.from({ length: 10 }, (_, i) => ({
    title: `Section ${i + 1}`,
    body: `Body text of section ${i + 1}. Short, intentionally.`,
  })),
);

// Fixture 6: multi-chapter-per-file — two logical chapters packed into one
// XHTML file via id-anchored headings (the Project Gutenberg pattern).
// NCX has 3 navPoints; spine has only 2 itemrefs.
// chunk-a.xhtml holds "Etymology" + "Chapter 1. Loomings" (two fragments).
// chunk-b.xhtml holds "Chapter 2. The Carpet-Bag" (one fragment).
// Expected result: parseEPUB should produce 3 sections, not 2.
async function genMultiChapterPerFile() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", container());

  const opfXml = `<?xml version="1.0"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Multi-Chapter Per File Test Fixture</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="chunk-a" href="chunk-a.xhtml" media-type="application/xhtml+xml"/>
    <item id="chunk-b" href="chunk-b.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chunk-a"/>
    <itemref idref="chunk-b"/>
  </spine>
</package>`;

  const ncxXml = `<?xml version="1.0"?>
<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <head></head>
  <docTitle><text>Multi-Chapter Per File Test Fixture</text></docTitle>
  <navMap>
    <navPoint id="np1" playOrder="1">
      <navLabel><text>Etymology</text></navLabel>
      <content src="chunk-a.xhtml#ch1"/>
    </navPoint>
    <navPoint id="np2" playOrder="2">
      <navLabel><text>Chapter 1. Loomings</text></navLabel>
      <content src="chunk-a.xhtml#ch2"/>
    </navPoint>
    <navPoint id="np3" playOrder="3">
      <navLabel><text>Chapter 2. The Carpet-Bag</text></navLabel>
      <content src="chunk-b.xhtml#ch3"/>
    </navPoint>
  </navMap>
</ncx>`;

  const chunkA = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chunk A</title></head>
<body>
<h2 id="ch1">Etymology</h2>
<p>The word whale is derived from the Old English hwael, a creature vast and ancient beyond measure.</p>
<h2 id="ch2">Chapter 1. Loomings</h2>
<p>Call me Ishmael. Some years ago, never mind how long precisely, I thought I would sail about and see the watery part of the world.</p>
</body>
</html>`;

  const chunkB = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chunk B</title></head>
<body>
<h2 id="ch3">Chapter 2. The Carpet-Bag</h2>
<p>I stuffed a shirt or two into my old carpet-bag, tucked it under my arm, and started for Cape Horn and the Pacific.</p>
</body>
</html>`;

  zip.file("OEBPS/content.opf", opfXml);
  zip.file("OEBPS/toc.ncx", ncxXml);
  zip.file("OEBPS/chunk-a.xhtml", chunkA);
  zip.file("OEBPS/chunk-b.xhtml", chunkB);

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  writeFileSync(join(OUT, "multi-chapter-per-file.epub"), buf);
  console.log(`wrote multi-chapter-per-file.epub (${buf.length} bytes)`);
}

await genMultiChapterPerFile();
