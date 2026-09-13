# Parser → Renderer Contract

> **Status:** Authoritative as of 2026-05-18.
> **Source of truth for:** the section-object shape every parser must produce, the private content-body language `DocumentBody` consumes, and the invariants the renderer relies on but does not enforce.
>
> If you're modifying a parser or `DocumentBody.jsx`, read this first. If the contract changes, update this doc in the same commit.

---

## Why this exists

Before this doc, every parser (`parsePDF`, `parseEPUB`, `parseDOCX`, `parseMarkdownStructured`, `detectTextStructure`, `parseHTMLStructured`) independently decided what shape to return. The renderer (`src/components/DocumentBody.jsx`) made best-effort guesses to handle the divergence. When a parser silently emitted a degenerate shape (empty title, whitespace-only content, missing `type`), the renderer either crashed or rendered hollow UI with no error.

The `/codex` adversarial review flagged this as the **#1 risk** of the parser rewrite: changing a producer without a documented contract just shifts the bugs around. This file is the contract. Tests in `tests/parsers/contract.test.js` enforce it.

---

## 1. The `section` object shape

Every parser returns `Section[]` — an array of section objects. A single section:

```typescript
type Section = {
  type: "chapter" | "page" | "section" | "document"; // REQUIRED
  title: string | null;                              // REQUIRED (may be null)
  number: number | null;                             // REQUIRED (may be null)
  content: string;                                   // REQUIRED (non-empty after trim)
  titleSizeRatio?: number;                           // OPTIONAL — PDF parser only
};
```

### Field-by-field

| Field | Required | Allowed values | Renderer behavior |
|---|---|---|---|
| `type` | **Yes** | `"chapter"` (default), `"page"` (PDF per-page), `"section"` (DOCX/HTML — being harmonized to `"chapter"` in Phase 4), `"document"` (single-section fallback) | Drives the chapter-vs-page divider treatment (`isPage = section.type === "page"` at `DocumentBody.jsx:197`). `page` sections get a horizontal-rule + "Page N" label between them; everything else gets a plain divider line. |
| `title` | **Yes** | Non-empty string OR `null` | If `null`, renderer falls back through 3 tiers: (1) first-line chapter-heading regex match, (2) synthesize `Chapter N` or `Page N`. See [Renderer Fallback Chains](#5-renderer-fallback-chains). |
| `number` | **Yes** | Positive integer OR `null` | Used in synthesized titles (`Chapter ${number}`, `Page ${number}`). When `null`, renderer falls back to `si + 1` (the array index). |
| `content` | **Yes** | Non-empty string after `.trim()`. May contain private markers (see [§2](#2-content-body-language)) | Split by `/\n\s*\n/` into paragraphs (`DocumentBody.jsx:232`). Empty/whitespace content renders a phantom chapter heading with zero paragraphs — this is a known anti-state. |
| `titleSizeRatio` | No | Positive number (typically 1.0–3.0) | Used by `DocumentBody.jsx:203` to scale the section heading's font-size relative to body. When absent, renderer falls back to `1.4` for pages, `1.5` for chapters. |

### Invariants the renderer relies on but does NOT enforce

These are silent bugs waiting to happen if a parser violates them:

1. **`sections.length > 0`** — an empty array trips the `hasSections` check at `App.jsx` and falls through to the plain-text-paragraph rendering path. May or may not be a bug depending on intent.
2. **`content.trim() !== ""`** — whitespace-only content renders an empty section under a synthesized title (anti-state).
3. **`title === null` OR `title.trim() !== ""`** — empty-string title (`""`) is NOT the same as `null` and bypasses the synthesis fallback. Pass `null` if you don't have a title; never an empty string.
4. **`type` must be a known value** — anything outside the enum makes `isPage` evaluate to `false` and silently defaults to chapter-style rendering. Add a contract test if you add a new type.
5. **`titleSizeRatio` MUST be a positive finite number when present** — `Infinity`, `NaN`, `-1`, or `null` will crash the `calc(... * ratio)` CSS expression. Omit the key entirely if you don't have a measured value.

---

## 2. Content body language

`section.content` is **not plain text** and **not standard Markdown**. It's a private intermediate format that DocumentBody parses with `splitEmphasis`, `lineToWords`, `groupListBlocks`, and `extractRatio`. Parsers MUST emit this format when they want any of these features; emitting raw Markdown will not work.

### Allowed inline markers

| Marker | Renders as | Notes |
|---|---|---|
| `**bold text**` | `<strong>` | State-machine — toggles on each `**`. Nesting like `**__bold-italic__**` is supported. |
| `__italic text__` | `<em>` | Same state machine as bold; the two flags are independent. |
| Plain text | `<span class="rf-word">word</span>` per word | NeuroDiv mode wraps the leading characters of each word in `<strong>` separately from the emphasis markers above. |

### Allowed block markers

| Block syntax | Renders as | Trigger |
|---|---|---|
| Line starts with `- ` | `<li>` inside `<ul>` | Consecutive `- ` lines are grouped into one `<ul>`. |
| Line starts with `1. ` (or any 1-3 digit number followed by `. `) | `<li>` inside `<ol>` | Consecutive numbered lines are grouped into one `<ol>` with `start` set from the first item's number. |
| Line starts with `## ` | `<h2>` (inline sub-heading) | After per-line ratio extraction. |
| Line starts with `### ` | `<h3>` (inline sub-heading) | After per-line ratio extraction. |
| Other non-empty lines | `<p>` | Default. |

### Optional per-line size ratio

A line can be prefixed with `{r:RATIO}` to set its font-size relative to body:

```
{r:1.45}Some chapter sub-heading
```

Renders the line at `calc(var(--rf-font-size, 18px) * 1.45)`. The PDF parser emits these for outline-derived chapter titles; other parsers currently do not.

The marker must be at the start of the line (`/^\{r:([\d.]+)\}/`). It is consumed by `extractRatio` and stripped before further block-marker detection.

### Paragraph separators

Paragraphs within a section's `content` are separated by **one or more blank lines** (regex: `/\n\s*\n/`). Single newlines do NOT break paragraphs; they break visible lines within a paragraph (each non-empty line within a paragraph block becomes its own `<p>` / `<h2>` / `<h3>` / `<li>` element).

### Things the format does NOT support

| What you might want | Why it doesn't work |
|---|---|
| Raw HTML (`<em>foo</em>`) | Renderer treats it as text. Tags appear literally. |
| Standard Markdown links (`[label](url)`) | Renderer doesn't parse the link syntax; the whole token shows as text. |
| Setext underline headings (`===`/`---` below text) | Not recognized. Use ATX-style `## ` instead. |
| Tables | Not recognized. Flattened to text by the upstream parser; ends up as `<p>` lines. |
| Blockquotes (`> `) | Not recognized. Renders as `<p>` containing the literal `> `. |
| Footnotes | Not recognized. |
| Code fences (` ``` `) | Not recognized at render time. Markdown parsers should drop them or convert to plain text. |
| Strikethrough (`~~text~~`) | Not recognized. |
| Underscores around a single character (`_x_`) | Treated as text — only `__` (double-underscore) toggles italic. |

---

## 3. Per-format parser expectations

| Parser | File | Emits `type` | Sets `title` how | Sets `number` how | Sets `titleSizeRatio` |
|---|---|---|---|---|---|
| **parsePDF** | `src/utils/parsePDF.js` + `src/workers/pdfAnalysis.js` | `"chapter"` (outline-derived) OR `"page"` (per-page fallback) | From PDF outline entry text OR first font-tiered heading on the page; `null` if neither | Outline entry index (chapter) OR page number (page) | YES — measured from font-size relative to body |
| **parseEPUB** | `src/utils/parseEPUB.js` | `"chapter"` | From NCX `navLabel` matched by spine href; else first `<h1>`/`<h2>`/`<h3>` in the chapter XHTML; else `null` | Sequential `chapterNum` from spine order | No |
| **parseDOCX** | `src/utils/parseDOCX.js` | `"section"` (to be harmonized to `"chapter"` in Phase 4) | From `<h1>`/`<h2>`/`<h3>` text content; else `null` (and starts a new section anyway) | Sequential `sectionNum` from flush order | No |
| **parseMarkdownStructured** | `src/utils/detectStructure.js` | `"chapter"` (set by underlying `detectTextStructure`) OR `"document"` (single-section fallback) | From matched chapter regex (`CHAPTER N`, `PART N`, etc.) OR ATX heading after preprocessing | From regex capture group OR sequential | No |
| **detectTextStructure** | `src/utils/detectStructure.js` | `"chapter"` OR `"document"` | From matched chapter-heading regex; `null` for `"document"` type | Decimal/roman from capture group; `null` for `"document"` | No |
| **parseHTMLStructured** | `src/utils/detectStructure.js` | `"section"` (to be harmonized to `"chapter"` in Phase 4) | From `<h1>`/`<h2>`/`<h3>` text content (Phase 4: also `<h4>`-`<h6>`); else `null` | Sequential | No |

---

## 4. Section dispatch in App.jsx

The dispatcher at `src/App.jsx doUpload()` branches on file extension (Phase 2 adds content sniffing). Each branch must produce a `Section[]`. The dispatcher then:

1. Joins `sections.map(s => [s.title, s.content].filter(Boolean).join("\n\n")).join("\n\n")` into `fullText`
2. Guards on `fullText.trim() !== ""` and throws "This file doesn't contain any readable text" if empty
3. Sets `setText(fullText)` and `setDocSections(sections)` for the renderer

**Known gap (silent-failure-hunter finding):** the `fullText.trim()` guard only catches whole-document empty. A section with a non-empty `title` but whitespace-only `content` slips through and produces phantom chapters. Phase 1 fixes this.

---

## 5. Renderer fallback chains

The renderer has three fallback chains that fire when parsers don't provide complete data. Parsers should aim to NOT trigger these — they exist as defensive nets, not as a license to skip fields.

### 5.1 Title fallback (`DocumentBody.jsx:213-230`)

```
section.title set?
├── YES → use it as the heading
└── NO  → check first line of content:
         ├── matches /^(chapter|part|section|act|book|volume)\b/i AND length < 80
         │   → use first line as title, REMOVE it from content
         └── no match
             → synthesize `${section.number ?? si + 1}` as:
                  - "Page N"    if type === "page"
                  - "Chapter N" otherwise
```

**Important:** when fallback tier 2 fires (first-line promotion), the renderer **mutates** the content by removing the first line. Parsers that emit a chapter title both at `title` and as the first content line will see the title rendered twice unless they strip it from content themselves.

### 5.2 Number fallback (synthesized titles only)

When the renderer synthesizes a title (tier 3 above), it uses `section.number || si + 1` — meaning array index + 1 is the final fallback. Parsers don't need to provide `number` if they provide `title`.

### 5.3 Title size fallback (`DocumentBody.jsx:203`)

```
section.titleSizeRatio set?
├── YES → scale heading font-size by that ratio
└── NO  → use:
         - 1.4 if type === "page"
         - 1.5 otherwise (chapter, section, document)
```

---

## 6. Contract-test enforcement

The test at `tests/parsers/contract.test.js` asserts every parser emits a shape conforming to §1 against a minimal fixture per format. If you change the contract here, you must also:

1. Update the test
2. Run `npm run test` — must pass
3. Run `npm run eval` — golden files may need updating; intentional contract changes require `npm run eval -- --update` and a commit explaining the diff

---

## 7. Open questions / future contract changes

These are tracked in `docs/superpowers/plans/2026-05-18-parser-rewrite.md` but flagged here so contract readers see them:

- **`chapter_overrides` integration** — Phase 5 adds user-edited chapter maps stored per `docId`. The renderer will need to honor these overrides; the contract may need an `override?: boolean` flag on sections so the renderer can distinguish parser output from user-edited splits.
- **HTML/DOCX `type` harmonization** — currently `"section"`; Phase 4 changes to `"chapter"` for consistent renderer behavior. After that change, `"section"` becomes a legacy value (still allowed but no parser should emit it).
- **Inline-formatting expansion** — Phase 6 (EPUB deeper fixes) wants to preserve `<em>`, `<strong>`, `<code>`, `<sub>`, `<sup>` from EPUB XHTML. Will need either an extension to the content-body language or a richer-text alternative shape.

---

## 8. Confidence return shape (text parsers only)

**Added Task D2 (Phase 5).** Text parsers return a two-field object instead of a bare `Section[]`:

```typescript
type TextParserResult = {
  sections: Section[];
  confidence: {
    score: number;    // heuristic 0–1 value; higher = more confident structure detection
    reasons: string[]; // tags explaining any score deductions
  };
};
```

Binary parsers (`parsePDF`, `parseEPUB`, `parseDOCX`) continue to return bare `Section[]`.

### Score bands

| Range | Band | UI implication |
|---|---|---|
| ≥ 0.70 | high | Render normally |
| 0.55 – 0.70 | uncertain | Show "Detection uncertain" badge (Task D5) |
| < 0.55 | fallback | Single-document mode (Task D5) |

### Reason tags

| Tag | Meaning |
|---|---|
| `"no_repeating_depth"` | Heading depths exist but none repeat ≥2 times — depth-pick used the smallest-depth fallback, a signal of structural uncertainty. Equivalent to the legacy `depthFallback: true` boolean. |
| `"size_outlier"` | One section is > 5× the median section size — likely a false split or a very uneven document. |
| `"single_section"` | Only one section was detected — no chapter structure found. |

### Consumer notes

- `App.jsx doUpload()` derives the legacy `depthFallback` boolean for `trackParseOutcome` telemetry as `confidence.reasons.includes("no_repeating_depth")` — the `parse_outcomes` table schema is unchanged.
- `parseInWorker` (main-thread wrapper) detects a text-parser result by `confidence !== undefined` and resolves with `{ sections, confidence }`. Binary results resolve with the bare `Section[]`.
- `scripts/eval-parsers.mjs` uses `normalize(result)` which extracts `result.sections` — backward-compatible with both shapes.

---

## 9. Cross-references

Every file in the parser pipeline has a top-of-file comment pointing at this doc. If you find a parser without that comment, add it.

Files touched by this contract:
- `src/components/DocumentBody.jsx` (the renderer)
- `src/utils/parsePDF.js`
- `src/utils/parseEPUB.js`
- `src/utils/parseDOCX.js`
- `src/utils/detectStructure.js`
- `src/workers/parser.worker.js`
- `src/workers/pdfAnalysis.js`
- `src/App.jsx` (the dispatcher)
