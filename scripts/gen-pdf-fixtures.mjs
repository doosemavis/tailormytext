#!/usr/bin/env node
//
// Generates synthetic PDF fixtures for the parser eval harness using
// pdf-lib. All content is authored here — no third-party material, so
// expectedSections counts stay correct as parsePDF evolves.
//
// Run: node scripts/gen-pdf-fixtures.mjs

import { PDFDocument, StandardFonts } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "tests/fixtures/pdf");
mkdirSync(OUT, { recursive: true });

async function buildPdf(name, pages) {
  const doc = await PDFDocument.create();
  const titleFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await doc.embedFont(StandardFonts.Helvetica);

  for (const { title, body } of pages) {
    const page = doc.addPage([612, 792]); // US Letter
    let y = 720;
    if (title) {
      page.drawText(title, { x: 72, y, font: titleFont, size: 24 });
      y -= 40;
    }
    // Hand-wrapped paragraph text. pdf-lib doesn't do automatic wrapping.
    const words = body.split(/\s+/);
    let line = "";
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (bodyFont.widthOfTextAtSize(trial, 12) > 468) {
        page.drawText(line, { x: 72, y, font: bodyFont, size: 12 });
        y -= 18;
        line = word;
      } else {
        line = trial;
      }
    }
    if (line) page.drawText(line, { x: 72, y, font: bodyFont, size: 12 });
  }

  const buf = await doc.save();
  writeFileSync(join(OUT, name), buf);
  console.log(`wrote ${name} (${buf.length} bytes)`);
}

// Denser body text helper. parsePDF's heuristics expect realistic prose
// per page (running headers, font tiers, paragraph wrapping). A single
// short sentence per page is below the threshold the chrome-stripping
// pipeline was tuned for. Use a multi-paragraph body so every page has
// enough text for the font-tier delta + median-line-gap to settle.
const DENSE_BODY = (subject) =>
  `${subject} The protagonist moved through the unfamiliar landscape with a quiet attentiveness, noting every shift in light and weather as if reading a language she half understood. The path narrowed as it climbed, then widened again where a small stream cut across it. ` +
  `She paused at the crossing to drink, cupping cold water in her hands. The taste was clean and stony, almost mineral. She did not know yet that the choice of which fork to take would shape the next several days. The map she carried was old, drawn long before the floods of the previous spring, and several landmarks had already moved or vanished entirely. ` +
  `By the time she reached the ridge, the sun had dropped behind the higher peaks and the valley below sat in a soft blue shadow. Lights began to appear in the windows of the houses scattered across the slope, and somewhere a dog barked. She found a flat place to sit and watched the village come awake to evening.`;

// Fixture 1: 3 pages, each with a distinct chapter title heading.
await buildPdf("clean-3-page.pdf", [
  { title: "Chapter One", body: DENSE_BODY("The first chapter sets the scene with quiet, conversational prose.") },
  { title: "Chapter Two", body: DENSE_BODY("The second chapter introduces conflict and a complication.") },
  { title: "Chapter Three", body: DENSE_BODY("The third chapter brings events to a head and offers resolution.") },
]);

// Fixture 2: 5 pages with chapter-style headings.
await buildPdf("longer-5-page.pdf", [
  { title: "Prologue", body: DENSE_BODY("A short prologue that hints at what is to come.") },
  { title: "Departure", body: DENSE_BODY("She leaves home for the first time, uncertain but determined.") },
  { title: "The Encounter", body: DENSE_BODY("An unexpected meeting changes the course of the journey entirely.") },
  { title: "Return", body: DENSE_BODY("The road home is longer than the road out.") },
  { title: "Epilogue", body: DENSE_BODY("Years later, the events of that summer are remembered differently.") },
]);

// Fixture 3: single-page PDF.
await buildPdf("single-page.pdf", [
  { title: "The Whole Document", body: DENSE_BODY("Some PDFs ship as a single page.") },
]);

// Fixture 4: PDF with no title headings — body-only pages.
await buildPdf("no-titles.pdf", [
  { title: "", body: DENSE_BODY("First page of an untitled PDF.") },
  { title: "", body: DENSE_BODY("Second page of the same untitled document.") },
]);
