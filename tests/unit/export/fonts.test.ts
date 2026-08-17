import { describe, expect, test } from "bun:test";
import {
  allFaces,
  type FontFamilyKey,
  type FontStyleKey,
  type FontWeightKey,
  faceStem,
  faceUrl,
  parseUnicodeRange,
  REACHABLE_FACES,
  resolveFace,
  subsetForCodePoint,
  UNICODE_RANGES,
} from "../../../src/lib/export/fonts";

/**
 * The PDF export embeds one static font program per face, and it can only embed
 * a face `scripts/build-pdf-fonts.ts` was told to build. A stylesheet that
 * starts asking for a weight nobody built does not fail loudly — it draws that
 * text in the nearest weight and looks almost right. So the manifest is
 * re-derived from the stylesheets here and compared, and the `unicode-range`
 * mirror is compared to `fonts.css` for the same reason: a divergence there
 * silently picks a different face than the browser did.
 */

const documentCss = await Bun.file("src/styles/document.css").text();
const pagedCss = await Bun.file("src/styles/paged.css").text();
const fontsCss = await Bun.file("src/styles/fonts.css").text();

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

interface DeclaredFace {
  family: FontFamilyKey;
  weight: FontWeightKey;
  style: FontStyleKey;
  where: string;
}

/**
 * Every (family, weight, style) a rule in these stylesheets can produce.
 *
 * The reading is deliberately shallow — one rule at a time, no cascade — which
 * is sound here because the two rules that switch family (`.nl-title` and
 * `.nl-h2`) declare their weight in the same block, and everything else
 * inherits the document's sans at 400.
 */
function declaredFaces(css: string, source: string): DeclaredFace[] {
  const faces: DeclaredFace[] = [];
  for (const rule of stripComments(css).matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = (rule[1] ?? "").trim().split("\n").pop()?.trim() ?? "";
    const body = rule[2] ?? "";

    const family = /font-family:[^;]*(--f-serif|Source Serif)/.test(body)
      ? "serif"
      : /font-family:[^;]*(--f-sans|Source Sans)/.test(body)
        ? "sans"
        : undefined;
    const weight = /font-weight:\s*(\d+)/.exec(body)?.[1];
    const style = /font-style:\s*(italic|normal)/.exec(body)?.[1];

    if (family === undefined && weight === undefined && style === undefined) continue;

    faces.push({
      family: family ?? "sans",
      weight: (weight ? Number(weight) : 400) as FontWeightKey,
      style: (style ?? "normal") as FontStyleKey,
      where: `${source} ${selector}`,
    });
  }
  return faces;
}

const key = (face: { family: string; weight: number; style: string }) =>
  `${face.family}/${face.weight}/${face.style}`;

const manifest = new Set(REACHABLE_FACES.map(key));

describe("the manifest covers the stylesheets", () => {
  const declared = [
    ...declaredFaces(documentCss, "document.css"),
    ...declaredFaces(pagedCss, "paged.css"),
  ];

  test("the stylesheets are actually being read", () => {
    expect(declared.length).toBeGreaterThan(8);
  });

  test("every declared combination has a face to embed", () => {
    const uncovered = declared.filter((face) => !manifest.has(key(face)));
    expect(
      uncovered.map((face) => `${key(face)} — ${face.where}`),
      "add the face to REACHABLE_FACES in src/lib/export/fonts.ts",
    ).toEqual([]);
  });

  test("rich text reaches italic and bold-italic, which no rule declares", () => {
    // `renderInline` wraps marked runs in <em> and <strong>, and every element
    // that can hold rich text inherits weight 400 — so `bold` and `bolder` both
    // resolve to 700 there, on every engine.
    expect(manifest.has("sans/400/italic")).toBe(true);
    expect(manifest.has("sans/700/italic")).toBe(true);
  });

  test("no face is built that nothing can use", () => {
    const used = new Set([...declared.map(key), "sans/400/italic", "sans/700/italic"]);
    const orphans = REACHABLE_FACES.map(key).filter((face) => !used.has(face));
    expect(orphans, "drop it from REACHABLE_FACES rather than shipping the file").toEqual([]);
  });
});

describe("unicode ranges mirror fonts.css", () => {
  const ranges = [...stripComments(fontsCss).matchAll(/unicode-range:\s*([^;]+);/g)].map((match) =>
    (match[1] ?? "").replace(/\s+/g, " ").trim(),
  );

  test("fonts.css declares both subsets", () => {
    expect(ranges.length).toBeGreaterThan(1);
  });

  test("every declared range is one of the two mirrored here", () => {
    const mirrored = new Set(
      Object.values(UNICODE_RANGES).map((value) => value.replace(/\s+/g, " ").trim()),
    );
    for (const range of ranges) {
      expect(
        mirrored.has(range),
        `fonts.css declares a range fonts.ts does not mirror:\n${range}`,
      ).toBe(true);
    }
  });

  test("both mirrored ranges are actually used by fonts.css", () => {
    for (const value of Object.values(UNICODE_RANGES)) {
      expect(ranges).toContain(value.replace(/\s+/g, " ").trim());
    }
  });
});

describe("parseUnicodeRange", () => {
  test("reads single code points and spans", () => {
    expect(parseUnicodeRange("U+0000-00FF, U+0131, U+FFFD")).toEqual([
      [0x0000, 0x00ff],
      [0x0131, 0x0131],
      [0xfffd, 0xfffd],
    ]);
  });
});

describe("subsetForCodePoint", () => {
  test("Danish and the guillemets live in latin", () => {
    for (const char of "æøåÆØÅ»«·—") {
      expect(subsetForCodePoint(char.codePointAt(0) as number), char).toBe("latin");
    }
  });

  test("extended Latin falls to latin-ext", () => {
    for (const char of "łŁňŧ") {
      expect(subsetForCodePoint(char.codePointAt(0) as number), char).toBe("latin-ext");
    }
  });

  test("declaration order decides the overlap", () => {
    // U+0304 is listed by both subsets; `latin` is declared first in fonts.css.
    expect(subsetForCodePoint(0x0304)).toBe("latin");
  });

  test("a character no declared face covers is reported as uncovered", () => {
    expect(subsetForCodePoint("✓".codePointAt(0) as number)).toBeUndefined();
    expect(subsetForCodePoint("Я".codePointAt(0) as number)).toBeUndefined();
  });
});

describe("resolveFace", () => {
  test("returns the exact face when one exists", () => {
    expect(resolveFace("sans", 600, "normal", "latin")).toEqual({
      family: "sans",
      weight: 600,
      style: "normal",
      subset: "latin",
    });
  });

  test("snaps to the nearest weight rather than throwing", () => {
    expect(resolveFace("sans", 300, "normal", "latin").weight).toBe(400);
    expect(resolveFace("sans", 900, "normal", "latin").weight).toBe(700);
  });

  test("keeps the style even when the weight has to move", () => {
    const face = resolveFace("sans", 500, "italic", "latin");
    expect(face.style).toBe("italic");
    expect(face.weight).toBe(400);
  });

  test("falls back to the family's other style when it has no italic at all", () => {
    expect(resolveFace("serif", 600, "italic", "latin").style).toBe("normal");
  });
});

describe("file naming", () => {
  test("matches the Fontsource layout the build step reads", () => {
    expect(faceStem({ family: "sans", weight: 600, style: "normal", subset: "latin" })).toBe(
      "source-sans-3-latin-600-normal",
    );
    expect(faceStem({ family: "serif", weight: 600, style: "normal", subset: "latin-ext" })).toBe(
      "source-serif-4-latin-ext-600-normal",
    );
  });

  test("URLs are same-origin and rooted where the build writes them", () => {
    for (const face of allFaces()) {
      expect(faceUrl(face)).toStartWith("/fonts/pdf/");
      expect(faceUrl(face)).toEndWith(".ttf");
    }
  });

  test("one file per face, no duplicates", () => {
    const stems = allFaces().map(faceStem);
    expect(new Set(stems).size).toBe(stems.length);
  });
});
