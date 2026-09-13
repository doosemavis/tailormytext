# Parser Fixture Corpus

Documents used by the eval harness (`scripts/eval-parsers.mjs`) and parser
unit tests. Every fixture is paired with an entry in `MANIFEST.json` that
names the failure mode being exercised.

## Curation rules

1. **No copyrighted content.** Fixtures must be public domain (Project
   Gutenberg, government documents, MIT-licensed samples) or synthetic
   text written for the test.
2. **Every fixture file MUST have a MANIFEST.json entry.** Orphan files
   are deleted on the next `npm run eval` pass.
3. **Every MANIFEST entry MUST name the failure mode being tested.**
   "Generic happy-path EPUB" is acceptable; "novel.epub" is not.
4. **Format-specific subdirectories** — `pdf/`, `epub/`, `docx/`, `txt/`,
   `md/`, `html/`. The eval harness routes by directory, not extension.
5. **Synthetic fixtures are preferred for testing specific failure modes.**
   They're easier to commit, version, and reproduce than full real-world
   documents. Save real-world documents for happy-path coverage.

## Fixture-missing flag

Some MANIFEST entries are `"fixtureMissing": true`. This means the failure
mode is known and documented, but the actual binary file (PDF/EPUB/DOCX
mostly) hasn't been sourced yet. The eval harness skips these with a
warning. Adding a real fixture file in the right subdirectory and removing
the flag in MANIFEST.json fills the gap.

## Adding a new fixture

1. Drop the file in the right subdirectory.
2. Add a MANIFEST.json entry with `format`, `purpose`, `expectedSections`,
   and `expectedFailureMode` (if the current parser handles it wrong).
3. Run `npm run eval -- --update` to regenerate the golden output.
4. Inspect the new golden in `tests/fixtures/golden/<name>.json`. If it
   matches what the parser SHOULD produce, commit. If not, fix the
   parser first.

## Goldens

`tests/fixtures/golden/<fixture-name>.json` is the expected parser output
for each fixture. Goldens are checked in. The eval harness diffs each
parse against its golden and fails on drift.

Intentional parser-behavior changes require `npm run eval -- --update`
to regenerate goldens, and the diff must be committed in the same change
as the parser modification.
