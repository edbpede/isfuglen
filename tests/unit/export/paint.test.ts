import { describe, expect, test } from "bun:test";
import {
  applyTextTransform,
  hyphenatesAt,
  PX_TO_PT,
  parseColor,
  resolveContent,
  subsetRuns,
} from "../../../src/lib/export/paint";

/**
 * The painter's rules that do not need a layout engine.
 *
 * Everything geometric is measured in a real browser and asserted end to end in
 * `tests/e2e/pdf-export.spec.ts`, because a synthetic DOM lays nothing out and a
 * test against zero-sized rects proves nothing. What lives here is the logic
 * that decides *what* to draw: the four text hazards, the colour parser and the
 * generated-content resolver. Each of them fails silently when it is wrong —
 * a wrong case, a missing hyphen, a wrong font subset — which is exactly the
 * kind of defect a test has to catch instead of a reviewer.
 */

describe("parseColor", () => {
  test("reads the rgb() form every engine computes to", () => {
    expect(parseColor("rgb(37, 49, 84)")).toEqual({ r: 37 / 255, g: 49 / 255, b: 84 / 255, a: 1 });
  });

  test("reads alpha, in both the comma and the slash notation", () => {
    expect(parseColor("rgba(0, 0, 0, 0.5)").a).toBe(0.5);
    expect(parseColor("rgb(0 0 0 / 0.25)").a).toBe(0.25);
  });

  test("an unset background computes to fully transparent", () => {
    expect(parseColor("rgba(0, 0, 0, 0)").a).toBe(0);
  });

  test("anything unreadable is transparent rather than black", () => {
    // Drawing an unparsed colour as black would paint an opaque box over the
    // text underneath it; drawing nothing is the safe failure.
    expect(parseColor("").a).toBe(0);
    expect(parseColor("none").a).toBe(0);
    expect(parseColor("color(display-p3 1 0 0)").a).toBe(0);
  });
});

describe("resolveContent", () => {
  test("nothing to draw", () => {
    for (const value of ["none", "normal", ""]) {
      expect(resolveContent(value, 1, 3)).toBe("");
    }
  });

  test("a quoted string is the string", () => {
    // `var(--nl-footer)` is already substituted by the time the value computes,
    // which is how the running footer's text reaches the painter at all.
    expect(resolveContent('"Ishøj Lærerkreds · Kreds 18"', 1, 3)).toBe(
      "Ishøj Lærerkreds · Kreds 18",
    );
    expect(resolveContent("'x'", 1, 3)).toBe("x");
  });

  test("counters are supplied, because the CSSOM never resolves them", () => {
    expect(resolveContent('counter(page) " / " "3"', 2, 3)).toBe("2 / 3");
    expect(resolveContent("counter(page)", 7, 9)).toBe("7");
    expect(resolveContent("counter(pages)", 7, 9)).toBe("9");
  });

  test("a CSS escape in a content string becomes its character", () => {
    expect(resolveContent('"\\2713"', 1, 1)).toBe("✓");
    expect(resolveContent('"a\\"b"', 1, 1)).toBe('a"b');
  });

  test("anything else draws nothing rather than its own source text", () => {
    expect(resolveContent("attr(data-x)", 1, 1)).toBe("");
    expect(resolveContent("open-quote", 1, 1)).toBe("");
    expect(resolveContent('url("x.png")', 1, 1)).toBe("");
  });

  test("a counter surrounded by strings keeps its place", () => {
    expect(resolveContent('"side " counter(page) " af " counter(pages)', 4, 12)).toBe(
      "side 4 af 12",
    );
  });
});

describe("applyTextTransform", () => {
  test("uppercase covers the Danish letters", () => {
    expect(applyTextTransform("dagsorden æøå", "uppercase", "da")).toBe("DAGSORDEN ÆØÅ");
  });

  test("none leaves the text alone", () => {
    expect(applyTextTransform("Mette", "none", "da")).toBe("Mette");
  });

  test("lowercase and capitalize behave", () => {
    expect(applyTextTransform("MØDE", "lowercase", "da")).toBe("møde");
    expect(applyTextTransform("ét møde", "capitalize", "da")).toBe("Ét Møde");
  });
});

describe("hyphenatesAt", () => {
  const wrapping = { hyphens: "auto", overflowWrap: "normal", wordBreak: "normal" };

  test("a mid-word break under hyphens: auto drew a hyphen", () => {
    // `arbejdstidsaftale` is an ordinary Danish word that every engine breaks.
    const word = "arbejdstidsaftale";
    expect(hyphenatesAt(word, 8, wrapping)).toBe(true);
  });

  test("a break at a space did not", () => {
    expect(hyphenatesAt("møde om arbejdstid", 5, wrapping)).toBe(false);
    expect(hyphenatesAt("møde om arbejdstid", 4, wrapping)).toBe(false);
  });

  test("a link breaking mid-token gets no hyphen", () => {
    // `.nl-doc a` breaks through overflow-wrap, not hyphenation, and CSS draws
    // no hyphen for that. This is the case the naive rule gets wrong.
    expect(
      hyphenatesAt("ishoejlaererkreds", 6, {
        hyphens: "auto",
        overflowWrap: "anywhere",
        wordBreak: "normal",
      }),
    ).toBe(false);
    expect(
      hyphenatesAt("ishoejlaererkreds", 6, {
        hyphens: "auto",
        overflowWrap: "normal",
        wordBreak: "break-all",
      }),
    ).toBe(false);
  });

  test("hyphenation switched off means no hyphen, whatever the break", () => {
    expect(
      hyphenatesAt("arbejdstidsaftale", 8, {
        hyphens: "manual",
        overflowWrap: "normal",
        wordBreak: "normal",
      }),
    ).toBe(false);
  });

  test("a break at the very start or end of the data is not a hyphenation", () => {
    expect(hyphenatesAt("møde", 0, wrapping)).toBe(false);
    expect(hyphenatesAt("møde", 4, wrapping)).toBe(false);
  });

  test("punctuation on either side rules it out", () => {
    expect(hyphenatesAt("kl.15", 3, wrapping)).toBe(false);
    expect(hyphenatesAt("15.30", 3, wrapping)).toBe(false);
  });
});

describe("subsetRuns", () => {
  test("plain Danish is one latin run", () => {
    expect(subsetRuns("Ishøj Lærerkreds »æøå«")).toEqual([
      { text: "Ishøj Lærerkreds »æøå«", subset: "latin" },
    ]);
  });

  test("extended Latin splits into its own run, in place", () => {
    // The browser draws each character with the face whose unicode-range covers
    // it; a single run here would draw ł with the wrong file.
    expect(subsetRuns("Wojciech Łukasz")).toEqual([
      { text: "Wojciech ", subset: "latin" },
      { text: "Ł", subset: "latin-ext" },
      { text: "ukasz", subset: "latin" },
    ]);
  });

  test("a character no face covers is marked rather than dropped silently", () => {
    expect(subsetRuns("ok✓")).toEqual([
      { text: "ok", subset: "latin" },
      { text: "✓", subset: undefined },
    ]);
  });
});

describe("units", () => {
  test("CSS pixels to PDF points is 96 dpi against 72", () => {
    expect(PX_TO_PT).toBe(72 / 96);
    // A4 at 210 mm is 793.7 px and 595.3 pt.
    expect((210 * (96 / 25.4) * PX_TO_PT).toFixed(1)).toBe("595.3");
  });
});
