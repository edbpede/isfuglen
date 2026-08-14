import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

/**
 * Build-time SVG → PNG for the DOCX header — docs/PLAN.md §14.4.
 *
 * A DOCX cannot reliably carry an SVG: Word 2016+ supports it only with an
 * embedded PNG fallback, and LibreOffice and Google Docs handle it poorly.
 * Rasterising in the browser at export time works but adds runtime cost, risks
 * canvas tainting and produces different results across engines.
 *
 * So the PNG is generated once, here, at exactly the pixel width implied by the
 * 32 mm placed width at 300 ppi, preserving the SVG's own aspect ratio. The DOCX
 * writer derives its `ImageRun` dimensions from that same ratio, which makes
 * distortion impossible rather than merely unlikely.
 */

const PLACED_WIDTH_MM = 32;
const DPI = 300;
const MM_PER_INCH = 25.4;

const TARGET_WIDTH_PX = Math.round((PLACED_WIDTH_MM / MM_PER_INCH) * DPI);

const SOURCE = join(import.meta.dir, "..", "public", "brand", "ishoej-kreds18.svg");
const OUTPUT = join(import.meta.dir, "..", "public", "brand", "ishoej-kreds18@300.png");

if (!existsSync(SOURCE)) {
  console.error(`build-logo-png: no SVG at ${SOURCE}`);
  console.error("See public/brand/README.md for the drop-in contract.");
  process.exit(1);
}

const svg = await Bun.file(SOURCE).text();

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: TARGET_WIDTH_PX },
  background: "rgba(0,0,0,0)",
  font: { loadSystemFonts: true },
});

const rendered = resvg.render();
const png = rendered.asPng();

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, png);

console.log(
  `build-logo-png: ${TARGET_WIDTH_PX}×${rendered.height}px (${PLACED_WIDTH_MM} mm at ${DPI} ppi) → ${OUTPUT}`,
);
