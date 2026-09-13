# Parser Pipeline Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dramatically improve TailorMyText's document-parsing fidelity and error handling across all 5 supported formats (PDF, EPUB, DOCX, TXT, MD/HTML), without disrupting the live launch window.

**Architecture:** Define a stable renderer contract FIRST; build an eval harness on fixtures; then ship silent-failure fixes, a content sniffer, a Markdown library swap (via token API not HTML), HTML walker fixes, and confidence-scored plain-text detection with a reversible "Edit Chapters" UI. No third-party LLM in v1 (privacy promise). PDF/EPUB/DOCX deeper bugs are out of scope for v1 and enumerated in Phase 6 for follow-up.

**Tech Stack:** Vite + React 18, `marked` (lexer/token API) for Markdown, `vitest` for the new test runner, existing `pdfjs-dist`, `JSZip`, `mammoth` parsers retained for v1.

---

## Executive Summary

Five diagnostic skills (`/investigate`, `silent-failure-hunter`, `regex-vs-llm-structured-text`, `/codex`) converged on a single root-pattern: parsers silently degrade on malformed input because the renderer's expected shape is undocumented and untested. The fix sequence reflects that — define the contract before changing producers, build the eval harness before tuning heuristics, then ship parser changes in the order that preserves rollback safety. The branch is isolated off `production` to protect the in-flight library launch (PR #3) and the 2-week launch window. Every phase is independently shippable and independently revertable.

---

## Phase Sequence

| Phase | Scope | Blast radius | Rollback |
|---|---|---|---|
| **0** | Renderer-contract spec + fixture-based eval harness (no parser changes) | None — docs + tests | Delete `docs/architecture/PARSER_CONTRACT.md` + `tests/parsers/` |
| **1** | Critical/High silent-failure fixes (15 items from sweep) | Surface area: all parsers + dispatcher. Each fix is independent and additive | Per-commit revert; fixes don't co-depend |
| **2** | Content sniffer (`sniffDocumentType.js`) before format dispatch | New file + 1 call site in `App.jsx doUpload` | Remove the call; extension-based dispatch returns |
| **3** | Markdown library swap via `marked.lexer()` + token→section adapter | Replaces `preprocessMarkdown()` + `parseMarkdownStructured()` flow. Renderer contract MUST be locked first (Phase 0) | Keep old `preprocessMarkdown()` behind a feature flag; flip back on regression |
| **4** | HTML walker bug fixes (h4-h6, script/style strip, parsererror, type harmonization) | `parseHTMLStructured` in `detectStructure.js` only | Per-commit revert; bug fixes are point fixes |
| **5** | Plain-text confidence scoring + "Edit Chapters" UI | `detectStructure.js` + new sidebar component | Confidence scoring is additive (default 0.80 threshold = current behavior). UI ships behind a feature flag |
| **6** *(deferred)* | PDF/EPUB/DOCX deeper bugs (multi-column, EPUB3 nav, mammoth styleMap, etc.) | Per-parser, out of scope for v1 | Enumerated as follow-up plans |
| **7** *(v2, gated)* | Opt-in LLM fallback via Supabase Edge — only if Phase 5 evals show <0.45 cases are common | Edge function + account-settings toggle | Feature flag; default OFF |

---

## Risk Register

| Risk | Mitigation | Owner |
|---|---|---|
| **R1: Parser-first without renderer contract.** DocumentBody consumes a private pseudo-Markdown format (`**bold**`, `__italic__`, `- list`, inline `##`/`###` headings). Any parser improvement leaks if the contract isn't locked first. *(Source: /codex Big Risk #1.)* | Phase 0 ships the contract spec + a passing test asserting current DocumentBody behavior before any parser changes. | Plan order |
| **R2: Confidence scoring becomes fake precision.** Composite scoring on plain text can rank wrong candidates if the candidate-generation regex is wrong. Lexical-overlap signal is most dangerous (adjacent fiction chapters have low overlap; technical adjacent sections have high). *(Source: /codex Big Risk #2 + Q3.)* | Phase 0 builds the eval harness with ≥50 representative ugly files. Phase 5 cannot ship unless evals show ≥2× improvement on false-split rate AND missed-chapter rate vs baseline. | Phase 0/5 acceptance |
| **R3: Bundle-size regression on initial paint.** Markdown parser is the largest single dep we'd add. `marked` is ~50 KB minified; `markdown-it` ~120 KB. Either lands on the SPA's first-paint critical path unless we keep them in a worker chunk. | Phase 3 imports `marked` inside `src/workers/parser.worker.js` only; static analyzer check in build to assert it's NOT in the main chunk. | Phase 3 acceptance |
| **R4: Library launch disruption.** Library-feature PR #3 is mid-flight to `production`; the 2-week launch window is live. | New branch (`parser-rewrite`) off `production` is fully isolated. Phase 0-2 are pure additive (eval harness, silent-failure logs, sniffer that defaults to current behavior on tie); merge-in deferred until launch window closes. | Branch isolation |
| **R5: Worker chunk break.** Adding `marked` to the worker without verifying its bundler chunking config could land it in the main bundle accidentally. | Phase 3 includes a `vite.config.js` `manualChunks` assertion + a runtime check in the eval harness. | Phase 3 acceptance |
| **R6: No browser env in tests.** parseEPUB uses `DOMParser` which doesn't exist in Node; vitest needs `happy-dom` or `jsdom` to run those parser tests. | Phase 0 selects `happy-dom` (lighter than jsdom) in `vitest.config.js`. | Phase 0 task list |
| **R7: User edits a chapter break, parser re-runs, edits lost.** If we ship "Edit Chapters" UI that overrides parser output, a re-upload of the same doc could wipe edits. | Phase 5 stores user overrides per `docId` in `recent_docs.chapter_overrides` (jsonb) — never on the parsed output itself. Re-uploads dedup by name and inherit the override. | Phase 5 schema task |

---

## Deferred Open Questions

These are tracked, not forgotten. Each gets answered in its referenced phase.

| Q | Question | Resolved in |
|---|---|---|
| OQ-1 | Does `marked.lexer()` cover all current `preprocessMarkdown` outputs (private markers, table handling, blockquote semantics)? | Phase 3 Task 2 (adapter spike) |
| OQ-2 | Is `happy-dom` sufficient for parseEPUB tests, or do we need `jsdom`? | Phase 0 Task 5 (eval harness setup) |
| OQ-3 | Where do we source the 50+ ugly fixture files? Project Gutenberg ZIP archive + synthetic edge cases? Or user uploads? | Phase 0 Task 4 (fixture curation) |
| OQ-4 | What's the exact UI for "Edit Chapters" — sidebar drawer, modal, or inline reader overlay? | Phase 5 Task 1 (design pass with /frontend-design) |
| OQ-5 | Should the sniffer override binary formats EVER (e.g. a `.pdf` that's actually a renamed text file)? Currently spec says "no — only upgrade text-like." | Phase 2 Task 3 (sniffer rules) |
| OQ-6 | Do we need to add `chapter_overrides` to the existing `recent_docs` table or a new table? | Phase 5 Task 5 (schema migration) |
| OQ-7 | What's the actual threshold tuning — 0.80/0.55 from codex is a starting guess; what do real evals say? | Phase 5 Task 4 (threshold tuning gated on Phase 0 eval data) |

---

## Acceptance Criteria for "v1 complete"

All of these must be true to consider v1 shipped:

- [ ] `docs/architecture/PARSER_CONTRACT.md` exists, documents the `{ type, title, number, content }` shape exhaustively, and is referenced from `DocumentBody.jsx` + every parser file
- [ ] `vitest` is wired; `npm run test` and `npm run eval` both pass on baseline-locked goldens
- [ ] Fixture corpus has ≥10 per format (PDF/EPUB/DOCX/TXT/MD/HTML), ≥50 total, including the named edge cases from `/investigate`
- [ ] All 6 Critical + 9 High silent-failure items from the sweep have been fixed and have regression tests
- [ ] `sniffDocumentType.js` exists, has tests, and is called from `App.jsx doUpload`. Extension dispatch is now fallback, not primary
- [ ] Markdown parsing goes through `marked.lexer()` token API + a `tokenToSection` adapter; bundle-size assertion confirms `marked` is in the worker chunk (not main)
- [ ] HTML walker handles h1-h6, strips `<script>`/`<style>`, detects `<parsererror>`, harmonizes section `type` to `"chapter"`
- [ ] Plain-text detection uses confidence scoring with ≥0.80/0.55/<0.55 thresholds; "Edit Chapters" UI exists; user overrides persist per `docId`
- [ ] Eval harness shows ≥2× improvement vs baseline on false-split rate AND missed-chapter rate
- [ ] No regression in the 21-book Reading Room library — all books open and render correctly
- [ ] Initial-paint JS bundle size has not grown by more than the worker-chunk addition (asserted by build script)
- [ ] PR opens against `production`, full eval run is green, manual smoke on 10 representative real-user docs passes

---

# Phase 0 — Renderer Contract + Eval Harness

**Why first:** No tests exist. No documented contract exists. Any parser change is unguarded refactoring without these.

### Task 0.1: Document the existing renderer contract

**Files:**
- Create: `docs/architecture/PARSER_CONTRACT.md`

- [ ] **Step 1: Read DocumentBody.jsx + every parser end-to-end**

Files to read: `src/components/DocumentBody.jsx`, `src/utils/parsePDF.js`, `src/utils/parseEPUB.js`, `src/utils/parseDOCX.js`, `src/utils/detectStructure.js`, `src/workers/pdfAnalysis.js`, `src/workers/parser.worker.js`.

Capture: what shape does each parser EMIT? What shape does `DocumentBody` ASSUME? What invariants does the renderer rely on that aren't enforced?

- [ ] **Step 2: Write the contract doc**

Document, with example payloads:
- The `section` object shape: `{ type: 'chapter'|'page'|'section'|'document', title: string|null, number: number|null, content: string, titleSizeRatio?: number }`
- Which fields are required vs optional
- Content body language: the private pseudo-Markdown format (`**bold**`, `__italic__`, `- list`, `1. list`, inline `##`/`###` for sub-headings)
- Allowed inline markers in `content`
- Invariants: `sections` array is non-empty, `content` is non-whitespace, `title` is non-empty when present
- Per-format expectations (PDF emits `chapter` or `page`, EPUB emits `chapter`, etc.)

- [ ] **Step 3: Cross-link from every parser file + DocumentBody**

Add a top-of-file comment to each parser: `// See docs/architecture/PARSER_CONTRACT.md for the section-object shape this must emit.`
Same in `DocumentBody.jsx`.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/PARSER_CONTRACT.md src/components/DocumentBody.jsx src/utils/parse*.js src/utils/detectStructure.js src/workers/*.js
git commit -m "docs(parsers): document the section-object contract and renderer invariants"
```

### Task 0.2: Wire up vitest

**Files:**
- Create: `vitest.config.js`
- Modify: `package.json`

- [ ] **Step 1: Add vitest + happy-dom devDependencies**

```bash
npm install --save-dev vitest happy-dom @vitest/ui
```

- [ ] **Step 2: Create `vitest.config.js`**

```javascript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["tests/**/*.test.{js,jsx}"],
    setupFiles: ["tests/setup.js"],
  },
});
```

- [ ] **Step 3: Add `tests/setup.js`**

```javascript
import { Blob } from "node:buffer";
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = async function () {
    return Buffer.from(await this.text());
  };
}
```

- [ ] **Step 4: Add scripts to package.json**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui",
  "eval": "node scripts/eval-parsers.mjs"
}
```

- [ ] **Step 5: Sanity test**

Create `tests/setup.test.js`:
```javascript
import { describe, it, expect } from "vitest";
describe("setup", () => {
  it("happy-dom provides DOMParser", () => {
    expect(typeof DOMParser).toBe("function");
  });
});
```

Run: `npm run test`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.js tests/ package.json package-lock.json
git commit -m "test: wire up vitest + happy-dom for parser tests"
```

### Task 0.3: Build the fixture corpus structure

**Files:**
- Create: `tests/fixtures/README.md`
- Create: `tests/fixtures/{pdf,epub,docx,txt,md,html}/.gitkeep`
- Create: `tests/fixtures/MANIFEST.json`

- [ ] **Step 1: Create the directory tree**

```bash
mkdir -p tests/fixtures/{pdf,epub,docx,txt,md,html}
touch tests/fixtures/{pdf,epub,docx,txt,md,html}/.gitkeep
```

- [ ] **Step 2: Write `tests/fixtures/MANIFEST.json`**

JSON listing every fixture with its expected outcome:
```json
{
  "txt-allcaps-false-positive.txt": {
    "format": "txt",
    "purpose": "Bait the ALL-CAPS heading false-positive",
    "expectedSections": 1,
    "expectedFailureMode": "current parser produces 4 sections; should produce 1"
  },
  "md-nested-code-fence.md": {
    "format": "md",
    "purpose": "Code-fence greedy-regex bug",
    "expectedSections": 2,
    "expectedFailureMode": "current preprocessor mangles the inner fence"
  }
}
```

Initial entries (10+ per format) must cover the named edge cases from `/investigate`:
- PDF: multi-column, scanned-image-only, encrypted, with-outline, no-outline, with-tables, with-footnotes
- EPUB: EPUB3 nav.xhtml, EPUB2 NCX, missing-idref, malformed-OPF, all-image chapter, RTL, soft-hyphens
- DOCX: heading-styled, list-heavy, table-heavy, track-changes, `.doc` mis-extension, math-equations
- TXT: ALL-CAPS bait, numbered clauses, ornamental titles, page-numbered, hyphenated-across-newlines
- MD: nested code fence, escape sequences (`\_word\_`), front-matter, setext headings, task lists, GFM table
- HTML: h4-h6 only, `<script>` leak, `<article>`/`<section>` semantic, malformed XML

- [ ] **Step 3: Source fixtures**

Use:
- Project Gutenberg ZIPs (already in `scripts/.cache-stripped/`) for natural EPUBs
- Hand-crafted minimal MD/TXT/HTML files for syntactic bait
- Synthetic DOCX from Word or pandoc for styled fixtures
- Public-domain PDFs from arxiv/PG for multi-column + scanned

- [ ] **Step 4: Document the curation rules in `tests/fixtures/README.md`**

Rules for adding fixtures: no copyrighted content, MUST update MANIFEST.json, MUST name the failure mode being tested.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/
git commit -m "test(fixtures): seed parser fixture corpus with 50+ named edge cases"
```

### Task 0.4: Build the eval harness

**Files:**
- Create: `scripts/eval-parsers.mjs`
- Create: `tests/fixtures/golden/` (directory)

- [ ] **Step 1: Create `scripts/eval-parsers.mjs`**

```javascript
#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parsePDF, parseEPUB, parseDOCX, parseMarkdownStructured, detectTextStructure, parseHTMLStructured } from "../src/utils/index.js";

const MANIFEST = JSON.parse(readFileSync("tests/fixtures/MANIFEST.json", "utf8"));
const UPDATE = process.argv.includes("--update");

const DISPATCH = {
  pdf: parsePDF,
  epub: parseEPUB,
  docx: parseDOCX,
  md: parseMarkdownStructured,
  txt: (file) => detectTextStructure(file.text),
  html: (file) => parseHTMLStructured(file.text),
};

let pass = 0, fail = 0;
for (const [fixtureName, meta] of Object.entries(MANIFEST)) {
  const fixturePath = join("tests/fixtures", meta.format, fixtureName);
  const goldenPath = join("tests/fixtures/golden", `${fixtureName}.json`);
  const sections = await DISPATCH[meta.format](readFileSync(fixturePath));
  if (UPDATE) {
    writeFileSync(goldenPath, JSON.stringify(sections, null, 2));
    continue;
  }
  if (!existsSync(goldenPath)) { console.warn(`No golden for ${fixtureName} — run with --update`); fail++; continue; }
  const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
  const drift = JSON.stringify(sections) !== JSON.stringify(golden);
  if (drift) { console.error(`DRIFT: ${fixtureName}`); fail++; }
  else { pass++; }
}
console.log(`pass=${pass} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: Generate initial goldens against the CURRENT parser behavior**

Run: `npm run eval -- --update`

This locks in current behavior as the baseline. Subsequent phases must explicitly choose to update goldens when changing behavior intentionally.

- [ ] **Step 3: Confirm `npm run eval` is green on locked goldens**

Run: `npm run eval`. Expected: `pass=N fail=0`.

- [ ] **Step 4: Add metrics calculation (false-split-rate, missed-chapter-rate, usable-TOC-rate)**

Extend `eval-parsers.mjs` to compute, per fixture, comparing detected sections against `expectedSections` in MANIFEST:
- false_split: `detected > expected` (we cut a real chapter or split mid-paragraph)
- missed_chapter: `detected < expected` (we merged chapters)
- usable_toc: `detected === expected AND every detected section has a non-null title`

Print aggregate rates per format at end of run.

- [ ] **Step 5: Commit**

```bash
git add scripts/eval-parsers.mjs tests/fixtures/golden/ package.json
git commit -m "test(eval): build fixture-based parser eval harness with golden-file diff"
```

### Task 0.5: Lock the renderer contract behind a test

**Files:**
- Create: `tests/parsers/contract.test.js`

- [ ] **Step 1: Write the renderer-contract assertion**

```javascript
import { describe, it, expect } from "vitest";
import { parseMarkdownStructured } from "../../src/utils/detectStructure.js";

describe("Renderer contract — every parser emits the documented shape", () => {
  it("MD parser emits { type, title, number, content }[] with no extra keys", () => {
    const sections = parseMarkdownStructured("# Chapter 1\n\nHello.");
    expect(Array.isArray(sections)).toBe(true);
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) {
      expect(s).toHaveProperty("type");
      expect(s).toHaveProperty("title");
      expect(s).toHaveProperty("number");
      expect(s).toHaveProperty("content");
      expect(["chapter", "page", "section", "document"]).toContain(s.type);
      expect(typeof s.content).toBe("string");
    }
  });
});
```

- [ ] **Step 2: Run; expected PASS against current behavior**

Run: `npm run test`. If any current parser violates the contract, the test fails — that's a Phase 1 silent-failure issue to surface.

- [ ] **Step 3: Commit**

```bash
git add tests/parsers/contract.test.js
git commit -m "test(parsers): lock renderer contract via per-parser assertion"
```

---

# Phase 1 — Critical/High Silent-Failure Fixes

**Why before parser changes:** Each fix is independent. Doing them now means the eval harness baseline is correct (errors propagate instead of swallowing) when later phases rewrite parsers. Each fix gets a regression test.

The full list of 15 items is in the silent-failure-hunter output. Each item below is one task with the same template: failing test → fix → re-run test → commit.

### Task 1.1: `cloudDocs.js:161` corrupted-blob silent null

**Files:** `src/utils/cloudDocs.js`, `tests/utils/cloudDocs.test.js`

- [ ] **Step 1: Write failing regression test** — `cloudLoadDoc` distinguishes missing-blob from corrupted-blob via two distinct return shapes.

- [ ] **Step 2: Fix the catch** — return `{ error: 'corrupted', name }` instead of `null` when JSON.parse throws.

- [ ] **Step 3: Update `App.jsx loadRecentDoc`** — distinguish `data.error === 'corrupted'` from `data === null` and show user-appropriate messages.

- [ ] **Step 4: Run test, commit**

### Task 1.2: `parseEPUB.js:36` DOMParser OPF parsererror not detected

**Files:** `src/utils/parseEPUB.js`, `tests/parsers/parseEPUB.test.js`

- [ ] **Step 1: Failing test with malformed-OPF fixture** — expect `parseEPUB` to throw `/malformed/i`, not return empty sections.

- [ ] **Step 2: Add detection** after `parseFromString`:
```javascript
if (opfDoc.querySelector("parsererror")) {
  throw new Error("Invalid EPUB: OPF metadata is malformed");
}
```

- [ ] **Step 3: Run, commit**

### Task 1.3: `parseEPUB.js:48` DOMParser NCX parsererror not detected

Same pattern as 1.2 for NCX. Soft-failure: log a warn and skip NCX (chapters still parse, just lose titles).

### Task 1.4: `parseEPUB.js:62` DOMParser XHTML parsererror not detected

Same pattern. Per-chapter soft-failure: log warn + skip the chapter; don't fail the whole book.

### Task 1.5: `parsePDF.js:95` bare catch on `doc.getOutline()`

Replace `catch {}` with `catch (e) { console.warn("[parsePDF] outline fetch failed:", e.message); }`. Add test.

### Task 1.6: `parsePDF.js:49` bare catch in `resolveDestToPage`

Same pattern. Add a counter for "outline entries dropped"; if > 50% of entries dropped, log a warn so we know the outline is mostly broken.

### Task 1.7-1.15: The 9 High items

Same template, one task each:
- 1.7: `App.jsx:853` bare catch in `loadRecentDoc` — distinguish network vs storage errors
- 1.8: `App.jsx:585` JSON.parse of scroll position — clear corrupt key + log
- 1.9: `parseDOCX.js:14` mammoth `result.messages` never inspected — log warnings, throw on errors
- 1.10: `parseDOCX.js:34-37` `extractRawText` fallback swallows structural failure — log
- 1.11: `cloudDocs.js:303` `cloudLoadLibraryPosition` collapses error and "no position" — throw on error
- 1.12: `cloudDocs.js:261` `recent_docs` upsert failure on library open — surface non-blocking toast
- 1.13: `cloudDocs.js:90-92` prior-doc cleanup errors not handled — await + check + log
- 1.14: `cloudDocs.js:125-126` overflow trim errors not handled — same
- 1.15: `parser.worker.js:50` `String(err)` loses error type — serialize `{ message, name, stack }`

### Task 1.16: Update goldens after silent-failure fixes

- [ ] **Step 1: Re-run `npm run eval -- --update`** — some fixtures previously parsing-with-degradation will now throw; that's correct.

- [ ] **Step 2: Commit goldens**

```bash
git add tests/fixtures/golden/
git commit -m "test(eval): refresh goldens after Phase 1 silent-failure fixes"
```

---

# Phase 2 — Content Sniffer

**Why before MD swap:** A `.txt` that's really HTML or MD should reach the right parser. Phase 3+ changes are wasted on a doc routed to the wrong parser.

### Task 2.1: Create `sniffDocumentType.js`

**Files:** `src/utils/sniffDocumentType.js`, `tests/utils/sniffDocumentType.test.js`

- [ ] **Step 1: Write tests first**

```javascript
import { describe, it, expect } from "vitest";
import { sniffDocumentType } from "../../src/utils/sniffDocumentType.js";

describe("sniffDocumentType", () => {
  it("identifies PDF by %PDF- magic bytes", async () => {
    const buf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(1000)]);
    expect(await sniffDocumentType("doc.unknown", buf)).toBe("pdf");
  });
  it("identifies EPUB by ZIP + mimetype", async () => { /* ... */ });
  it("upgrades .txt with leading <!DOCTYPE html> to html", async () => { /* ... */ });
  it("upgrades .txt with strong markdown signals to md", async () => { /* ... */ });
  it("never overrides a recognized binary extension", async () => { /* ... */ });
  it("falls back to extension when no clear signal", async () => { /* ... */ });
});
```

- [ ] **Step 2: Implement sniffer**

Magic bytes for binary: `%PDF-` (PDF), `PK\x03\x04` + check mimetype entry (EPUB/DOCX distinguish by mimetype contents).
Text-sample heuristics (first 4KB):
- HTML: presence of `<!doctype html`, `<html`, `<body`, or > 5 unique HTML tags
- Markdown: ATX headings, fenced code blocks, link/image syntax — score each, threshold to flip
- JSON: leading `{`/`[` and successful `JSON.parse`

Rule: extension wins for binary types (no .docx → .pdf override). Sniffer can ONLY upgrade text-like extensions (.txt → .html or .md).

- [ ] **Step 3: Run tests, commit**

### Task 2.2: Wire into `App.jsx doUpload`

**Files:** `src/App.jsx`

- [ ] **Step 1: Add sniff step before dispatch**

```javascript
const ext = file.name.split(".").pop().toLowerCase();
const sniffed = await sniffDocumentType(file.name, await file.arrayBuffer());
const effective = sniffed ?? ext;
```

Dispatch on `effective`. Log when `sniffed !== ext` so we can tell when sniffer is intervening.

- [ ] **Step 2: Test against fixtures** — Add 3 fixtures: `html-as-txt.txt`, `md-as-txt.txt`, `binary-as-md.md` (should NOT be upgraded). Confirm dispatch goes to the right parser.

- [ ] **Step 3: Run eval, commit**

---

# Phase 3 — Markdown Library Swap

**Why this order:** Phase 0 locks the renderer contract; Phase 1 stops silent failures; Phase 2 ensures correct dispatch. Now we can safely swap `preprocessMarkdown` knowing the contract is enforced.

### Task 3.1: Add `marked` to the worker chunk only

**Files:** `package.json`, `vite.config.js`, `src/workers/parser.worker.js`

- [ ] **Step 1: Add dep**

```bash
npm install marked
```

- [ ] **Step 2: Import in `parser.worker.js`, NOT in `src/utils/` or `src/App.jsx`**

Confirm via `npm run build` + bundle-size analyzer that `marked` lands in `parser.worker-*.js` chunk, not `index-*.js`.

- [ ] **Step 3: Add a build-time assertion**

In `vite.config.js`, add a `manualChunks` config that forces `marked` into the worker chunk:
```javascript
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes("node_modules/marked")) return "parser.worker";
      },
    },
  },
},
```

- [ ] **Step 4: Run build, verify bundle, commit**

### Task 3.2: Write the token→section adapter

**Files:** `src/utils/parseMarkdownTokens.js`, `tests/utils/parseMarkdownTokens.test.js`

- [ ] **Step 1: Spec the mapping (from codex Q2 answer)**

```
heading depth 1-2 → flush current section, start new section with token.text as title
heading depth 3+ → append "##" or "###" + token.text to current section content
paragraph → append token.text (with private markers for em/strong) to content
list → append "- " or "1. " prefixed items
link → append link.text only (drop URL)
image → drop
html_comment → drop
code_block → append plain text, no markers
```

- [ ] **Step 2: Write failing tests for each mapping rule** — 20+ unit tests, one per mapping rule + 5 edge cases (nested lists, code inside list, link inside heading, etc.)

- [ ] **Step 3: Implement adapter**

```javascript
import { marked } from "marked";
export function parseMarkdownTokens(md) {
  const tokens = marked.lexer(md);
  const sections = [];
  let current = { type: "chapter", title: null, number: null, content: "" };
  for (const token of tokens) {
    // walk per spec
  }
  if (current.content || current.title) sections.push(current);
  return sections;
}
```

- [ ] **Step 4: Run unit tests, commit**

### Task 3.3: Replace `parseMarkdownStructured` call site

**Files:** `src/utils/detectStructure.js`, `src/workers/parser.worker.js`, `src/utils/index.js`, `src/config/constants.js`

- [ ] **Step 1: Add feature-flag gate** in `src/config/constants.js`:
```javascript
export const USE_MARKDOWN_TOKEN_PARSER = true; // flip to false to rollback
```

- [ ] **Step 2: Dispatch in worker**

```javascript
import { parseMarkdownTokens } from "../utils/parseMarkdownTokens.js";
case "parse-md":
  return USE_MARKDOWN_TOKEN_PARSER
    ? parseMarkdownTokens(text)
    : parseMarkdownStructured(text);
```

- [ ] **Step 3: Run full eval against all MD fixtures** — `npm run eval`. Many fixture goldens will change (intentional improvement). Inspect each diff. Update goldens for genuine improvements; revisit adapter for regressions.

- [ ] **Step 4: Update goldens, commit**

### Task 3.4: Remove `preprocessMarkdown` (post-soak)

After running the flag in production for ≥3 days with no regression, delete `preprocessMarkdown` and the old code path. Until then, both paths coexist.

---

# Phase 4 — HTML Walker Bug Fixes

**Why now:** HTML parser is the cleanest of the three — no library swap, just point fixes.

### Task 4.1: Strip `<script>` and `<style>` before walking

**Files:** `src/utils/detectStructure.js`, `tests/utils/parseHTMLStructured.test.js`

- [ ] **Step 1: Failing test** with `<script>alert('x')</script>` in body — expect the script source NOT to appear in any section's `content`.

- [ ] **Step 2: Fix** — after `DOMParser.parseFromString(html, "text/html")`:
```javascript
doc.querySelectorAll("script, style, noscript, iframe, object, embed").forEach(el => el.remove());
```

- [ ] **Step 3: Run, commit**

### Task 4.2: Map h1-h6 (not just h1-h3)

**Files:** `src/utils/detectStructure.js`

- [ ] **Step 1: Failing test** with h4-only fixture — Document with `<h4>Chapter 1</h4>` ... `<p>Body</p>` ... `<h4>Chapter 2</h4>` ... `<p>Body</p>` should produce 2 sections, not 1.

- [ ] **Step 2: Change `/^h[1-3]$/` to `/^h[1-6]$/`**

- [ ] **Step 3: Run, commit**

### Task 4.3: Detect `<parsererror>` nodes

**Files:** `src/utils/detectStructure.js`

- [ ] **Step 1: Failing test** with malformed HTML — expect `parseHTMLStructured` to throw a specific error, not return empty sections.

- [ ] **Step 2: Add check after parseFromString**

```javascript
if (doc.querySelector("parsererror")) {
  throw new Error("Invalid HTML: document is malformed");
}
```

- [ ] **Step 3: Run, commit**

### Task 4.4: Harmonize section type to `"chapter"`

**Files:** `src/utils/detectStructure.js`

- [ ] **Step 1: Failing test** asserting parseHTMLStructured emits `type: "chapter"` (currently emits `"section"`).

- [ ] **Step 2: Change, update goldens, commit**

---

# Phase 5 — Plain-Text Confidence Scoring + Edit Chapters UI

**Why last:** Highest risk for fake-precision (R2). Needs eval data from Phase 0+1 to ground threshold tuning. Build the feature behind a flag.

### Task 5.1: Design pass for Edit Chapters UI

**Files:** (design only — produces `docs/architecture/EDIT_CHAPTERS_UI.md`)

- [ ] **Step 1: Run `/frontend-design` with a brief** — editorial reading-app pattern, non-blocking, reversible. Kindle/Calibre as references. Sidebar drawer vs modal vs inline reader overlay. Should pair with the existing chapter dropdown in the reader top bar.

- [ ] **Step 2: Pick the design, write the spec**

### Task 5.2: Add confidence-scoring scaffold to `detectTextStructure`

**Files:** `src/utils/detectStructure.js`, `tests/utils/detectTextStructure.test.js`

- [ ] **Step 1: Failing test** asserting `detectTextStructure` returns `{ sections, confidence }` (Note: this is a contract change — update PARSER_CONTRACT.md to reflect the new shape, and the renderer to read `confidence` for the new UI.)

- [ ] **Step 2: Implement composite scoring**

```javascript
function scoreConfidence(sections, fullText) {
  let score = 1.0;
  const reasons = [];

  // Heading-count outlier
  const expectedRange = wordCountToChapterRange(fullText.length);
  if (sections.length < expectedRange.min || sections.length > expectedRange.max) {
    score -= 0.25;
    reasons.push("heading_count_outlier");
  }

  // Content-size variance (Gini coefficient)
  const sizes = sections.map(s => s.content.length);
  const gini = computeGini(sizes);
  if (gini > 0.7) {
    score -= 0.20;
    reasons.push("content_size_imbalanced");
  }

  // Sentence-like headings (likely false positives)
  const sentenceLike = sections.filter(s => looksLikeSentence(s.title)).length;
  if (sentenceLike / sections.length > 0.3) {
    score -= 0.30;
    reasons.push("heading_looks_like_sentence");
  }

  // Lexical-overlap heuristic INTENTIONALLY EXCLUDED in v1 (codex Q3 warning)
  // — adjacent fiction chapters have low overlap; adjacent technical sections high.

  return { score: Math.max(0, score), reasons };
}
```

- [ ] **Step 3: Apply thresholds**

```javascript
const { score, reasons } = scoreConfidence(sections, fullText);
if (score < 0.55) {
  return { sections: [{ type: "document", title: null, number: 1, content: fullText }], confidence: { score, reasons } };
}
return { sections, confidence: { score, reasons } };
```

- [ ] **Step 4: Run eval, measure improvement** — Re-run `npm run eval` and inspect the new metrics. **Acceptance:** ≥2× improvement on `false_split_rate` AND `missed_chapter_rate` vs baseline. If not, return to Phase 0 fixtures and add more bait files OR revisit scoring.

- [ ] **Step 5: Commit**

### Task 5.3: Render the uncertainty badge

**Files:** `src/components/DocumentBody.jsx` (or wherever the chapter dropdown lives — `src/App.jsx` top bar)

- [ ] **Step 1: Add a non-blocking badge** — When `confidence.score < 0.70`, show a small `tmt-pill` next to the chapter dropdown: `Detection uncertain · Edit chapters`. Click → opens the editor.

- [ ] **Step 2: Tests + commit**

### Task 5.4: Build the Edit Chapters editor

**Files:** `src/components/EditChaptersEditor.jsx` (Radix Dialog), `src/App.jsx`

- [ ] **Step 1: UI scaffold** per Phase 5 Task 5.1 design — show the document text with detected chapter breaks; let the user click any paragraph to toggle "this is a chapter heading"; live preview of new chapter list.

- [ ] **Step 2: Persist overrides** — Save user's chapter map per `docId` (see Task 5.5 for schema).

- [ ] **Step 3: Re-parse with override applied on next open** — When opening a doc that has overrides, skip confidence scoring and apply the user's chapter map directly.

### Task 5.5: Schema: `recent_docs.chapter_overrides`

**Files:** `supabase/migrations/20260601000000_chapter_overrides.sql`

- [ ] **Step 1: Migration**

```sql
ALTER TABLE public.recent_docs
  ADD COLUMN chapter_overrides jsonb DEFAULT NULL;
COMMENT ON COLUMN public.recent_docs.chapter_overrides IS
  'User-edited chapter break map for this doc. NULL = use parser output. Shape: { breaks: [paragraphIdx, ...] }';
```

- [ ] **Step 2: Update cloudDocs.js to load/save**

- [ ] **Step 3: Apply migration, commit**

### Task 5.6: Final eval gate

- [ ] **Step 1: Re-run `npm run eval`** — Verify ≥2× improvement on metrics. If yes, Phase 5 ships. If no, escalate — review fixture corpus, scoring heuristics, or threshold values.

---

# Phase 6 — Deferred Per-Parser Deeper Fixes

**Not in v1.** Enumerated here so they're tracked.

### PDF (separate plan)
- Multi-column layout detection (currently scrambles)
- Encrypted PDF early detection + clear error
- Scanned-image-only PDF detection + "needs OCR" message
- Header/footer threshold tuning (currently strips body text on short docs)
- Hyphenation: handle soft-hyphen U+00AD + en-dash linebreaks
- Tables: extract row/cell structure (currently flat)
- `doc.destroy()` cleanup to release pdf.js memory

### EPUB (separate plan)
- EPUB3 nav.xhtml TOC support
- Inline semantic preservation (em, strong, code, sub/sup) — needs renderer-contract extension
- Image-only chapter detection + placeholder rendering
- Path normalization for spine entries with `../` paths
- Encoding detection (non-UTF-8 EPUBs, BOM handling)

### DOCX (separate plan)
- `mammoth` styleMap for Heading 1/2/3/4/5/6
- List + table semantic preservation
- Track-changes detection + accept/reject UI
- `.doc` binary detection + clear error
- Image extraction
- Footnote/endnote rendering

---

# Phase 7 — ML-Assisted Parsing (v2, shelved by default — hard burden of proof to activate)

**Default: NOT built.** Phase 7 only activates if the eval harness PROVES that Phase 5's regex + confidence-scoring approach genuinely fails on a meaningful slice of real user uploads, AND the user-editable "Edit Chapters" UI from Phase 5 is insufficient to recover that quality.

## Activation bar (per project policy 2026-05-18)

User-set policy: *"Phase 7 should not be implemented unless it is 100% necessary to assist in the quality of our app being able to intake document uploads, parsing, and then outputting the document to the user in the way that is expected from us as an app product."*

The bar is therefore:
- Phase 5 eval metrics show ≥10% of real-user uploads land at confidence <0.45 AND those uploads are NOT recoverable via "Edit Chapters" (i.e. the user can't reasonably fix them)
- User feedback consistently reports the parsing quality as the dominant complaint after Phase 5 ships
- "Maybe it would be a bit better" is NOT sufficient justification
- Document this with concrete numbers in a written go/no-go memo BEFORE building anything in Phase 7

## Privacy constraint (absolute, per project policy 2026-05-18)

**No user document content leaves their device.** This is a hard constraint, not a tradeoff.

The original "Supabase Edge → Anthropic API" sketch is **off the table.** It violates the policy by definition — chapter detection inherently requires the model to see the text. There is no way to send "just the structural metadata" of a document and still get useful chapter detection back.

Acceptable architectures (if Phase 7 ever activates):

**Option A — In-browser ML classifier**
- Use `transformers.js` (Hugging Face) or `web-llm` to run a small model entirely client-side
- Model artifact (~10-50 MB) downloads once, caches in browser. After first load, fully offline.
- Inference happens in a Web Worker so the main thread stays responsive
- No network call after the initial model download; document text never leaves the device
- Cost: bundle/cache footprint, slower on low-end devices, ceiling capped by what a small model can do

**Option B — Improved deterministic heuristics (preferred fallback)**
- No ML at all. More sophisticated regex grammars, statistical features (paragraph-position scoring, font/whitespace signals when format provides them, document-length-based heading-count priors)
- Trivially private — same execution model as Phase 5, just smarter heuristics
- Lower ceiling than ML, but no bundle cost and no inference latency
- This is the **preferred path** if Phase 5 turns out insufficient — try harder heuristics before reaching for a model

**Option C (explicitly rejected):** ANY architecture that sends document content to a third-party API. This includes Anthropic, OpenAI, any cloud LLM provider, and any Supabase Edge function that proxies to one. Off the table by policy.

## Implementation outline (if activated, Option A path)

1. **Selection step:** evaluate 2-3 candidate small models on the same eval-harness fixtures used in Phase 0. Document the chosen model's accuracy ceiling vs Phase 5 baseline.
2. **Bundle integration:** load model lazily (only when a low-confidence document is opened); cache in IndexedDB or via the browser's Cache API.
3. **Worker integration:** model inference runs in `parser.worker.js` or a dedicated `ml.worker.js` so it never blocks the reader.
4. **Opt-in toggle:** account settings adds "Improve chapter detection with on-device AI" — off by default. User explicitly opts in even though the data never leaves their device, so they consciously choose to download the model bundle.
5. **Result caching:** keyed per document hash, stored in localStorage or IndexedDB, so re-opens are instant.
6. **Telemetry boundary:** if any telemetry/usage data is collected, it includes only anonymized success/failure flags (was inference confident? did the user accept the result?). NEVER the document content or chapter titles.

## Implementation outline (if activated, Option B path)

1. Expand the heuristic grammar to handle more legitimate heading variants (foreign-language, ornamental, numbered-clause, etc.)
2. Add statistical features that the current scoring doesn't use: relative paragraph length around candidate headings, font-size signals when format supplies them, paragraph-position priors
3. Add format-specific specialists — heuristics tuned per format (e.g. plain-text-of-OCR vs plain-text-of-novel)
4. Re-run eval harness, measure improvement. If it clears the activation bar, no Phase 7 model needed.

---

## Execution Handoff

This plan is now saved to `docs/superpowers/plans/2026-05-18-parser-rewrite.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task with two-stage review; fastest iteration
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`; batch execution with checkpoints

Phases 0-2 are safe to run on the new `parser-rewrite` branch immediately (no UI changes, no production risk). Phase 3+ touches `App.jsx` and the worker — slower, behind feature flags.
