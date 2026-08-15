import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PDF } from "@libpdf/core";
import { decompress } from "wawoff2";
import { allFaces, FAMILY_PACKAGE, faceStem } from "../src/lib/export/fonts";

/**
 * The font programs the PDF export embeds — one static TTF per face.
 *
 * Runs with `scripts/build-logo-png.ts` as part of `bun run build`, and for the
 * same reason: the artefact is derived, so it is generated rather than
 * committed, and the derivation is checked here rather than trusted.
 *
 *   bun run scripts/build-pdf-fonts.ts
 *
 * Why static faces and not the variable ones the browser uses: a PDF font
 * program is a single instance. `@libpdf/core` takes an `EmbedFontOptions`
 * with a `variations` field and then ignores it — `EmbeddedFont.fromBytes`
 * discards its options argument entirely — so handing it a variable TTF embeds
 * the default instance and renders every weight at 400. Fontsource publishes
 * the static release of both families, instanced from the same variable source
 * at the same axis positions, so this step is a container decode rather than a
 * conversion.
 *
 * woff2 to TTF is exactly that decode: `wawoff2` unpacks the container and
 * reconstructs the sfnt without going through a font object model. Round-tripping
 * through `fonteditor-core` instead is what silently dropped tables in the
 * spike behind `docs/pdf-export-options.md`.
 */

const OUTPUT_DIR = join(import.meta.dir, "..", "public", "fonts", "pdf");
const MODULES = join(import.meta.dir, "..", "node_modules");

/**
 * Danish, the guillemets `src/styles/fonts.css` calls out by name, and the
 * punctuation the renderer emits on its own.
 *
 * `✓` (U+2713) and `■` (U+25A0) are deliberately absent: neither is inside any
 * `unicode-range` in `fonts.css`, so the browser has always drawn them from a
 * system fallback and they differ between macOS and Windows today. They are
 * geometry in `document.css` now, not glyphs.
 */
const REQUIRED_CHARACTERS = "æøåÆØÅ»«—–·";

/** Tables a face must carry to be embeddable and measurable. */
const REQUIRED_TABLES = ["cmap", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "OS/2"];

interface Sfnt {
  tables: Map<string, Uint8Array>;
}

function readSfnt(bytes: Uint8Array): Sfnt {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = view.getUint16(4);
  const tables = new Map<string, Uint8Array>();
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    const tag = String.fromCharCode(...bytes.subarray(record, record + 4));
    const offset = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    tables.set(tag, bytes.subarray(offset, offset + length));
  }
  return { tables };
}

/** `usWeightClass`, the one field that proves which instance this really is. */
function weightClass(sfnt: Sfnt): number {
  const os2 = sfnt.tables.get("OS/2");
  if (!os2) throw new Error("no OS/2 table");
  return new DataView(os2.buffer, os2.byteOffset, os2.byteLength).getUint16(4);
}

function italicFlag(sfnt: Sfnt): boolean {
  const head = sfnt.tables.get("head");
  if (!head) throw new Error("no head table");
  const macStyle = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint16(44);
  return (macStyle & 0b10) !== 0;
}

const pdf = await PDF.create();
const problems: string[] = [];
const report: string[] = [];

await mkdir(OUTPUT_DIR, { recursive: true });

for (const face of allFaces()) {
  const stem = faceStem(face);
  const source = join(MODULES, FAMILY_PACKAGE[face.family], "files", `${stem}.woff2`);

  let ttf: Uint8Array;
  try {
    ttf = new Uint8Array(await decompress(await readFile(source)));
  } catch (error) {
    problems.push(`${stem}: could not decode ${source} — ${String(error)}`);
    continue;
  }

  const sfnt = readSfnt(ttf);

  const missing = REQUIRED_TABLES.filter((tag) => !sfnt.tables.has(tag));
  if (missing.length > 0) problems.push(`${stem}: missing ${missing.join(", ")}`);

  // A variable file here would embed as its default instance and render every
  // weight at 400 — the exact defect this pipeline exists to avoid.
  if (sfnt.tables.has("fvar")) {
    problems.push(`${stem}: carries an 'fvar' table, so it is a variable font, not an instance`);
  }

  const declared = weightClass(sfnt);
  if (declared !== face.weight) {
    problems.push(`${stem}: OS/2 usWeightClass is ${declared}, expected ${face.weight}`);
  }

  if (italicFlag(sfnt) !== (face.style === "italic")) {
    problems.push(`${stem}: head.macStyle italic bit disagrees with the requested ${face.style}`);
  }

  if (face.subset === "latin") {
    const embedded = pdf.embedFont(ttf);
    const uncovered = [...REQUIRED_CHARACTERS].filter((char) => !embedded.canEncode(char));
    if (uncovered.length > 0) {
      problems.push(`${stem}: no glyph for ${uncovered.join(" ")}`);
    }
  }

  const output = join(OUTPUT_DIR, `${stem}.ttf`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, ttf);
  report.push(`  ${(ttf.byteLength / 1024).toFixed(1).padStart(7)} KB  ${stem}.ttf`);
}

console.log(`build-pdf-fonts: ${report.length} faces → ${OUTPUT_DIR}`);
console.log(report.join("\n"));

if (problems.length > 0) {
  console.error(`\n${problems.map((problem) => `✗ ${problem}`).join("\n")}`);
  process.exit(1);
}
