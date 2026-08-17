import { type Browser, chromium, expect, firefox, test, webkit } from "@playwright/test";
import { DANISH_NOTES } from "./fixtures";
import { Pdf } from "./pdf-reader";

/**
 * The same document, exported from three engines.
 *
 * What this can honestly assert, and what it deliberately does not:
 *
 * The export transcribes the layout the browser produced. It therefore matches
 * that browser's preview exactly — which is the property the whole architecture
 * exists for — but it cannot make two engines lay out identically. Measured
 * here: Chromium and WebKit ship Danish hyphenation patterns and break long
 * compounds mid-word; Firefox does not and breaks at spaces instead. A file
 * that were byte-identical across all three would have to come from a second
 * layout engine bundled into the app, which is exactly the approach
 * docs/pdf-export-options.md rejected, and it would then match no browser's
 * preview.
 *
 * So the invariants are: the same page count, the same words in the same order,
 * real embedded text everywhere, a vector mark everywhere, and no raster
 * anywhere. Line breaking is the browser's own, in the export exactly as on
 * screen.
 */

const WIDE = { width: 1900, height: 1200 };

const ENGINES = [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit],
] as const;

interface Exported {
  engine: string;
  pages: number;
  words: string;
  fonts: number;
  images: number;
  fills: string[];
  lines: string[];
}

async function exportFrom(browser: Browser, baseURL: string): Promise<Omit<Exported, "engine">> {
  const context = await browser.newContext({ viewport: WIDE, acceptDownloads: true });
  const page = await context.newPage();
  try {
    // Every wait is bounded. `locator.waitFor()` has no timeout by default, and
    // an island that fails to hydrate would otherwise hang the whole test
    // rather than say which engine broke.
    await page.goto(baseURL, { timeout: 30_000 });
    await page.getByLabel(/Dine noter|Your notes/).fill(DANISH_NOTES, { timeout: 30_000 });
    await page
      .getByRole("button", { name: /Formatér nyhedsbrev|Format newsletter/ })
      .click({ timeout: 30_000 });
    await page.locator("[data-section-card]").first().waitFor({ timeout: 30_000 });
    await page.locator(".pagedjs_page").first().waitFor({ timeout: 30_000 });

    const download = page.waitForEvent("download", { timeout: 60_000 });
    await page
      .getByRole("button", { name: /^(Hent PDF|Download PDF)$/ })
      .click({ timeout: 30_000 });
    const stream = await (await download).createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const pdf = new Pdf(new Uint8Array(Buffer.concat(chunks)));

    const lines = pdf.extractedRuns().map((run) => run.text);
    return {
      pages: pdf.pageCount,
      // Hyphens the browser inserted at a line end are removed again and
      // whitespace is ignored, so what is left is the document's words.
      words: lines
        .map((text) => text.replace(/-$/, ""))
        .join("")
        .replace(/\s+/g, ""),
      fonts: pdf.count(/\/FontFile2/g),
      images: pdf.count(/\/Subtype\s*\/Image/g),
      fills: [...new Set(pdf.fills())],
      lines,
    };
  } finally {
    await context.close();
  }
}

// Contexts opened inside a test inherit the project's options, and the
// clipboard permissions the rest of the suite needs are Chromium-only.
test.use({ permissions: [] });

test.describe("PDF export across engines", () => {
  test("Chromium, Firefox and WebKit produce the same document", async ({ baseURL }) => {
    test.setTimeout(300_000);

    const results: Exported[] = [];
    for (const [engine, launcher] of ENGINES) {
      const browser = await launcher.launch();
      try {
        results.push({ engine, ...(await exportFrom(browser, baseURL as string)) });
      } finally {
        await browser.close();
      }
    }

    const first = results[0] as Exported;

    for (const result of results) {
      expect(result.pages, `${result.engine} page count`).toBe(first.pages);
      expect(result.words, `${result.engine} text content`).toBe(first.words);
      expect(result.images, `${result.engine} rasterised something`).toBe(0);
      expect(result.fonts, `${result.engine} embedded no font program`).toBeGreaterThan(0);
      // #253154 — the mark is drawn as paths in its own colour, not as a bitmap.
      expect(result.fills, `${result.engine} lost the brand fill`).toContain("37,49,84");
      expect(result.words, `${result.engine} lost Danish characters`).toContain("IshøjLærerkreds");
    }

    // Stated rather than asserted away: where the engines disagree, they
    // disagree about line breaking, and each file matches its own preview.
    const shapes = results.map((result) => result.lines.length);
    expect(Math.max(...shapes) - Math.min(...shapes)).toBeLessThan(6);
  });
});
