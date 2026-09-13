#!/usr/bin/env node
//
// Generates synthetic DOCX fixtures for the parser eval harness using
// the `docx` library. All content is authored here — no third-party
// material, so expectedSections counts stay correct as the parser evolves.
//
// Run: node scripts/gen-docx-fixtures.mjs

import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "tests/fixtures/docx");
mkdirSync(OUT, { recursive: true });

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ text, heading: level });
}

function body(text) {
  return new Paragraph({ children: [new TextRun(text)] });
}

async function buildDoc(name, paragraphs) {
  const doc = new Document({ sections: [{ children: paragraphs }] });
  const buf = await Packer.toBuffer(doc);
  writeFileSync(join(OUT, name), buf);
  console.log(`wrote ${name} (${buf.length} bytes)`);
}

// Fixture 1: 3 chapters with h1 titles. Happy path.
await buildDoc("clean-3-chapter.docx", [
  heading("Chapter One"),
  body("The first chapter sets the scene with quiet, conversational prose."),
  heading("Chapter Two"),
  body("The second chapter introduces conflict and a complication that demands resolution."),
  heading("Chapter Three"),
  body("The third chapter raises the stakes and points toward the resolution."),
]);

// Fixture 2: 5 chapters with mixed body paragraphs.
await buildDoc("longer-5-chapter.docx", [
  heading("Prologue"),
  body("A short prologue that hints at what is to come."),
  heading("Departure"),
  body("The protagonist leaves home for the first time, uncertain but determined."),
  body("A second paragraph in the departure chapter; longer documents have multi-paragraph chapters."),
  heading("The Encounter"),
  body("An unexpected meeting changes the course of the journey entirely."),
  heading("Return"),
  body("The road home is longer than the road out."),
  heading("Epilogue"),
  body("Years later, the events of that summer are remembered differently by each who lived them."),
]);

// Fixture 3: single-section doc (no chapter headings).
await buildDoc("no-headings.docx", [
  body("This document has no headings. The parser should fall back to extractRawText and emit a single section."),
  body("A second paragraph in the same body, just to make sure the whole text survives the fallback path."),
  body("A third paragraph for good measure."),
]);

// Fixture 4: mixed h1/h2/h3 — verify h2/h3 stay inline (h1 is the chapter break).
await buildDoc("mixed-heading-levels.docx", [
  heading("Chapter A"),
  body("Body paragraph for chapter A."),
  heading("A Subsection", HeadingLevel.HEADING_2),
  body("Body inside the subsection."),
  heading("A Sub-Subsection", HeadingLevel.HEADING_3),
  body("Body inside the sub-subsection."),
  heading("Chapter B"),
  body("Body paragraph for chapter B."),
]);

// Fixture 5: many short chapters.
const many = [];
for (let i = 1; i <= 8; i++) {
  many.push(heading(`Section ${i}`));
  many.push(body(`Short body for section ${i}.`));
}
await buildDoc("many-short-chapters.docx", many);
