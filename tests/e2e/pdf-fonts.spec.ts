import { PDF } from "@libpdf/core";
import { expect, test } from "@playwright/test";
import { allFaces, type FaceKey, faceStem, faceUrl } from "../../src/lib/export/fonts";

/**
 * The gate the whole PDF export stands on.
 *
 * The painter positions each rendered line at the x the browser measured and
 * then draws its characters with the embedded face. That only reproduces the
 * preview if the face the PDF embeds advances exactly as far as the face the
 * browser drew. The browser draws a variable font instanced at a weight; the
 * PDF embeds the static release of the same family. Nothing guarantees those
 * agree — so it is measured here, per face, at the document's own sizes.
 *
 * The second half of the gate is the reason `document.css` turns kerning and
 * ligatures off. Measured on this machine, with kerning on, a Danish sample
 * line renders 1.18 % narrower (1.43 % in italic) than the sum of the advances
 * the PDF can address, because a `Tj` string maps one code point to one glyph
 * and has no kerning pairs to apply. That is 1.3 mm adrift by the end of a full
 * measure. With kerning and ligatures off the two agree to better than 0.08 %.
 */

/** Danish, the guillemets, and the pairs a kerning table would touch. */
const SAMPLE = "Høj bly gom vandt fræk sexquiz på wc — »Æbler, øl og år!« AVATAR Waffle To.";

/** Body copy is 10.5 pt (14 px); the title is 30 pt. Both are checked. */
const SIZES_PX = [14, 40, 200];

/** Everything below this is rounding; everything above it is a defect. */
const TOLERANCE_PERCENT = 0.1;

const FAMILY_STACK: Record<FaceKey["family"], string> = {
  sans: "Source Sans 3 Variable",
  serif: "Source Serif 4 Variable",
};

async function loadFace(request: import("@playwright/test").APIRequestContext, face: FaceKey) {
  const response = await request.get(faceUrl(face));
  expect(response.status(), `${faceStem(face)} is not served`).toBe(200);
  return new Uint8Array(await response.body());
}

test.describe("PDF font pipeline", () => {
  test("every declared face is built and served as a real sfnt", async ({ request }) => {
    for (const face of allFaces()) {
      const bytes = await loadFace(request, face);
      expect(bytes.byteLength, faceStem(face)).toBeGreaterThan(10_000);
      // 0x00010000 is the TrueType sfnt version. A woff2 would start "wOF2".
      expect([...bytes.subarray(0, 4)], `${faceStem(face)} is not a TrueType sfnt`).toEqual([
        0, 1, 0, 0,
      ]);
    }
  });

  test("the embedded faces cover Danish, the guillemets and the dashes", async ({ request }) => {
    const pdf = PDF.create();
    for (const face of allFaces().filter((candidate) => candidate.subset === "latin")) {
      const font = pdf.embedFont(await loadFace(request, face));
      for (const char of "æøåÆØÅ»«—–·") {
        expect(font.canEncode(char), `${faceStem(face)} has no glyph for ${char}`).toBe(true);
      }
    }
  });

  test("advance widths agree with the browser to better than 0.1 %", async ({ page, request }) => {
    await page.goto("/");
    const pdf = PDF.create();

    for (const face of allFaces().filter((candidate) => candidate.subset === "latin")) {
      const font = pdf.embedFont(await loadFace(request, face));

      for (const size of SIZES_PX) {
        const measured = await page.evaluate(
          async ({ family, weight, style, text, size }) => {
            const spec = `${style} ${weight} ${size}px ${JSON.stringify(family)}`;
            await document.fonts.load(spec, text);

            const probe = document.createElement("span");
            probe.textContent = text;
            // The same conditions `.nl-doc` sets: one code point, one glyph.
            // Assigning to `element.style` is not an inline style attribute, so
            // the Content Security Policy does not govern it.
            probe.style.position = "absolute";
            probe.style.left = "0";
            probe.style.top = "0";
            probe.style.whiteSpace = "pre";
            probe.style.fontFamily = JSON.stringify(family);
            probe.style.fontWeight = String(weight);
            probe.style.fontStyle = style;
            probe.style.fontSize = `${size}px`;
            probe.style.letterSpacing = "0";
            probe.style.fontKerning = "none";
            probe.style.fontVariantLigatures = "none";

            document.body.appendChild(probe);
            const width = probe.getBoundingClientRect().width;
            probe.remove();
            return width;
          },
          {
            family: FAMILY_STACK[face.family],
            weight: face.weight,
            style: face.style,
            text: SAMPLE,
            size,
          },
        );

        const computed = font.getTextWidth(SAMPLE, size);
        const drift = Math.abs((computed - measured) / measured) * 100;
        expect(
          drift,
          `${faceStem(face)} at ${size}px: browser ${measured.toFixed(3)} vs embedded ${computed.toFixed(3)}`,
        ).toBeLessThan(TOLERANCE_PERCENT);
      }
    }
  });

  test("the document stylesheet keeps kerning and ligatures off", async ({ page }) => {
    await page.goto("/");
    // Asserted through the cascade rather than by reading the file: an override
    // anywhere else would pass a text search and still break the export.
    const applied = await page.evaluate(() => {
      const article = document.createElement("article");
      article.className = "nl-doc";
      const paragraph = document.createElement("p");
      paragraph.className = "nl-p";
      paragraph.textContent = "Waffle To.";
      article.appendChild(paragraph);
      document.body.appendChild(article);
      const style = getComputedStyle(paragraph);
      const result = {
        kerning: style.fontKerning,
        ligatures: style.fontVariantLigatures,
      };
      article.remove();
      return result;
    });
    expect(applied.kerning).toBe("none");
    expect(applied.ligatures).toBe("none");
  });
});
