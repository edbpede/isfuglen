import { expect, type Page, test } from "@playwright/test";
import { DANISH_NOTES, formatNotes, longNotes, resetStorage } from "./fixtures";
import { Pdf } from "./pdf-reader";

/**
 * The export, asserted on the file it produces.
 *
 * The claim this suite has to defend is not "a PDF appeared" but "the PDF is
 * the preview": real text rather than a picture of text, correct Danish through
 * the ToUnicode CMap, a vector logo, and every line drawn where the browser put
 * it. So the assertions read the PDF's own operators and compare them against a
 * second, independent measurement of the preview's DOM.
 *
 * There is no rasterised visual diff. A numeric comparison of the drawn
 * geometry against the measured geometry is stricter than a pixel comparison
 * and does not depend on which fonts and antialiasing the CI runner has.
 */

/** The preview draws at 1:1 when the pane is wider than an A4 sheet. */
const WIDE = { width: 1900, height: 1200 };

/**
 * The standard notes plus a section that exercises the Danish alphabet in both
 * cases, the guillemets `fonts.css` calls out, and a word long enough to be
 * worth checking survives intact.
 */
const DANISH_COVERAGE = `${DANISH_NOTES}
Årsmøde
Bestyrelsen skrev »Æbler, ØL og Årsberetning« om medarbejderrepræsentanternes vilkår.
`;

const PAGE_HEIGHT_PT = 841.89;
const PX_TO_PT = 0.75;

/** A quarter of a point. Anything that survives this is not a placement bug. */
const TOLERANCE_PT = 0.5;

async function exportPdf(page: Page): Promise<Pdf> {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^(Hent PDF|Download PDF)$/ }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return new Pdf(new Uint8Array(Buffer.concat(chunks)));
}

/**
 * The preview's rendered lines, in the PDF's own coordinates.
 *
 * Measured from the preview rather than from the export's own stage, so this is
 * a second pagination and a second measurement — the comparison would prove
 * nothing if both sides came from the same walk.
 */
async function previewLines(page: Page) {
  return page.evaluate(
    ({ pageHeightPt, pxToPt }) => {
      const scaler = document.querySelector(".preview-scaler") as HTMLElement | null;
      const matrix = scaler ? new DOMMatrixReadOnly(getComputedStyle(scaler).transform) : undefined;
      const scale = matrix && matrix.a !== 0 ? matrix.a : 1;

      const upper = (value: string, mode: string, lang: string) =>
        mode === "uppercase"
          ? value.toLocaleUpperCase(lang)
          : mode === "lowercase"
            ? value.toLocaleLowerCase(lang)
            : value;

      const lines: {
        text: string;
        x: number;
        top: number;
        page: number;
        size: number;
        single: boolean;
      }[] = [];

      document.querySelectorAll(".pagedjs_page").forEach((pageElement, index) => {
        const sheet = (pageElement.querySelector(".pagedjs_sheet") ?? pageElement) as HTMLElement;
        const origin = sheet.getBoundingClientRect();

        const walker = document.createTreeWalker(pageElement, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node as Text;
          if (text.data.trim().length === 0) continue;
          const parent = text.parentElement;
          if (!parent) continue;
          const style = getComputedStyle(parent);
          if (style.display === "none" || style.visibility === "hidden") continue;

          const range = document.createRange();
          range.selectNodeContents(text);

          // One entry per line box, merging the fragments an engine may report
          // for a single line.
          const grouped: DOMRect[] = [];
          for (const rect of range.getClientRects()) {
            if (rect.width === 0 && rect.height === 0) continue;
            const previous = grouped.at(-1);
            if (previous && Math.abs(previous.top - rect.top) < 0.5) {
              const left = Math.min(previous.left, rect.left);
              grouped[grouped.length - 1] = new DOMRect(
                left,
                previous.top,
                Math.max(previous.right, rect.right) - left,
                previous.height,
              );
              continue;
            }
            grouped.push(rect);
          }

          const language = (parent.closest("[lang]") as HTMLElement | null)?.lang || "da";
          for (const rect of grouped) {
            lines.push({
              // `text-transform` is CSS semantics, not painter logic, so the
              // measurement applies it too and the two sides stay comparable.
              text: upper(text.data.trim().replace(/\s+/g, " "), style.textTransform, language),
              x: ((rect.left - origin.left) / scale) * pxToPt,
              top: pageHeightPt - ((rect.top - origin.top) / scale) * pxToPt,
              page: index + 1,
              size: Number.parseFloat(style.fontSize) * pxToPt,
              single: grouped.length === 1,
            });
          }
        }
      });

      return lines;
    },
    { pageHeightPt: PAGE_HEIGHT_PT, pxToPt: PX_TO_PT },
  );
}

test.use({ viewport: WIDE });

test.describe("PDF export", () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
    await page.goto("/");
    await formatNotes(page, DANISH_COVERAGE);
    // The preview paginates on a 400 ms debounce; the assertions below read it.
    await page.locator(".pagedjs_page").first().waitFor();
  });

  test("draws real text, no raster, and Danish survives the round trip", async ({ page }) => {
    const pdf = await exportPdf(page);

    expect(pdf.version).toBe("PDF-1.7");
    expect(pdf.drawnText().length).toBeGreaterThan(20);
    // A page rendered as a picture would have an image XObject and no text.
    expect(pdf.count(/\/Subtype\s*\/Image/g)).toBe(0);
    expect(pdf.paintedXObjects()).toBe(0);
    // Embedded programs with a reverse mapping, which is what makes the text
    // copyable rather than merely visible.
    expect(pdf.count(/\/FontFile2/g)).toBeGreaterThan(0);
    expect(pdf.count(/\/ToUnicode/g)).toBeGreaterThan(0);

    const extracted = pdf
      .extractedRuns()
      .map((run) => run.text)
      .join("\n");
    for (const char of "æøåÆØÅ") {
      expect(extracted, `missing ${char}`).toContain(char);
    }
    expect(extracted).toContain("Klubmøde august");
    expect(extracted).toContain("Lærerværelset");
    expect(extracted).toContain("medarbejderrepræsentanternes");
    // The guillemets src/styles/fonts.css calls out by name.
    expect(extracted).toContain("»Æbler");
    expect(extracted).toContain("vilkår");
    // The uppercase treatment is applied to the glyphs, not just to the box:
    // the label is `Dagsorden` in the label pack and `text-transform` in CSS.
    expect(extracted).toContain("DAGSORDEN");
    expect(extracted).not.toContain("Dagsorden");
    // A .notdef would come back as a replacement character.
    expect(extracted).not.toContain("\uFFFD");
  });

  test("a line and a footer spanning both subsets are drawn in both faces", async ({ page }) => {
    // `latin` and `latin-ext` are disjoint: neither face can encode the other's
    // characters, so a string covering both has to become one run per subset.
    // Two paths reach that split with no text node to range over -- a line
    // whose whitespace collapsed, and generated content -- and handing either
    // one whole to the first character's face aborts the export with
    // `UnembeddableTextError`, which is a failed download rather than a
    // cosmetic defect.
    await page.getByLabel(/Dine noter|Your notes/).waitFor({ state: "detached" });
    await page.reload();
    await formatNotes(
      page,
      // The double space collapses, so the drawn string is shorter than the one
      // the browser laid out and its offsets no longer address the node.
      `${DANISH_NOTES}\nKolleger\nVi bød velkommen til Michał.  Han kommer fra Wrocław.\n`,
    );
    await page.locator(".pagedjs_page").first().waitFor();

    // The running footer is a `::after` on a Paged.js margin box: generated
    // content, and the second path to the same split.
    await page.locator("#doc-organisation").fill("Ishøj Lærerkreds");
    await page.locator("#doc-footer").fill("Michał Wróbel");
    // The footer is `content` on a margin box, so it has no text to assert on;
    // the computed value is what the painter itself reads.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const box = document.querySelector(
            ".pagedjs_page .pagedjs_margin-bottom-left .pagedjs_margin-content",
          );
          return box ? getComputedStyle(box, "::after").content : "";
        }),
      )
      .toContain("Wróbel");

    const pdf = await exportPdf(page);
    const runs = pdf.extractedRuns();
    const text = runs.map((run) => run.text).join("");

    // Every character survives, through whichever face carries its subset.
    for (const word of ["Michał", "Wrocław", "Wróbel", "Ishøj"]) {
      expect(text, `missing ${word}`).toContain(word);
    }
    expect(text).not.toContain("\uFFFD");

    // Splitting is only half of it: the runs have to advance across the page
    // rather than stack at its left edge, which is what measuring the prefix
    // before each one buys.
    // Taken contiguously from the anchor rather than by baseline alone: y is
    // per page, and a run on another page can share it.
    const start = runs.findIndex((run) => run.text.startsWith("Vi bød velkommen til Micha"));
    expect(start, "the mixed-subset line was not drawn").toBeGreaterThanOrEqual(0);
    const baseline = (runs[start] as (typeof runs)[number]).y;
    let end = start;
    while (
      end + 1 < runs.length &&
      Math.abs((runs[end + 1] as (typeof runs)[number]).y - baseline) < 0.5
    ) {
      end += 1;
    }
    const line = runs.slice(start, end + 1);

    expect(line.length, "the line was not split per subset").toBeGreaterThan(1);
    expect(line.map((run) => run.text).join("")).toBe(
      "Vi bød velkommen til Michał. Han kommer fra Wrocław.",
    );
    for (let index = 1; index < line.length; index += 1) {
      const previous = line[index - 1] as (typeof line)[number];
      const current = line[index] as (typeof line)[number];
      expect(current.x, `run ${index} does not advance past the one before it`).toBeGreaterThan(
        previous.x,
      );
    }
  });

  test("the mark is vector, in the brand navy", async ({ page }) => {
    const pdf = await exportPdf(page);

    // The real mark is 60 paths; anything close to that is the mark itself
    // rather than the rounded corners of a notice box.
    expect(pdf.pathOperators()).toBeGreaterThan(500);
    expect(pdf.count(/\/Subtype\s*\/Image/g)).toBe(0);
    // #253154, the single fill in public/brand/ishoej-kreds18.svg.
    expect(pdf.fills()).toContain("37,49,84");
  });

  test("the page count is the preview's", async ({ page }) => {
    const expected = await page.locator(".pagedjs_page").count();
    const pdf = await exportPdf(page);
    expect(pdf.pageCount).toBe(expected);
  });

  test("every line the preview lays out is drawn where the preview put it", async ({ page }) => {
    const measured = await previewLines(page);
    const pdf = await exportPdf(page);
    const drawn = pdf.extractedRuns();

    expect(measured.length).toBeGreaterThan(15);

    // Text first. Runs are concatenated in drawing order, a hyphen the browser
    // inserted at a line end is dropped again, and whitespace is ignored — so
    // what remains is the document's words, and every text node the preview
    // rendered has to appear in it, in one piece, with its case transformed.
    const document = drawn
      .map((run) => run.text.replace(/-$/, ""))
      .join("")
      .replace(/\s+/g, "");
    for (const line of measured) {
      expect(
        document.includes(line.text.replace(/\s+/g, "")),
        `the preview text "${line.text.slice(0, 40)}" is not in the PDF`,
      ).toBe(true);
    }

    // Then geometry, on the text nodes that occupy exactly one line and are
    // therefore unambiguous to match.
    let compared = 0;
    for (const line of measured) {
      if (!line.single) continue;
      const matches = drawn.filter((run) => run.text === line.text);
      if (matches.length !== 1) continue;
      const run = matches[0] as (typeof drawn)[number];
      expect(Math.abs(run.x - line.x), `x of "${line.text.slice(0, 30)}"`).toBeLessThan(
        TOLERANCE_PT,
      );
      expect(Math.abs(run.size - line.size), `size of "${line.text.slice(0, 30)}"`).toBeLessThan(
        0.05,
      );
      // The baseline sits inside the line box the preview measured, below its
      // top and above the next line's.
      expect(run.y, `baseline of "${line.text.slice(0, 30)}"`).toBeLessThan(line.top);
      expect(run.y).toBeGreaterThan(line.top - line.size * 1.6);
      compared += 1;
    }
    expect(compared, "nothing was comparable, so nothing was proved").toBeGreaterThan(10);
  });

  test("block backgrounds are drawn at the box the preview measured", async ({ page }) => {
    // A rectangle has no font metrics in it, so this pins absolute placement
    // without any baseline reasoning at all.
    const expected = await page.evaluate(
      ({ pageHeightPt, pxToPt }) => {
        const decisions = document.querySelector(".pagedjs_page .nl-decisions") as HTMLElement;
        const sheet = decisions.closest(".pagedjs_sheet") as HTMLElement;
        const scaler = document.querySelector(".preview-scaler") as HTMLElement;
        const matrix = new DOMMatrixReadOnly(getComputedStyle(scaler).transform);
        const scale = matrix.a || 1;
        const box = decisions.getBoundingClientRect();
        const origin = sheet.getBoundingClientRect();
        return {
          x: ((box.left - origin.left) / scale) * pxToPt,
          y: pageHeightPt - ((box.bottom - origin.top) / scale) * pxToPt,
          width: (box.width / scale) * pxToPt,
          height: (box.height / scale) * pxToPt,
        };
      },
      { pageHeightPt: PAGE_HEIGHT_PT, pxToPt: PX_TO_PT },
    );

    const pdf = await exportPdf(page);
    const near = pdf
      .shapes()
      .filter(
        (rect) =>
          Math.abs(rect.width - expected.width) < TOLERANCE_PT &&
          Math.abs(rect.height - expected.height) < TOLERANCE_PT,
      );

    expect(near.length, "no rectangle matches the decisions block's size").toBeGreaterThan(0);
    const best = near[0] as (typeof near)[number];
    expect(Math.abs(best.x - expected.x)).toBeLessThan(TOLERANCE_PT);
    expect(Math.abs(best.y - expected.y)).toBeLessThan(TOLERANCE_PT);
  });

  test("links become annotations, and only allowed schemes do", async ({ page }) => {
    const pdf = await exportPdf(page);
    expect(pdf.count(/\/Subtype\s*\/Link/g)).toBeGreaterThan(0);
    expect(pdf.raw).toContain("mailto:mette@ishoejlaererkreds.dk");
    expect(pdf.raw.toLowerCase()).not.toContain("javascript:");
  });

  test("nothing but this origin is requested while exporting", async ({ page }) => {
    const foreign: string[] = [];
    page.on("request", (request) => {
      if (!request.url().startsWith("http://localhost:4321")) foreign.push(request.url());
    });

    const pdf = await exportPdf(page);
    expect(pdf.pageCount).toBeGreaterThan(0);
    expect(foreign, "the export reached outside this origin").toEqual([]);
  });

  test("a hyphen the browser inserted is drawn, and one it did not is not", async ({ page }) => {
    // `.nl-contact-name` is a 45 mm column, which is narrow enough that a long
    // Danish compound has to break inside the word.
    await page.getByLabel(/Dine noter|Your notes/).waitFor({ state: "detached" });
    await page.reload();
    await formatNotes(
      page,
      `${DANISH_NOTES}\nKontakt\nArbejdsmarkedsuddannelsescentret Hansen · mette@ishoejlaererkreds.dk\n`,
    );
    await page.locator(".pagedjs_page").first().waitFor();

    const broken = await page.evaluate(() => {
      const dt = [...document.querySelectorAll(".pagedjs_page .nl-contact-name")].find((element) =>
        element.textContent?.includes("Arbejdsmarkedsuddannelsescentret"),
      );
      const node = dt?.firstChild as Text | undefined;
      if (!node) return undefined;
      const range = document.createRange();
      range.selectNodeContents(node);
      const tops = new Set<number>();
      for (const rect of range.getClientRects()) tops.add(Math.round(rect.top));
      if (tops.size < 2) return undefined;

      // The offset where the second line starts.
      for (let index = 1; index <= node.data.length; index += 1) {
        range.setStart(node, 0);
        range.setEnd(node, index);
        const seen = new Set<number>();
        for (const rect of range.getClientRects()) seen.add(Math.round(rect.top));
        if (seen.size > 1) return node.data.slice(0, index - 1);
      }
      return undefined;
    });

    const pdf = await exportPdf(page);
    const runs = pdf.extractedRuns().map((run) => run.text);

    if (broken === undefined) {
      // Firefox ships no Danish hyphenation here and overflows the word
      // instead. Transcribing that faithfully means drawing no hyphen.
      expect(runs.some((text) => text.endsWith("-"))).toBe(false);
      return;
    }

    expect(runs, `expected a hyphen after "${broken}"`).toContain(`${broken}-`);
    // The hyphen is U+002D, which every embedded face carries; U+2010, the CSS
    // default, is in none of them.
    expect(runs.join("")).not.toContain("\u2010");
  });

  test("a document that spans pages numbers every one of them", async ({ page }) => {
    await page.reload();
    await formatNotes(page, longNotes(10));
    await page.locator(".pagedjs_page").first().waitFor();
    const pages = await page.locator(".pagedjs_page").count();
    expect(pages).toBeGreaterThan(1);

    const pdf = await exportPdf(page);
    expect(pdf.pageCount).toBe(pages);

    const runs = pdf.extractedRuns().map((run) => run.text);
    for (let number = 1; number <= pages; number += 1) {
      expect(runs, `page ${number} has no running footer`).toContain(`${number} / ${pages}`);
    }
  });

  test("the export announces itself and refuses to run twice at once", async ({ page }) => {
    // A local export finishes in about a tenth of a second, which is too fast
    // to observe a busy state without making it observable. Delaying the font
    // fetch is the honest way: it slows the real work rather than faking it.
    await page.route("**/fonts/pdf/*.ttf", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });

    const status = page.getByRole("status");
    const idle = page.getByRole("button", { name: /^(Hent PDF|Download PDF)$/ });
    const busy = page.getByRole("button", { name: /Laver PDF|Building the PDF/ });

    const download = page.waitForEvent("download");
    await idle.click();

    await expect(busy).toBeDisabled();
    await expect(status).toContainText(/Laver PDF|Building the PDF/);

    await download;
    await expect(status).toContainText(/PDF-filen er hentet|The PDF has been downloaded/);
    await expect(idle).toBeEnabled();
  });

  test("a writer that cannot load fails out loud and downloads nothing", async ({ page }) => {
    // The chunk name is fixed by `manualChunks` in astro.config.mjs precisely so
    // this branch has something stable to block.
    await page.route("**/_astro/libpdf.*.js", (route) => route.abort());

    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });

    await page.getByRole("button", { name: /^(Hent PDF|Download PDF)$/ }).click();

    // The message goes to the assertive live region, which is visually hidden
    // by design — announced rather than shown.
    const alert = page.getByRole("alert");
    await expect(alert).toContainText(/Kunne ikke lave PDF-filen|Could not build the PDF/);
    await expect(alert).toContainText(/Ctrl\+P/);
    expect(downloaded, "a broken export must not produce a file").toBe(false);
  });
});
