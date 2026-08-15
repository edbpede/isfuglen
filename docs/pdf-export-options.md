# Replacing the print-dialog PDF export

Status: recommendation. No implementation in this branch.

## 1. What the current path does

`printNewsletter()` swaps `document.title`, calls `window.print()` and restores the
title on `afterprint`. It produces no file. The user picks a destination in the
browser's print dialog, and the result depends on the browser, the print driver
and which options the user leaves checked — background graphics in particular,
which `print.css` requests via `print-color-adjust: exact` but cannot enforce.

The button is honest about it: `export.pdf` is `"Udskriv eller gem som PDF"` and
`export.pdfHint` is `"Vælg »Gem som PDF« i printdialogen."`.

## 2. The premise worth revisiting

The header comment in `src/lib/export/pdf.ts` frames the choice as:

> A true one-click download would require either rasterising the document — which
> kills selectable text and logo sharpness — or hand-building a typesetter, which
> is weeks of work and a long tail of Danish line-breaking bugs.

The second half no longer holds, because of what the file itself already built.
`paginate()` runs Paged.js and returns finished markup, and `PreviewPane.svelte`
injects it into the live DOM as `.pagedjs_page` elements. By the time the user
can click an export button, the document has **already been typeset by the
browser and already been paginated by Paged.js**. The pages exist as real boxes
with real geometry.

So a one-click export does not need a typesetter. It needs a **painter**: a
transcriber that reads finished geometry out of the DOM and writes the equivalent
PDF drawing operators. Line breaking, hyphenation, justification and page
placement are inputs to that step, not problems it has to solve.

This turns the ranking upside down. Options that re-typeset the document from the
model (pdfmake and friends) have to reproduce a layout the app already has, and
can only ever approximate it. Options that transcribe the existing layout match
the preview by construction, which is exactly what constraint 4 asks for.

## 3. Constraints, restated as pass/fail tests

| #   | Constraint                           | Test                                                                                                                        |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Browser-only, static hosting         | No network call during export; works from `file://`-style static deploy                                                     |
| 2   | Selectable text, no rasterisation    | PDF contains `Tj`/`TJ` text operators and zero full-page `/Subtype /Image` XObjects                                         |
| 3   | Logo stays vector                    | Logo appears as path operators, not an image XObject                                                                        |
| 4   | Matches the Paged.js preview         | Same page count, same line breaks, same box positions as `.pagedjs_page`                                                    |
| 5   | Danish line breaking and hyphenation | `arbejdstidsaftale`, `medarbejderrepræsentant` break where the browser breaks them; `æ ø å Æ Ø Å` round-trip in copied text |

## 4. Options

### Option 1 — Re-typeset from the model with pdfmake

**How it produces the PDF.** Discard the rendered HTML. Walk `NewsletterDoc` and
emit pdfmake's declarative document definition (a JSON tree of blocks, styles and
tables). pdfmake runs its own layout engine over that tree, breaks lines with its
own implementation of the Unicode line-breaking algorithm (UAX #14), paginates
itself, and writes vector text with embedded fonts.

| Constraint         | Verdict                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Browser-only    | Pass. pdfmake is a client-side library.                                                                                                                                                                                                                                                                      |
| 2. Selectable text | Pass. Vector text with embedded fonts, no raster path.                                                                                                                                                                                                                                                       |
| 3. Vector logo     | Fail as-is. pdfmake takes images as PNG/JPEG data URLs; SVG support requires the `svg-to-pdfkit` path and does not cover arbitrary SVG. The existing `scripts/build-logo-png.ts` PNG (already built for the DOCX export) would be the pragmatic input, which rasterises the logo.                            |
| 4. Matches preview | Fail. Two layout engines, two results. Paged.js paginates the preview; pdfmake paginates the export. They will disagree on page breaks, and every widow/orphan and `break-inside: avoid` rule in `paged.css` and `print.css` would have to be re-expressed in pdfmake's vocabulary and kept in sync forever. |
| 5. Danish          | Partial. UAX #14 gives correct word-boundary breaking for Danish. Hyphenation is not built in: it needs a `hyphenationCallback` plus a Danish pattern dictionary (Hyphenopoly/Hypher `da` patterns, roughly 30–50 KB), where the DOM path gets `hyphens: auto` from the browser for free.                    |

**Bundle cost.** 356 KB gzipped for `pdfmake/build/pdfmake` alone, measured. Fonts
are separate: the shipped `vfs_fonts.js` is 836 KB raw and contains Roboto, which
is the wrong typeface — Source Sans 3 and Source Serif 4 would have to be
converted, subset and packed into a custom VFS. Plus a hyphenation dictionary.

**Work to adopt.** Largest of the three. A full second renderer parallel to
`src/lib/render/html.ts`, covering every `nl-*` block type, then permanent
double-maintenance of the layout rules. It also directly contradicts the design
note in `html.ts` that one function produces preview, print and paginated source
so that "the preview matches the export" is a property of the design rather than
a testing burden.

### Option 2 — Transcribe the DOM with `@node-projects/layout2vector`

**How it produces the PDF.** Three stages: walk the live DOM computing paint
order and stacking contexts, reading element boxes with `getBoxQuads()` and text
geometry with `Range.getClientRects()`; flatten to an intermediate representation
of `polygon` / `polyline` / `text` / `image` nodes; hand the IR to a pluggable
writer, one of which emits PDF. Point it at the `.pagedjs_page` elements the
preview already holds and it transcribes the finished pages.

**I ran this against a spike page** (A4 box, Source Sans 3 via `@font-face`, the
real `public/brand/ishoej-kreds18.svg`, Danish copy with `hyphens: auto`), driven
by the repo's own Playwright, and inspected the resulting PDF byte-for-byte.
Results:

- 69 IR nodes, 140 KB PDF, `%PDF-1.4`.
- **Zero image XObjects, zero `Do` operators, 7099 path operators.** The logo is
  native PDF vector paths, via `svgToVector: true`.
- **Seven text-showing operators, one per rendered line**, each with its own `Td`
  position. The three lines of the test paragraph landed at y = 661.4789,
  645.7289, 629.9789 — spaced exactly 15.75 pt, which is 1.5 × 10.5 pt, the
  browser's own line height. The browser's line breaking is transcribed, not
  recomputed.
- Danish characters survived: `dr\370ftet`, `medarbejderrepr\346sentanternes`,
  `\306blerne`, `\370llet`, `\345ret` — correct WinAnsi encoding of ø, æ, Æ.

Two defects showed up, both in fonts:

- **By default it embeds nothing.** The font objects were `/BaseFont /Helvetica`
  and `/Helvetica-Bold`, `/Subtype /Type1`, zero `/FontFile`. The text is real and
  selectable but drawn in the wrong typeface.
- **With fonts supplied it distorts glyph widths.** Passing a converted TTF via
  `customFonts` produced a correct `/Subtype /Type0` CIDFontType2 with `/FontFile`
  and a `/ToUnicode` CMap — searchable, copyable, correct. But every text run also
  carried a horizontal-scaling operator: `104.6221 Tz`, `104.8378 Tz`,
  `104.8873 Tz`, `104.908 Tz`, `105.3178 Tz`, `112.6323 Tz`, `120.3769 Tz`. The
  writer stretches glyphs to force each run to the width the browser measured. The
  120 % run is the bold `Vigtigt:` label rendered from a regular-weight font.

The bold case is a real constraint on any option that embeds fonts here.
`@fontsource-variable/source-sans-3` ships **variable woff2 only**. Converting one
with `fonteditor-core` produced a 43 KB TTF with 324 glyphs and `fvar` dropped —
a single static instance. PDF has no variable-font instancing, so weights must be
baked at build time, one static face per weight.

| Constraint         | Verdict                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Browser-only    | Pass. Pure client-side; the spike ran with no network beyond static assets.                                                                                                                                              |
| 2. Selectable text | Pass, verified. Text operators, no image XObjects, `/ToUnicode` present.                                                                                                                                                 |
| 3. Vector logo     | Pass, verified. 7099 path operators, zero images.                                                                                                                                                                        |
| 4. Matches preview | Pass in principle, verified per line on the spike. It transcribes whatever is in the DOM, so pointing it at `.pagedjs_page` matches by construction. Not yet verified against the app's real multi-page Paged.js output. |
| 5. Danish          | Pass. Breaking and hyphenation are the browser's, inherited for free. Encoding verified for æ ø å Æ.                                                                                                                     |

**Bundle cost.** 144 KB gzipped, measured, with its own lightweight PDF writer —
no pdf-lib, no fontkit. Add 86 KB gzipped if `fonteditor-core` is used to convert
woff2 at runtime; zero if fonts are converted at build time instead. It is the
cheapest of the three.

**Work to adopt.** Small in code, meaningful in risk. The call is roughly twenty
lines against the existing `.pagedjs_page` nodes. The blockers are the two font
defects above, plus a maintenance question that matters on a load-bearing path:
the package was first published 2026-04-06, is on version 5.28.0 after 66
releases in about a month, and draws **147 downloads per week**. It is MIT and it
works, but it is one person's month-old project.

### Option 3 — Own the painter, over the same paginated DOM

**How it produces the PDF.** Identical architecture to Option 2, written in
`src/lib/export/pdf.ts` against the document's own vocabulary instead of against
arbitrary HTML. Walk each `.pagedjs_page`, and for every node emit one of a small
fixed set of primitives:

- text runs: one `Range.getClientRects()` rect per rendered line, drawn at that
  position with the matching embedded face;
- filled and rounded boxes: the `nl-notice-info`, `nl-notice-important`,
  `nl-decisions`, `nl-actions` backgrounds;
- rules and borders;
- list markers and the `nl-agenda-item::before` counter;
- the logo, parsed once from `ishoej-kreds18.svg` into path operators;
- the Paged.js margin-box footers, which are ordinary DOM elements by then.

The PDF object plumbing — xref tables, content streams, CIDFontType2 embedding,
`ToUnicode` CMaps — comes from a writer library rather than being hand-rolled.

The reason this is tractable where a general HTML-to-PDF converter is not: this
painter only has to handle CSS **this app writes**. `document.css`, `paged.css`
and `print.css` are the complete specification of what can appear. There are no
gradients, no filters, no transforms in the paginated output, no third-party
markup. A general converter has to handle all of CSS; this one has to handle a
closed list that the repo controls and can extend deliberately.

| Constraint         | Verdict                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Browser-only    | Pass.                                                                                                                                          |
| 2. Selectable text | Pass, by construction — text is drawn with text operators.                                                                                     |
| 3. Vector logo     | Pass. The SVG is 43 KB of path data with a single fill class; converting its `<path d="...">` commands to PDF path operators is direct.        |
| 4. Matches preview | Pass, strongest of the three. Same DOM, same geometry, and no `Tz` fudging — with correctly instanced faces the advance widths match natively. |
| 5. Danish          | Pass, inherited from the browser exactly as in Option 2.                                                                                       |

**Bundle cost.** 176 KB gzipped for pdf-lib, measured, as a lazy chunk.
Critically, **no `@pdf-lib/fontkit`**: adding it takes the bundle from 176 KB to
500 KB gzipped, and its only job would be runtime subsetting, which a build step
does better and for free. The alternative writer `@libpdf/core` measured 248 KB
gzipped with named imports — larger, but actively maintained (0.4.1, published
2026-07-02, 124k downloads/week) where pdf-lib's last release was 2021-11-06
despite 10.9M downloads/week.

**Work to adopt.** Largest of the DOM-transcribing options, smaller than Option 1,
and the only one with no unowned failure mode. Estimate a painter in the
400–600 line range plus the font pipeline, replacing a 250-line file.

### Rejected without full treatment

- **Rasterising (`html2canvas`, `html2pdf.js`, `jsPDF.html()`).** Fails
  constraint 2 and constraint 3 outright: the page becomes a bitmap, text is not
  selectable, the logo is resampled. `html2pdf.js` additionally goes blank past
  the roughly 16,384 px canvas limit. This is the option the current source
  comment correctly rejected.
- **Headless Chrome / Puppeteer / any HTML-to-PDF API.** Fails constraint 1.
  Also sends the newsletter's contents to a third party, which conflicts with the
  `save.localOnly` promise in the UI.
- **A real typesetter compiled to WASM (Typst via `typst.ts`).** Meets 1, 2, 3 and
  5, but fails 4 for the same reason as pdfmake — it is a second layout engine —
  and would require re-authoring the document into Typst markup, at a multi-MB
  WASM download.
- **WeasyPrint in the browser via Pyodide.** WeasyPrint delegates text layout to
  Pango, a native C library it loads through ctypes. There is no browser build.

## 5. Measured bundle costs

All figures from `bun build --minify --target=browser` then gzip, on this
machine, this week. The repo's budget is 160 KB gzipped for the initial workspace
payload; `scripts/check-bundle.ts` holds `pagedjs`, `docx`, `editor` and `schema`
outside it as lazy chunks, and any PDF chunk must join that list.

| Package                        | Entry measured                        | gzipped    |
| ------------------------------ | ------------------------------------- | ---------- |
| `@node-projects/layout2vector` | `extractIR`, `renderIR`, `PDFWriter`  | **144 KB** |
| `pdf-lib`                      | `PDFDocument`, `rgb`, `StandardFonts` | **176 KB** |
| `@libpdf/core`                 | `PDF`, `PDFPage`, `PathBuilder`       | **248 KB** |
| `pdfmake`                      | `pdfmake/build/pdfmake`               | **356 KB** |
| `pdf-lib` + `@pdf-lib/fontkit` | with runtime subsetting               | **500 KB** |
| `fonteditor-core`              | `Font`, `woff2`                       | 86 KB      |
| `pdfmake` `vfs_fonts.js`       | Roboto only, wrong typeface           | 836 KB raw |

## 6. Recommendation

**Adopt the DOM-transcribing architecture, and own the painter — Option 3, with
`pdf-lib` as the writer.**

The deciding argument is that the app already paginates itself. Paged.js is
already in the bundle, already produces `.pagedjs_page` boxes, and the preview
already renders them. Every other approach either throws that work away and
recomputes a layout that will drift from the preview (Option 1, Typst), or
destroys it (raster), or sends it to a server (constraint 1). Transcribing the
existing pages is the only approach where "the export matches the preview" stays
a property of the design rather than a test suite to maintain — which is the
principle `src/lib/render/html.ts` is already built on.

Option 2 gets there for 32 KB less and I have it working, but I would not put a
union's official newsletter export on a package with 147 downloads per week and
66 releases in its first month, and its `Tz` glyph-stretching is a visible defect
that would have to be fixed upstream anyway. It stays valuable as an executable
reference for the extraction stage, and as evidence that the architecture works.

The old comment in `pdf.ts` should go with the print path. It is not wrong about
rasterising and it is not wrong that hand-building a typesetter would be weeks —
it is wrong that those are the only two doors.

## 7. First implementation step

**Build the static font pipeline and prove metric parity, before writing any
painter code.**

Every remaining option depends on it, it is where I measured a concrete failure,
and it is the one piece that cannot be discovered by reading the DOM.

1. Add `scripts/build-pdf-fonts.ts`, alongside the existing
   `scripts/build-logo-png.ts` build step. `document.css`, `print.css` and
   `paged.css` between them ask for weights 400, 500, 600 and 700 plus one italic
   rule, across `--f-sans` (Source Sans 3) and `--f-serif` (Source Serif 4). For
   each face actually used, instance the variable woff2 to a **static** TTF at
   that weight, subset it to Latin plus `æ ø å Æ Ø Å` and the punctuation the
   renderer emits — including `» «`, which `fonts.css` calls out — and write it to
   `public/fonts/pdf/`. Subsetting is what keeps this affordable: the unsubset
   latin conversion measured 43 KB per face.
2. Add a Playwright check under `tests/e2e/` that renders a Danish pangram in each
   face in the browser, records `Range.getClientRects()` widths, and compares them
   against the advance widths computed from the generated TTF's `hmtx` table.
   Assert agreement within a sub-pixel tolerance.

That assertion is the whole gate. If it holds, the painter can position text per
line with no horizontal scaling and the export matches the preview exactly. If it
fails, it fails now, in a 60-line test, instead of after a 500-line painter.
