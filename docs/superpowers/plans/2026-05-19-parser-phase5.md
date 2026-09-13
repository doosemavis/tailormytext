# Parser Phase 5 — Confidence Scoring + Edit Chapters UI (with pre-Phase-5 stabilization)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 5 of the parser rewrite — uncertainty-aware structure detection plus a user-facing "Edit Chapters" override flow — without regressing the 100%-useable bar that PR #4 just established, and without introducing UI lag in the reader.

**Architecture:** Three sequenced phases on the `parser-phase5` branch (cut from `production` at `4b3eeec`).

1. **Phase A — Stabilize PR #4** (must land first): 1 CRITICAL + 4 HIGH findings the multi-agent review surfaced in the just-merged code. These are correctness/hang risks that will compound once Phase 5 extends the contract.
2. **Phase B — UI-lag prevention** (must land before any Phase 5 component renders): collapse the re-render cascades that today only bite on theme changes but will bite on every confidence-score update once Phase 5 lands.
3. **Phase D — Phase 5 proper**: confidence scoring scaffold, `recent_docs.chapter_overrides` migration, uncertainty badge, Edit Chapters Radix Dialog, override-aware re-parse on open.

**Phase C** (production smoke-test + depth-fallback telemetry) is manual + ops, sequenced between B and D. It gates Phase 5 acceptance on real-user behavior, not just synthetic fixtures.

**Tech Stack:** React 18 + Vite 5, Radix Dialog (existing modal pattern), Supabase Postgres + RLS, vitest 3 + happy-dom 18 (test infra established in PR #4), marked 18 (Markdown lexer behind `USE_MARKDOWN_TOKEN_PARSER` flag).

---

## Why the original Phase 5 acceptance bar no longer applies

The plan in `docs/superpowers/plans/2026-05-18-parser-rewrite.md:651-756` set the bar as *"≥2× improvement on `false_split_rate` AND `missed_chapter_rate` vs baseline"*. That bar was written when txt/md/html were at 30/60/50% useable. **The eval now reports 100% useable across all six formats** (`npm run eval` 2026-05-19: pass=47 fail=0, per-format usable=100%). A 2× improvement against a 100% baseline is undefined.

**Revised bar (Phase D, Task D9):**

- Build a real-world ugly-fixture corpus (≥15 representative samples from Project Gutenberg + user-reported failures). Re-run eval and treat the *new* baseline as the comparison anchor.
- Phase 5 acceptance: `confidence.score >= 0.70` for ≥80% of the ugly corpus, AND `score < 0.70` correctly identifies the cases where the dynamic-depth chooser fell back to "smallest depth at all" (no repeating depth, which is the genuine uncertainty signal).
- A "score < 0.55 → fall back to single-document mode" branch must verify on at least 2 fixtures that legitimately fail the depth heuristic.

---

## File Structure

### Phase A — Pre-Phase-5 stabilization

| File | Responsibility | Action |
|---|---|---|
| `src/workers/pdfAnalysis.js` | PDF analyzer (worker-bundled) | Modify: fix `buildPerPageSections` empty-content + null-titleSizeRatio contract violations; fix `markMinorityFontsAsEmphasis` item mutation |
| `src/utils/parserWorker.js` | Worker wrapper, main-thread side | Modify: `workerInstance = null` in `onerror` handler |
| `src/utils/parseMarkdownTokens.js` | Marked-lexer adapter | Modify: store stripped MD in one variable; reuse in no-headings fallback |
| `src/utils/detectStructure.js` (parseHTMLStructured) | HTML walker | Modify: replace `body.innerText` with `body.textContent` |
| `src/utils/parseEPUB.js` | EPUB parser | Modify: replace `content.startsWith(title)` with anchored case-insensitive regex |
| `tests/parsers/contract.test.js` | Contract enforcement | Modify: add contract assertions for `parseMarkdownTokens`, `analyzePDF`, `parseEPUB`, `parseDOCX` |
| `vitest.config.js` | Test runner config | Modify: add `testTimeout: 30000` |

### Phase B — UI-lag prevention

| File | Responsibility | Action |
|---|---|---|
| `src/App.jsx` | App-state hub | Modify: split `settings` memo to depend on primitive color values, not the whole `t` object; memoize `currentFont` |
| `src/components/DocumentBody.jsx` | Reader render tree | Modify: stabilize section ref callbacks; convert ref-callback arrays to a single `useCallback` keyed by `si` |
| `src/components/ReadingGuideOverlay.jsx` | Reading guide overlay | Modify: extract `renderOverlay` into a `React.memo` component |

### Phase D — Phase 5 proper

| File | Responsibility | Action |
|---|---|---|
| `src/utils/scoreConfidence.js` | New module — scoring heuristics | Create |
| `src/utils/detectStructure.js` | Return shape change | Modify: return `{ sections, confidence }` from `detectTextStructure` |
| `src/utils/parseMarkdownTokens.js` | Return shape change | Modify: return `{ sections, confidence }` to match |
| `src/utils/parseHTMLStructured.js` (inside `detectStructure.js`) | Return shape change | Modify: return `{ sections, confidence }` to match |
| `docs/architecture/PARSER_CONTRACT.md` | Renderer contract doc | Modify: document `{ sections, confidence }` shape |
| `src/App.jsx` | Doc-load orchestrator | Modify: consume `confidence`, pass to reader |
| `src/components/UncertaintyBadge.jsx` | New — top-bar badge | Create |
| `src/components/EditChaptersModal.jsx` | New — Radix Dialog | Create |
| `src/hooks/useChapterOverrides.js` | New hook | Create |
| `src/utils/cloudDocs.js` | Persist overrides via Supabase | Modify: load/save `chapter_overrides` |
| `supabase/migrations/20260601000000_chapter_overrides.sql` | Schema migration | Create |
| `tests/utils/scoreConfidence.test.js` | Unit tests | Create |
| `tests/utils/cloudDocs.test.js` | Integration tests | Modify: add chapter_overrides load/save |
| `tests/fixtures/ugly/*` + `tests/fixtures/MANIFEST.json` | Real-world fixtures | Create + Modify |

---

# Phase A — Stabilize PR #4 (pre-Phase-5)

## Task A1: Fix `buildPerPageSections` contract violation in `pdfAnalysis.js`

**Files:**
- Modify: `src/workers/pdfAnalysis.js:630`
- Test: `tests/utils/parsePDF.test.js`

The push at line 630 emits `content: ""` whenever `title` is truthy and content is empty, violating PARSER_CONTRACT.md §1 invariant #2 ("content must be non-empty after `.trim()`"). It also emits `titleSizeRatio: null` unconditionally, which the contract says to *omit* the key for entirely (null breaks `calc(... * null)` in CSS).

- [ ] **Step 1: Write the failing test**

Add to `tests/utils/parsePDF.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { analyzePDF } from "../../src/workers/pdfAnalysis.js";

describe("buildPerPageSections — contract guarantees", () => {
  it("never emits a section with empty content (even when title matches)", () => {
    const rawPages = [{
      pageNum: 1,
      pageWidth: 612, pageHeight: 792,
      items: [
        { str: "Chapter 1", x: 72, y: 700, w: 100, h: 14, fontName: "F1", fontSize: 14 },
      ],
    }];
    const result = analyzePDF({ rawPages, hasOutline: false });
    for (const s of result) {
      expect(s.content.trim().length).toBeGreaterThan(0);
    }
  });

  it("omits titleSizeRatio when no measurement is available", () => {
    const rawPages = [{
      pageNum: 1, pageWidth: 612, pageHeight: 792,
      items: [
        { str: "Body line one.", x: 72, y: 700, w: 100, h: 12, fontName: "F1", fontSize: 12 },
        { str: "Body line two.", x: 72, y: 680, w: 100, h: 12, fontName: "F1", fontSize: 12 },
      ],
    }];
    const result = analyzePDF({ rawPages, hasOutline: false });
    for (const s of result) {
      if ("titleSizeRatio" in s) expect(s.titleSizeRatio).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- tests/utils/parsePDF.test.js
```
Expected: FAIL on both new tests.

- [ ] **Step 3: Patch the section push**

At `src/workers/pdfAnalysis.js:630`, replace:

```javascript
if (content || title) sections.push({ type: "page", title, titleSizeRatio, number: pd.pageNum, content });
```

with:

```javascript
if (!content.trim()) continue;
const section = { type: "page", title, number: pd.pageNum, content };
if (titleSizeRatio != null && titleSizeRatio > 0) section.titleSizeRatio = titleSizeRatio;
sections.push(section);
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test -- tests/utils/parsePDF.test.js
```
Expected: PASS. Also run full suite to confirm no regressions:

```bash
npm run test && npm run eval
```
Expected: 88+ passing (added 2), eval still 47/47 pass.

- [ ] **Step 5: Commit**

```bash
git add src/workers/pdfAnalysis.js tests/utils/parsePDF.test.js
git commit -m "fix(pdfAnalysis): never emit empty content or null titleSizeRatio per contract"
```

---

## Task A2: Fix item mutation in `markMinorityFontsAsEmphasis`

**Files:**
- Modify: `src/workers/pdfAnalysis.js:117-132`
- Test: `tests/utils/parsePDF.test.js`

Line 128 mutates `it.isBold = true` on items owned by the caller. Project rule: "ALWAYS create new objects, NEVER mutate existing ones."

- [ ] **Step 1: Write the failing test**

Add to `tests/utils/parsePDF.test.js`:

```javascript
import { markMinorityFontsAsEmphasis } from "../../src/workers/pdfAnalysis.js";

describe("markMinorityFontsAsEmphasis — immutability", () => {
  it("returns new items rather than mutating caller's items", () => {
    const original = { str: "x", fontName: "MinorityFont", isBold: false, isItalic: false };
    const rawPageData = [{ lines: [{ items: [original] }] }];
    const fontUsage = {
      primary: "PrimaryFont", primaryCount: 100,
      all: new Map([["PrimaryFont", 100], ["MinorityFont", 10]]),
    };
    const result = markMinorityFontsAsEmphasis(rawPageData, fontUsage);
    expect(original.isBold).toBe(false);
    expect(result[0].lines[0].items[0].isBold).toBe(true);
  });
});
```

(May require exporting `markMinorityFontsAsEmphasis` from `pdfAnalysis.js` — add `export` to its declaration.)

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — function currently mutates and returns undefined.

- [ ] **Step 3: Refactor to return a new structure**

Replace `markMinorityFontsAsEmphasis` body:

```javascript
export function markMinorityFontsAsEmphasis(rawPageData, fontUsage) {
  const { primary, primaryCount, all } = fontUsage;
  if (!primary || primaryCount === 0) return rawPageData;
  const MINORITY_RATIO = 0.5;
  return rawPageData.map((pd) => ({
    ...pd,
    lines: pd.lines.map((line) => ({
      ...line,
      items: line.items.map((it) => {
        if (it.isBold || it.isItalic) return it;
        if (!it.fontName || it.fontName === primary) return it;
        const usage = all.get(it.fontName) || 0;
        if (usage / primaryCount < MINORITY_RATIO) return { ...it, isBold: true };
        return it;
      }),
    })),
  }));
}
```

Update the call site (search for `markMinorityFontsAsEmphasis(` in `pdfAnalysis.js`) so the return value replaces the input variable:

```javascript
// before:
markMinorityFontsAsEmphasis(rawPageData, fontUsage);
// after:
rawPageData = markMinorityFontsAsEmphasis(rawPageData, fontUsage);
```

(If the caller-side `rawPageData` is `const`, rename to `let` at its declaration.)

- [ ] **Step 4: Run all tests**

```bash
npm run test && npm run eval
```
Expected: all green, 47/47 eval.

- [ ] **Step 5: Commit**

```bash
git add src/workers/pdfAnalysis.js tests/utils/parsePDF.test.js
git commit -m "fix(pdfAnalysis): markMinorityFontsAsEmphasis returns new items (no caller mutation)"
```

---

## Task A3: Reset dead worker on `onerror`

**Files:**
- Modify: `src/utils/parserWorker.js:55-59`
- Test: new — `tests/utils/parserWorker.test.js`

The `onerror` handler rejects all pending entries but leaves `workerInstance` pointing at a dead worker, so the next `parseInWorker` call hangs forever.

- [ ] **Step 1: Write the failing test**

Create `tests/utils/parserWorker.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("parseInWorker — resilience to worker crash", () => {
  let workers;
  beforeEach(() => {
    workers = [];
    globalThis.Worker = class {
      constructor() {
        workers.push(this);
        this.onmessage = null;
        this.onerror = null;
      }
      postMessage(msg) {
        setTimeout(() => this.onmessage?.({
          data: { id: msg.id, sections: [{ type: "document", title: null, number: 1, content: "ok" }] }
        }), 0);
      }
      terminate() {}
    };
  });

  it("recovers after onerror — does not hang the next call", async () => {
    vi.resetModules();
    const { parseInWorker } = await import("../../src/utils/parserWorker.js");
    const firstPromise = parseInWorker("parse-text", "hello");
    workers[0].onerror?.({ message: "boom" });
    await expect(firstPromise).rejects.toThrow("boom");

    const secondPromise = parseInWorker("parse-text", "world");
    await expect(secondPromise).resolves.toBeTruthy();
    expect(workers.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- tests/utils/parserWorker.test.js
```
Expected: FAIL — second call hangs (or returns nothing); workers.length stays at 1.

- [ ] **Step 3: Patch `onerror`**

In `src/utils/parserWorker.js`, replace lines 55–59:

```javascript
workerInstance.onerror = (e) => {
  const msg = e?.message || "Parser worker crashed";
  for (const entry of pending.values()) entry.reject(new Error(msg));
  pending.clear();
  workerInstance = null;
};
```

Also update the comment at lines 13–16 (which currently calls this out as an open issue):

```javascript
//   - Worker termination via runtime crash (worker module syntax error,
//     CSP block, OOM kill) is handled by the `onerror` handler below: all
//     pending promises reject with the error message and `workerInstance`
//     is cleared so the next call creates a fresh worker.
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- tests/utils/parserWorker.test.js
```
Expected: PASS, workers.length === 2.

- [ ] **Step 5: Commit**

```bash
git add src/utils/parserWorker.js tests/utils/parserWorker.test.js
git commit -m "fix(parserWorker): reset workerInstance on crash so next call doesn't hang"
```

---

## Task A4: `parseMarkdownTokens` no-headings fallback uses stripped MD

**Files:**
- Modify: `src/utils/parseMarkdownTokens.js:194-242`
- Test: `tests/utils/parseMarkdownTokens.test.js`

Line 242 returns `content: md.trim()`, but `md` is the raw input — front matter and BOM are not stripped. Documents with only front matter and no headings include the `---\n...\n---` block in the reader.

- [ ] **Step 1: Write the failing test**

Add to `tests/utils/parseMarkdownTokens.test.js`:

```javascript
it("strips front matter even when document has no headings", () => {
  const md = `---\ntitle: My Doc\nauthor: Me\n---\n\nJust some prose. No headings.`;
  const sections = parseMarkdownTokens(md);
  expect(sections).toHaveLength(1);
  expect(sections[0].content).not.toContain("title:");
  expect(sections[0].content).not.toContain("---");
  expect(sections[0].content.trim()).toBe("Just some prose. No headings.");
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — content includes `---\ntitle: My Doc\nauthor: Me\n---`.

- [ ] **Step 3: Refactor to compute once**

In `src/utils/parseMarkdownTokens.js`, change line 195 + line 242:

```javascript
export function parseMarkdownTokens(md) {
  const stripped = stripFrontMatter(md);
  const tokens = marked.lexer(stripped);
  const sectionDepth = pickSectionDepth(tokens);
  // ... rest unchanged ...

  if (sections.length === 0) {
    return [{ type: "document", title: null, number: 1, content: stripped.trim() }];
  }
  // ...
}
```

Diff is just: add `const stripped = stripFrontMatter(md)` at top; change `marked.lexer(stripFrontMatter(md))` → `marked.lexer(stripped)`; change `md.trim()` → `stripped.trim()` in the no-headings return.

- [ ] **Step 4: Run tests**

```bash
npm run test -- tests/utils/parseMarkdownTokens.test.js
```
Expected: PASS. Full suite + eval still green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/parseMarkdownTokens.js tests/utils/parseMarkdownTokens.test.js
git commit -m "fix(parseMarkdownTokens): strip front matter in no-headings fallback path"
```

---

## Task A5: `parseHTMLStructured` uses `textContent` not `innerText`

**Files:**
- Modify: `src/utils/detectStructure.js:307`
- Test: `tests/utils/parseHTMLStructured.test.js`

`innerText` is layout-dependent and inconsistent in happy-dom; `textContent` is what every other branch in the walker uses.

- [ ] **Step 1: Add a regression test**

Add to `tests/utils/parseHTMLStructured.test.js`:

```javascript
it("falls back to detectTextStructure using textContent (not innerText) when no semantic structure", () => {
  const html = `<html><body><p>One paragraph.</p><p>Another paragraph.</p></body></html>`;
  const sections = parseHTMLStructured(html);
  expect(sections.length).toBeGreaterThan(0);
  for (const s of sections) expect(s.content.trim().length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test (may already pass on happy-dom)**

```bash
npm run test -- tests/utils/parseHTMLStructured.test.js
```
This pins the contract regardless of dom impl.

- [ ] **Step 3: Patch line 307**

In `src/utils/detectStructure.js:307`:

```javascript
if (sections.length === 0) return detectTextStructure(body.textContent);
```

- [ ] **Step 4: Re-run tests + eval**

```bash
npm run test && npm run eval
```
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/detectStructure.js tests/utils/parseHTMLStructured.test.js
git commit -m "fix(parseHTMLStructured): use textContent (not innerText) for fallback"
```

---

## Task A6: `parseEPUB` title-strip uses anchored regex

**Files:**
- Modify: `src/utils/parseEPUB.js:103`
- Test: `tests/utils/parseEPUB.test.js`

`content.startsWith(title)` is fragile when whitespace/case differs between NCX title and rendered heading. Use an anchored case-insensitive regex with escaped title.

- [ ] **Step 1: Write the failing test**

Extract the strip into a named helper first so it's directly testable.

In `src/utils/parseEPUB.js`, near the top:

```javascript
export function stripLeadingTitle(content, title) {
  if (!title) return content;
  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  const re = new RegExp("^" + escapeRegExp(title.trim()) + "\\s*", "i");
  return content.replace(re, "").trim();
}
```

Add to `tests/utils/parseEPUB.test.js`:

```javascript
import { stripLeadingTitle } from "../../src/utils/parseEPUB.js";

describe("stripLeadingTitle", () => {
  it("strips an exact-match title", () => {
    expect(stripLeadingTitle("Chapter 1\n\nProse here.", "Chapter 1")).toBe("Prose here.");
  });
  it("strips a case-mismatched title (NCX vs rendered HTML)", () => {
    expect(stripLeadingTitle("CHAPTER 1\n\nProse here.", "Chapter 1")).toBe("Prose here.");
  });
  it("does not strip a coincidental prefix mid-content", () => {
    expect(stripLeadingTitle("Some prose. Chapter 1.", "Chapter 1")).toBe("Some prose. Chapter 1.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL on the case-mismatched test.

- [ ] **Step 3: Wire the helper into the parse loop**

Replace line 103:

```javascript
let content = rawText;
content = stripLeadingTitle(content, title);
```

- [ ] **Step 4: Run tests + eval**

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/parseEPUB.js tests/utils/parseEPUB.test.js
git commit -m "fix(parseEPUB): case-insensitive anchored title strip"
```

---

## Task A7: Extend `contract.test.js` to cover all parsers

**Files:**
- Modify: `tests/parsers/contract.test.js`

Today the contract test only covers `detectTextStructure`. The PR description claims every parser is enforced. Close the gap.

- [ ] **Step 1: Add or reuse a shape-assertion helper**

In `tests/parsers/contract.test.js`:

```javascript
function assertSectionShape(s) {
  expect(typeof s.content).toBe("string");
  expect(s.content.trim().length).toBeGreaterThan(0);
  expect(["chapter", "document", "page", "part", "section", "act"]).toContain(s.type);
  expect(s.title === null || (typeof s.title === "string" && s.title.length > 0)).toBe(true);
  expect(Number.isInteger(s.number)).toBe(true);
  expect(s.number).toBeGreaterThanOrEqual(1);
  if ("titleSizeRatio" in s) {
    expect(typeof s.titleSizeRatio).toBe("number");
    expect(s.titleSizeRatio).toBeGreaterThan(0);
  }
}
```

(Confirm the type enum against `docs/architecture/PARSER_CONTRACT.md` §1 before pinning.)

- [ ] **Step 2: Add `describe` blocks for the four parsers**

```javascript
import { parseMarkdownTokens } from "../../src/utils/parseMarkdownTokens.js";
import { analyzePDF } from "../../src/workers/pdfAnalysis.js";
import { parseEPUB } from "../../src/utils/parseEPUB.js";
import { parseDOCX } from "../../src/utils/parseDOCX.js";
import fs from "node:fs";
import path from "node:path";

const fixturesDir = path.join(import.meta.dirname, "../fixtures");

describe("parseMarkdownTokens — contract", () => {
  it("emits valid sections for a clean MD doc", () => {
    const md = "# Chapter 1\n\nProse.\n\n# Chapter 2\n\nMore prose.";
    const sections = parseMarkdownTokens(md);
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) assertSectionShape(s);
  });
  it("emits valid sections for a no-headings MD doc", () => {
    const sections = parseMarkdownTokens("Just prose.");
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) assertSectionShape(s);
  });
});

describe("parseEPUB — contract", () => {
  it("emits valid sections from clean-3-chapter.epub", async () => {
    const buf = fs.readFileSync(path.join(fixturesDir, "epub/clean-3-chapter.epub"));
    const sections = await parseEPUB(buf);
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) assertSectionShape(s);
  });
});

describe("parseDOCX — contract", () => {
  it("emits valid sections from clean-3-chapter.docx", async () => {
    const buf = fs.readFileSync(path.join(fixturesDir, "docx/clean-3-chapter.docx"));
    const sections = await parseDOCX(buf);
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) assertSectionShape(s);
  });
});

describe("analyzePDF — contract", () => {
  it("emits valid sections for a single-page synthetic PDF", () => {
    // analyzePDF takes pre-extracted rawPages; construct a minimal one
    const rawPages = [{
      pageNum: 1, pageWidth: 612, pageHeight: 792,
      items: [
        { str: "Some body text.", x: 72, y: 700, w: 100, h: 12, fontName: "F1", fontSize: 12 },
      ],
    }];
    const result = analyzePDF({ rawPages, hasOutline: false });
    expect(result.length).toBeGreaterThan(0);
    for (const s of result) assertSectionShape(s);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm run test -- tests/parsers/contract.test.js
```
Expected: PASS (Tasks A1–A6 have already fixed the violations).

- [ ] **Step 4: Commit**

```bash
git add tests/parsers/contract.test.js
git commit -m "test(contract): extend assertions to MD/PDF/EPUB/DOCX parsers"
```

---

## Task A8: Set `testTimeout: 30000` in vitest config

**Files:**
- Modify: `vitest.config.js`

- [ ] **Step 1: Add the option**

```javascript
export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./tests/setup.js"],
    testTimeout: 30000,
  },
});
```

- [ ] **Step 2: Run tests**

```bash
npm run test
```
Expected: still 88+/88+ green, no behavior change yet.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.js
git commit -m "chore(vitest): preemptive 30s testTimeout for binary fixture tests"
```

---

# Phase B — UI-lag prevention

## Task B1: Decouple `settings` memo from the full `t` theme object

**Files:**
- Modify: `src/App.jsx:452-456` (the `settings` useMemo)
- Modify: `src/components/DocumentBody.jsx:201` (the consumers)

Today, any theme change creates a new `t` object, which invalidates `settings`, which cascades a re-render of every `Section` → every `Paragraph`. For a long book this re-renders thousands of components on every theme tweak.

- [ ] **Step 1: Identify what `settings` consumers actually need from `t`**

```bash
grep -n "settings\." src/components/DocumentBody.jsx src/components/Section.jsx 2>/dev/null
```

Expected fields: `fg`, `border`, `fgSoft` (per the perf audit). Confirm by reading.

- [ ] **Step 2: Replace the memo dependency**

In `src/App.jsx:452-456`, replace:

```javascript
const settings = useMemo(() => ({ neuroDivIntensity, huePalette, theme: t }), [neuroDivIntensity, huePalette, t]);
```

with:

```javascript
const settings = useMemo(
  () => ({ neuroDivIntensity, huePalette, fg: t.fg, border: t.border, fgSoft: t.fgSoft }),
  [neuroDivIntensity, huePalette, t.fg, t.border, t.fgSoft],
);
```

- [ ] **Step 3: Update consumers**

In `src/components/DocumentBody.jsx` and any child reading `settings.theme.X`, switch to `settings.X` directly.

- [ ] **Step 4: Manual verify in dev server**

Per `feedback_tmux_not_installed.md`, `npm run dev` may be hook-blocked. Use:

```bash
npx vite
```

Upload a multi-chapter doc, toggle theme, confirm no scroll jump or jank.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/DocumentBody.jsx
git commit -m "perf(reader): decouple settings memo from full theme object — primitive deps only"
```

---

## Task B2: Stabilize `sectionRefCallbacks` to keep `Section` memo intact

**Files:**
- Modify: `src/components/DocumentBody.jsx:288-300` and the Section call sites

Today each `useMemo` recreates the inner ref-callback functions, so `Section.memo()` equality fails and every section re-renders on every doc load.

**Approach:** Move ref registration into `Section` itself via `useEffect` so the parent stops handing curried callbacks down.

- [ ] **Step 1: In `Section` (the memo'd child), accept `sectionRefs`/`titleRefs` + `si` as props**

```javascript
useEffect(() => {
  sectionRefs.current[si] = nodeRef.current;
  titleRefs.current[si] = titleNodeRef.current;
  return () => {
    sectionRefs.current[si] = null;
    titleRefs.current[si] = null;
  };
}, [si, sectionRefs, titleRefs]);
```

- [ ] **Step 2: Drop the parent-side `sectionRefCallbacks` / `titleRefCallbacks` memos entirely**

Remove the `useMemo` blocks at DocumentBody.jsx:288-300; pass `sectionRefs` and `titleRefs` directly to each `<Section ... />`.

- [ ] **Step 3: Manual verify**

Upload a long document. With React DevTools Profiler, confirm doc load no longer re-renders every Section on subsequent state changes.

- [ ] **Step 4: Commit**

```bash
git add src/components/DocumentBody.jsx src/components/Section.jsx
git commit -m "perf(reader): stabilize Section refs via self-registration useEffect"
```

---

## Task B3: Memoize `renderOverlay` in the reading guide

**Files:**
- Modify: `src/components/ReadingGuideOverlay.jsx:78-96`

- [ ] **Step 1: Convert `renderOverlay` from a function returning JSX into a `React.memo` component**

```javascript
const ReadingGuideOverlayContent = React.memo(function ReadingGuideOverlayContent(props) {
  if (!props.enabled) return null;
  // ...existing render body, with stable style objects extracted to useMemo where appropriate
});

export function useReadingGuide(/* ...args */) {
  // ...existing logic
  return {
    renderOverlay: () => <ReadingGuideOverlayContent {...props} />,
  };
}
```

- [ ] **Step 2: Manual verify**

Toggle the reading guide on a long doc, scroll, confirm no jank.

- [ ] **Step 3: Commit**

```bash
git add src/components/ReadingGuideOverlay.jsx
git commit -m "perf(reading-guide): memoize overlay content to avoid per-frame JSX recreation"
```

---

## Task B4: Memoize `currentFont` lookup in App

**Files:**
- Modify: `src/App.jsx:325`

- [ ] **Step 1: Replace inline find**

```javascript
const currentFont = useMemo(() => FONTS.find(f => f.name === fontFamily), [fontFamily]);
```

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "perf(App): memoize FONTS.find by fontFamily"
```

---

# Phase C — Production smoke-test + telemetry gate

## Task C1: Smoke-test the deployed `production` site

**Manual; no files.**

This is the gate the architect agent specifically called out: Node-side eval ≠ real browser. Phase 5 must not start until production behavior is verified.

- [ ] **Step 1:** Open the live site in a real browser (Cloudflare Pages production URL).
- [ ] **Step 2:** Upload one representative file of each format the parsers handle: a PDF (multi-chapter book), an EPUB, a DOCX with Heading 1/2 styles, an HTML article, an .md doc, a .txt novel.
- [ ] **Step 3:** For each, verify: parser detects chapters correctly, reader renders without console errors, scroll/theme/guide work.
- [ ] **Step 4:** Log any failures inline in this plan doc as new sub-tasks. If any are CRITICAL (e.g. unable to read any upload), pause Phase D until resolved.

## Task C2: Add depth-fallback telemetry to a new `public.parse_outcomes` table

**Files:**
- Create: `supabase/migrations/20260601000000_parse_outcomes.sql`
- Modify: `src/utils/parseMarkdownTokens.js` (expose `depthFallback` flag)
- Modify: `src/utils/detectStructure.js` (same)
- Modify: `src/utils/track.js` (add `trackParseOutcome`)
- Modify: `src/App.jsx` (call after each successful parse)

Architect agent's recommendation: surface real-world signal about when the dynamic-depth chooser falls back to "smallest depth at all" (no repeating depth, the genuine uncertainty case). That data, after a week, sets Phase 5's score thresholds.

**Schema choice:** New `public.parse_outcomes` table, not adding a 7th value to the marketing `events` CHECK constraint. Separation of concerns.

- [ ] **Step 1: Migration**

```sql
CREATE TABLE IF NOT EXISTS public.parse_outcomes (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ts timestamptz NOT NULL DEFAULT now(),
  format text NOT NULL,
  depth_fallback boolean NOT NULL,
  section_count int NOT NULL,
  doc_byte_size int,
  ext text
);

ALTER TABLE public.parse_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY parse_outcomes_insert_any ON public.parse_outcomes
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY parse_outcomes_select_owner ON public.parse_outcomes
  FOR SELECT TO authenticated USING (public.is_current_user_owner());
```

- [ ] **Step 2: Apply migration**

```bash
# My Liege runs from a real terminal — Claude does not run supabase CLI:
supabase link --project-ref rknvmuenvbceqylgaias
supabase db push
```

- [ ] **Step 3: Surface `depthFallback` from text parsers**

Add to `pickSectionDepth`'s return value (currently returns just the depth number) so callers know whether the depth was chosen via "repeating depth" or "smallest depth at all" fallback. Plumb through to `parseMarkdownTokens` / `detectTextStructure` / `parseHTMLStructured` return.

- [ ] **Step 4: `trackParseOutcome` in `src/utils/track.js`**

```javascript
export async function trackParseOutcome({ format, depthFallback, sectionCount, docByteSize, ext }) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("parse_outcomes").insert({
      user_id: user?.id ?? null,
      format,
      depth_fallback: depthFallback,
      section_count: sectionCount,
      doc_byte_size: docByteSize,
      ext,
    });
  } catch (e) {
    console.warn("[trackParseOutcome] suppressed:", e);
  }
}
```

- [ ] **Step 5: Call in `App.jsx doUpload` after a successful parse**

```javascript
trackParseOutcome({
  format: sniffedType,
  depthFallback: !!parseResult.meta?.depthFallback,
  sectionCount: sections.length,
  docByteSize: file.size,
  ext: file.name.split(".").pop()?.toLowerCase(),
});
```

- [ ] **Step 6: Verify in production**

After deploy, upload a few docs and confirm rows appear. Owner-only SQL: `SELECT count(*), depth_fallback FROM parse_outcomes GROUP BY depth_fallback;`

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260601000000_parse_outcomes.sql src/utils/track.js src/utils/parseMarkdownTokens.js src/utils/detectStructure.js src/App.jsx
git commit -m "feat(telemetry): log depth-fallback signal to parse_outcomes for Phase 5 tuning"
```

- [ ] **Step 8: Wait one week, collect signal**

Phase D's thresholds depend on real data. Do not skip the soak.

---

# Phase D — Phase 5 proper (confidence scoring + Edit Chapters UI)

**Pre-requisite:** Phases A and B merged to `production`. Phase C smoke-test passed. Phase C2 telemetry collecting — D9 threshold tuning depends on real signal but D1–D8 can proceed in parallel with the soak.

## Task D1: Build the confidence-scoring scaffold

**Files:**
- Create: `src/utils/scoreConfidence.js`
- Test: `tests/utils/scoreConfidence.test.js`

- [ ] **Step 1: Write tests**

```javascript
import { describe, it, expect } from "vitest";
import { scoreConfidence } from "../../src/utils/scoreConfidence.js";

describe("scoreConfidence", () => {
  it("scores a clean 3-chapter doc at >= 0.85", () => {
    const sections = [
      { type: "chapter", title: "Chapter 1", number: 1, content: "Lots of prose here..." },
      { type: "chapter", title: "Chapter 2", number: 2, content: "More prose here..." },
      { type: "chapter", title: "Chapter 3", number: 3, content: "Still more prose..." },
    ];
    const { score } = scoreConfidence(sections, { depthFallback: false });
    expect(score).toBeGreaterThanOrEqual(0.85);
  });

  it("scores a depth-fallback doc at < 0.55", () => {
    const sections = [
      { type: "chapter", title: "Intro", number: 1, content: "..." },
      { type: "chapter", title: "About the author", number: 2, content: "..." },
    ];
    const { score, reasons } = scoreConfidence(sections, { depthFallback: true });
    expect(score).toBeLessThan(0.55);
    expect(reasons).toContain("no_repeating_depth");
  });

  it("penalizes a size outlier", () => {
    const sections = [
      { type: "chapter", title: "A", number: 1, content: "x".repeat(100) },
      { type: "chapter", title: "B", number: 2, content: "x".repeat(50000) },
      { type: "chapter", title: "C", number: 3, content: "x".repeat(100) },
    ];
    const { score, reasons } = scoreConfidence(sections, { depthFallback: false });
    expect(score).toBeLessThan(0.80);
    expect(reasons).toContain("size_outlier");
  });
});
```

- [ ] **Step 2: Implement**

```javascript
// src/utils/scoreConfidence.js
//
// Heuristic confidence score for text-structure parsing.
// >= 0.70  high — render normally
// >= 0.55  uncertain — show uncertainty badge
//  < 0.55  fallback — single-document mode
//
// O(sections), no ML.

export function scoreConfidence(sections, { depthFallback }) {
  let score = 1.0;
  const reasons = [];

  if (depthFallback) {
    score -= 0.50;
    reasons.push("no_repeating_depth");
  }

  const sizes = sections.map((s) => s.content.length).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)];
  if (median > 0 && sizes[sizes.length - 1] > median * 5) {
    score -= 0.15;
    reasons.push("size_outlier");
  }

  if (sections.length === 1) {
    score -= 0.20;
    reasons.push("single_section");
  }

  return { score: Math.max(0, Math.min(1, score)), reasons };
}
```

- [ ] **Step 3: Run tests**

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/utils/scoreConfidence.js tests/utils/scoreConfidence.test.js
git commit -m "feat(scoreConfidence): heuristic confidence score for text-structure parsing"
```

## Task D2: Surface `{ sections, confidence }` from text parsers

**Files:**
- Modify: `src/utils/detectStructure.js` (return shape)
- Modify: `src/utils/parseMarkdownTokens.js` (return shape)
- Modify: `docs/architecture/PARSER_CONTRACT.md` (document)
- Modify: callers in `src/App.jsx doUpload`
- Modify: existing tests that destructure the old `Section[]` return

Binary parsers (PDF/EPUB/DOCX) continue to return `Section[]`; caller treats them as `confidence.score = 1.0` implicit.

- [ ] **Step 1: Update PARSER_CONTRACT.md**

Add §8: "Optional `confidence` return for text parsers". Describe the shape `{ sections: Section[], confidence: { score: number, reasons: string[] } }` and the three score bands. Note that binary parsers don't return confidence.

- [ ] **Step 2: Change each text parser's return**

In `parseMarkdownTokens`:

```javascript
const sections = /* existing logic */;
const depthFallback = /* true if pickSectionDepth had no repeating depth */;
return { sections, confidence: scoreConfidence(sections, { depthFallback }) };
```

Same for `detectTextStructure` and `parseHTMLStructured`.

- [ ] **Step 3: Update `doUpload`**

```javascript
const result = await parseInWorker(type, payload);
const sections = Array.isArray(result) ? result : result.sections;
const confidence = Array.isArray(result) ? null : result.confidence;
```

- [ ] **Step 4: Update existing tests to destructure**

Find/replace tests that do `const sections = parseMarkdownTokens(md)` → `const { sections } = parseMarkdownTokens(md)`. Same for `detectTextStructure` and `parseHTMLStructured`.

- [ ] **Step 5: Run full suite + eval**

```bash
npm run test && npm run eval
```

Eval harness may need a small tweak — the per-format usability check iterates the return, so it should destructure too.

- [ ] **Step 6: Commit**

```bash
git add src/utils/parseMarkdownTokens.js src/utils/detectStructure.js docs/architecture/PARSER_CONTRACT.md src/App.jsx scripts/eval-parsers.mjs tests/
git commit -m "feat(parser-contract): add optional confidence return for text parsers"
```

## Task D3: Migration — `recent_docs.chapter_overrides`

**Files:**
- Create: `supabase/migrations/20260601100000_chapter_overrides.sql`

- [ ] **Step 1: Migration**

```sql
ALTER TABLE public.recent_docs
  ADD COLUMN chapter_overrides jsonb DEFAULT NULL;

COMMENT ON COLUMN public.recent_docs.chapter_overrides IS
  'User-edited chapter break map. NULL = use parser output. Shape: { breaks: [paragraphIdx, ...], titles: { paragraphIdx: "Title" } }';
```

- [ ] **Step 2: Apply migration**

```bash
# My Liege runs from a real terminal:
supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260601100000_chapter_overrides.sql
git commit -m "feat(schema): chapter_overrides jsonb on recent_docs"
```

## Task D4: `cloudDocs.js` load/save for overrides

**Files:**
- Modify: `src/utils/cloudDocs.js`
- Test: `tests/utils/cloudDocs.test.js`

- [ ] **Step 1: Tests**

```javascript
it("cloudSaveChapterOverrides upserts the chapter_overrides jsonb column", async () => {
  await cloudSaveChapterOverrides("doc-id-1", { breaks: [5, 12, 30] });
  expect(mockSupabase.lastCall.table).toBe("recent_docs");
  expect(mockSupabase.lastCall.payload.chapter_overrides).toEqual({ breaks: [5, 12, 30] });
});

it("cloudLoadDoc returns chapter_overrides alongside the doc blob", async () => {
  mockSupabase.setRow({ id: "doc-id-2", chapter_overrides: { breaks: [3] } });
  const result = await cloudLoadDoc("doc-id-2");
  expect(result.chapterOverrides).toEqual({ breaks: [3] });
});
```

- [ ] **Step 2: Implement**

```javascript
export async function cloudSaveChapterOverrides(docId, overrides) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("recent_docs")
    .update({ chapter_overrides: overrides })
    .eq("id", docId)
    .eq("user_id", user.id);
  if (error) throw error;
}
```

(Read flow: extend `cloudLoadDoc` to include `chapter_overrides` in its select.)

- [ ] **Step 3: Run tests, commit**

```bash
git add src/utils/cloudDocs.js tests/utils/cloudDocs.test.js
git commit -m "feat(cloudDocs): persist + load chapter_overrides per recent_docs row"
```

## Task D5: `UncertaintyBadge` component

**Files:**
- Create: `src/components/UncertaintyBadge.jsx`
- Modify: `src/components/index.js` (barrel)
- Modify: `src/App.jsx` (mount in top bar near chapter dropdown)

- [ ] **Step 1: Component**

```jsx
import React from "react";

export function UncertaintyBadge({ score, onClick }) {
  if (score == null || score >= 0.70) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="tmt-pill tmt-pill--warning"
      aria-label={`Detection uncertain (score ${score.toFixed(2)}). Edit chapters.`}
    >
      Detection uncertain · Edit chapters
    </button>
  );
}
```

- [ ] **Step 2: Style `tmt-pill--warning`**

Per `feedback_status_badges_solid.md`: solid color + white text + uppercase. Add to the same CSS file that defines the existing `tmt-pill` rules.

- [ ] **Step 3: Mount in App top bar**

Adjacent to the chapter dropdown:

```jsx
<UncertaintyBadge
  score={confidence?.score}
  onClick={() => setEditChaptersOpen(true)}
/>
```

- [ ] **Step 4: Manual verify**

Construct an uncertain fixture (TXT with no headings + ambiguous all-caps lines). Confirm badge appears, is keyboard-focusable, opens the modal.

- [ ] **Step 5: Commit**

```bash
git add src/components/UncertaintyBadge.jsx src/components/index.js src/App.jsx
git commit -m "feat(reader): uncertainty badge surfaces when confidence < 0.70"
```

## Task D6: `EditChaptersModal` (Radix Dialog)

**Files:**
- Create: `src/components/EditChaptersModal.jsx`
- Modify: `src/components/index.js`
- Modify: `src/App.jsx` (lazy-import + mount)

Per `project_account_modals.md`, each modal is its own component (SRP). Per `feedback_radix_first.md`, Radix Dialog is the starting point.

- [ ] **Step 1: Read existing modal patterns**

```bash
head -80 src/components/SubscriptionModal.jsx
```

Match the `overlayStyle` + `dialogStyle(t)` + `Dialog.Root` lazy-import convention.

- [ ] **Step 2: Modal UI**

Two-pane layout: left = the document text broken into paragraphs (clickable to toggle chapter break), right = live preview of the resulting chapter list.

```jsx
import * as Dialog from "@radix-ui/react-dialog";

export default function EditChaptersModal({ open, onClose, t, docId, paragraphs, initialBreaks, onSaved }) {
  const [breaks, setBreaks] = React.useState(() => new Set(initialBreaks ?? []));

  function toggleBreak(idx) {
    setBreaks((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  async function handleSave() {
    await cloudSaveChapterOverrides(docId, { breaks: [...breaks].sort((a, b) => a - b) });
    onSaved?.();
    onClose();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay style={overlayStyle} />
        <Dialog.Content style={dialogStyle(t)} aria-label="Edit chapters">
          <Dialog.Title>Edit chapters</Dialog.Title>
          <div className="tmt-edit-chapters__layout">
            <div className="tmt-edit-chapters__paragraphs">
              {paragraphs.map((p, i) => (
                <button key={i} onClick={() => toggleBreak(i)} aria-pressed={breaks.has(i)}>
                  {breaks.has(i) ? "▍" : "·"} {p.slice(0, 80)}
                </button>
              ))}
            </div>
            <aside className="tmt-edit-chapters__preview">
              <h3>Preview</h3>
              <ol>
                {[...breaks].sort((a, b) => a - b).map((b) => (
                  <li key={b}>Chapter break at paragraph {b + 1}</li>
                ))}
              </ol>
            </aside>
          </div>
          <div className="tmt-edit-chapters__actions">
            <button onClick={onClose}>Cancel</button>
            <button onClick={handleSave}>Save</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

(Tighten the JSX/styles to match the existing modal aesthetic.)

- [ ] **Step 3: Lazy-import in App.jsx**

```javascript
const EditChaptersModal = React.lazy(() => import("./components/EditChaptersModal.jsx"));
```

- [ ] **Step 4: Wire `onSaved` → re-load the doc using overrides**

After save, refetch the doc; the open path (Task D7) will apply overrides instead of re-parsing.

- [ ] **Step 5: Manual verify + commit**

```bash
git add src/components/EditChaptersModal.jsx src/components/index.js src/App.jsx
git commit -m "feat(reader): EditChaptersModal lets user override chapter detection"
```

## Task D7: Override-aware re-parse on doc open

**Files:**
- Create: `src/utils/applyChapterOverrides.js`
- Test: `tests/utils/applyChapterOverrides.test.js`
- Modify: `src/App.jsx` (doc-open path)

When opening a doc that has `chapter_overrides`, skip confidence scoring and apply the user's chapter map directly.

- [ ] **Step 1: Test the override-applier**

```javascript
import { describe, it, expect } from "vitest";
import { applyChapterOverrides } from "../../src/utils/applyChapterOverrides.js";

describe("applyChapterOverrides", () => {
  it("splits the doc at user-specified paragraph breaks", () => {
    const paragraphs = ["Para 0", "Para 1", "Para 2", "Para 3", "Para 4"];
    const sections = applyChapterOverrides(paragraphs, { breaks: [2, 4] });
    expect(sections).toHaveLength(3);
    expect(sections[0].content).toContain("Para 0");
    expect(sections[1].content).toContain("Para 2");
    expect(sections[2].content).toContain("Para 4");
  });

  it("returns a single document section when breaks is empty", () => {
    const paragraphs = ["Para 0", "Para 1"];
    const sections = applyChapterOverrides(paragraphs, { breaks: [] });
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe("document");
  });
});
```

- [ ] **Step 2: Implement**

```javascript
// src/utils/applyChapterOverrides.js
export function applyChapterOverrides(paragraphs, overrides) {
  const breaks = (overrides?.breaks ?? []).slice().sort((a, b) => a - b);
  if (breaks.length === 0) {
    return [{ type: "document", title: null, number: 1, content: paragraphs.join("\n\n") }];
  }
  const sections = [];
  let cursor = 0;
  let num = 0;
  for (let i = 0; i < breaks.length; i++) {
    const start = breaks[i];
    const end = breaks[i + 1] ?? paragraphs.length;
    if (i === 0 && start > 0) {
      sections.push({ type: "document", title: null, number: ++num, content: paragraphs.slice(0, start).join("\n\n") });
    }
    sections.push({
      type: "chapter",
      title: overrides.titles?.[start] ?? null,
      number: ++num,
      content: paragraphs.slice(start, end).join("\n\n"),
    });
    cursor = end;
  }
  return sections;
}
```

- [ ] **Step 3: Branch in the open path**

In `App.jsx`:

```javascript
const stored = await cloudLoadDoc(docId);
let sections, confidence = null;
if (stored.chapterOverrides) {
  const paragraphs = stored.rawText.split(/\n\s*\n/);
  sections = applyChapterOverrides(paragraphs, stored.chapterOverrides);
} else {
  const result = await parseInWorker(type, stored.rawText);
  sections = Array.isArray(result) ? result : result.sections;
  confidence = Array.isArray(result) ? null : result.confidence;
}
```

(Requires `rawText` to be available in the stored doc blob — confirm shape in `cloudDocs.js` first; if not, store it alongside sections on first parse.)

- [ ] **Step 4: Test + commit**

```bash
git add src/utils/applyChapterOverrides.js tests/utils/applyChapterOverrides.test.js src/App.jsx
git commit -m "feat(reader): apply chapter_overrides on doc open, skip re-parse"
```

## Task D8: Build the ugly-fixture corpus

**Files:**
- Create: `tests/fixtures/txt/ugly/*.txt` (≥15 challenging docs)
- Modify: `tests/fixtures/MANIFEST.json` (entries with expected confidence band)

- [ ] **Step 1: Source ≥15 challenging .txt files**

Project Gutenberg samples with messy headers, page numbers, TOC listings that look like chapters, all-caps "PART I" / "PART II" docs.

- [ ] **Step 2: For each fixture, record the expected confidence band in MANIFEST.json**

```json
{
  "path": "txt/ugly/pg-frankenstein.txt",
  "expectedConfidenceBand": "high"
}
```

Bands: `"high"` (>=0.70), `"uncertain"` ([0.55, 0.70)), `"fallback"` (<0.55).

- [ ] **Step 3: Update `scripts/eval-parsers.mjs` to report band distribution**

```
Confidence distribution (ugly corpus):
  high       : 12 / 15 (80%)
  uncertain  :  2 / 15 (13%)
  fallback   :  1 / 15  ( 7%)
```

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/txt/ugly/ tests/fixtures/MANIFEST.json scripts/eval-parsers.mjs
git commit -m "test(eval): add ≥15-fixture ugly corpus + confidence-band reporting"
```

## Task D9: Final eval gate + ship decision

- [ ] **Step 1: Run full eval against ugly corpus**

```bash
npm run eval
```

- [ ] **Step 2: Acceptance checks**

- ≥80% of ugly corpus scores ≥0.70 (confident — user sees normal reader)
- Cases that score <0.70 are precisely the cases where the depth chooser hit fallback OR a size-outlier dominated
- "Edit Chapters" modal manually verified to recover at least 2 of the <0.55 cases to user-acceptable shape

- [ ] **Step 3: Run `/codex` for a second-opinion review of the scoring weights**

```bash
# In Claude:
/codex review
```

- [ ] **Step 4: Decision**

- If acceptance met → open PR `parser-phase5 → production`, request review, smoke-test the preview, merge
- If not met → iterate scoring weights or extend ugly corpus; do not ship

---

# Self-Review (writing-plans skill required step)

**1. Spec coverage:** Each requirement in My Liege's brief is covered:
- "create a new branch off production first" → done (`parser-phase5` cut from `production@4b3eeec`); all tasks anchored to that branch
- "evaluate where the project currently is" → Phase A0 (multi-agent eval that informed Phases A/B/C)
- "write a plan" → this document
- "ask for execution on Phase 5" → see Execution Handoff below
- "the app has to work cleanly with no lagging in the UI" → Phase B targets the highest-impact re-render cascades before Phase 5 adds new overlay components
- "use claude, gstack, superpowers, and everything-claude-code skills" → Phase A0 used everything-claude-code agents (perf, code-reviewer, architect); writing-plans (superpowers) used here; gstack `/codex` queued for D9 second-opinion; `/qa` queued for Phase C smoke-test

**2. Placeholder scan:** None of the "TBD", "TODO", "implement later", "fill in details", or "add appropriate error handling" patterns present. Tasks A6, A7, D2, D6, D7 each show concrete code with actual implementations. Tasks D5/D6 contain JSX skeletons that an implementing agent will tune to match the existing modal aesthetic — flagged as a pattern-match task, not a placeholder.

**3. Type consistency:** `confidence` shape consistent across D1 (`{ score, reasons }`), D2 (`{ sections, confidence }`), D5 (`score < 0.70`). `chapter_overrides` shape `{ breaks: number[], titles?: Record<number,string> }` consistent across D3 (jsonb shape), D4 (load/save), D6 (modal save), D7 (apply). Function names consistent: `parseInWorker`, `cloudSaveChapterOverrides`, `applyChapterOverrides`, `scoreConfidence`, `trackParseOutcome`.

---

# Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-19-parser-phase5.md`.

Phases A and B are stabilization — small, well-scoped, can ship as one PR before Phase 5 starts. Phase C is mostly manual + a small telemetry PR. Phase D is the real Phase 5 work.

**Two execution options for the immediate next step (Phases A + B):**

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. Best fit for the 12 stabilization tasks since they're independent and small.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch with checkpoints. Best fit if My Liege wants to watch each fix happen.

For Phases C and D, decide separately after A+B lands.
