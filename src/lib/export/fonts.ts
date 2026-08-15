/**
 * The faces the PDF export embeds, and the rule for picking one.
 *
 * The screen renders with the variable Fontsource families declared in
 * `src/styles/fonts.css`. PDF has no variable-font instancing: a font program
 * in a PDF is one static instance, and `@libpdf/core` embeds the bytes it is
 * given without touching `fvar` (its `EmbedFontOptions.variations` is accepted
 * and then ignored — `EmbeddedFont.fromBytes` discards the argument). So the
 * export embeds the *static* Fontsource release of the same families, generated
 * into `public/fonts/pdf/` by `scripts/build-pdf-fonts.ts`.
 *
 * That is only sound because the static release is instanced from the same
 * variable source at the same axis positions, which is what
 * `tests/e2e/pdf-fonts.spec.ts` measures rather than assumes: it renders each
 * face in the browser and compares the advance widths against the ones the
 * embedded static face reports.
 *
 * Subsets exist for the same reason they exist in `fonts.css`: a character is
 * drawn by whichever face the browser picked for it, and the browser picks by
 * `unicode-range`. Mirroring the ranges here is what keeps the PDF using the
 * same face as the screen for the same character.
 */

export type FontFamilyKey = "sans" | "serif";
export type FontStyleKey = "normal" | "italic";
export type FontSubsetKey = "latin" | "latin-ext";

/** The weights the document stylesheet can ask for. */
export type FontWeightKey = 400 | 500 | 600 | 700;

/** One embeddable font program. */
export interface FaceKey {
  family: FontFamilyKey;
  weight: FontWeightKey;
  style: FontStyleKey;
  subset: FontSubsetKey;
}

/** Fontsource ships one file per family, subset, weight and style. */
const FAMILY_SLUG: Record<FontFamilyKey, string> = {
  sans: "source-sans-3",
  serif: "source-serif-4",
};

/** The static release, used only at build time; never a runtime dependency. */
export const FAMILY_PACKAGE: Record<FontFamilyKey, string> = {
  sans: "@fontsource/source-sans-3",
  serif: "@fontsource/source-serif-4",
};

/**
 * Every (family, weight, style) the paginated document can produce.
 *
 * Derived from `src/styles/document.css` and `src/styles/paged.css`, plus the
 * two combinations no rule declares: rich text may wrap body copy in `<strong>`
 * or `<em>`, and every element that can contain rich text inherits weight 400,
 * so `bold` resolves to 700 and `bolder` resolves to 700 from 400 on every
 * engine. `tests/unit/export/fonts.test.ts` re-derives the CSS half of this
 * list and fails if a stylesheet has moved ahead of it.
 */
export const REACHABLE_FACES: readonly {
  family: FontFamilyKey;
  weight: FontWeightKey;
  style: FontStyleKey;
}[] = [
  { family: "sans", weight: 400, style: "normal" },
  { family: "sans", weight: 500, style: "normal" },
  { family: "sans", weight: 600, style: "normal" },
  { family: "sans", weight: 700, style: "normal" },
  { family: "sans", weight: 400, style: "italic" },
  { family: "sans", weight: 700, style: "italic" },
  { family: "serif", weight: 600, style: "normal" },
];

export const SUBSETS: readonly FontSubsetKey[] = ["latin", "latin-ext"];

/** Every file `scripts/build-pdf-fonts.ts` emits. */
export function allFaces(): FaceKey[] {
  return REACHABLE_FACES.flatMap((face) => SUBSETS.map((subset) => ({ ...face, subset })));
}

/** `source-sans-3-latin-600-normal` — the Fontsource naming, kept verbatim. */
export function faceStem(face: FaceKey): string {
  return `${FAMILY_SLUG[face.family]}-${face.subset}-${face.weight}-${face.style}`;
}

/** Where the built TTFs are served from. Fetched on export, never preloaded. */
export const PDF_FONT_DIR = "/fonts/pdf/";

export function faceUrl(face: FaceKey): string {
  return `${PDF_FONT_DIR}${faceStem(face)}.ttf`;
}

export function faceId(face: FaceKey): string {
  return faceStem(face);
}

/**
 * The `unicode-range` of each subset, copied verbatim from
 * `src/styles/fonts.css`. `tests/unit/export/fonts.test.ts` asserts the two
 * still agree, because a divergence here does not break — it silently draws a
 * character with a face the browser did not use.
 */
export const UNICODE_RANGES: Record<FontSubsetKey, string> = {
  latin:
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, " +
    "U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  "latin-ext":
    "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, " +
    "U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, " +
    "U+2C60-2C7F, U+A720-A7FF",
};

export type CodePointRange = readonly [start: number, end: number];

/** Parses the `U+xxxx-yyyy, U+zzzz` grammar `unicode-range` uses. */
export function parseUnicodeRange(value: string): CodePointRange[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part): CodePointRange => {
      const body = part.replace(/^U\+/i, "");
      const [start, end] = body.split("-");
      const from = Number.parseInt(start, 16);
      return [from, end === undefined ? from : Number.parseInt(end, 16)];
    });
}

const PARSED_RANGES: Record<FontSubsetKey, CodePointRange[]> = {
  latin: parseUnicodeRange(UNICODE_RANGES.latin),
  "latin-ext": parseUnicodeRange(UNICODE_RANGES["latin-ext"]),
};

/**
 * The subset the browser used for a code point, or `undefined` when no declared
 * face covers it.
 *
 * Declaration order decides overlaps, exactly as the cascade does: `latin` is
 * declared first in `fonts.css`, so it wins the combining marks both subsets
 * list.
 */
export function subsetForCodePoint(codePoint: number): FontSubsetKey | undefined {
  for (const subset of SUBSETS) {
    for (const [start, end] of PARSED_RANGES[subset]) {
      if (codePoint >= start && codePoint <= end) return subset;
    }
  }
  return undefined;
}

/**
 * CSS font matching, narrowed to the faces that exist.
 *
 * Style is honoured first — an italic run drawn upright is a visible defect,
 * a half-step of weight is not — and the weight then snaps to the nearest
 * available one. A stylesheet that asks for a weight no face covers is caught
 * by the unit test at build time; at run time, rounding beats throwing.
 */
export function resolveFace(
  family: FontFamilyKey,
  weight: number,
  style: FontStyleKey,
  subset: FontSubsetKey,
): FaceKey {
  const sameFamily = REACHABLE_FACES.filter((face) => face.family === family);
  const candidates = sameFamily.filter((face) => face.style === style);
  const pool = candidates.length > 0 ? candidates : sameFamily;

  let best = pool[0];
  for (const face of pool) {
    if (Math.abs(face.weight - weight) < Math.abs(best.weight - weight)) best = face;
  }
  return { ...best, subset };
}
