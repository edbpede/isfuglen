import { describe, expect, test } from "bun:test";
import { normaliseText, normaliseValue } from "../../../src/lib/parser/normalise";
import { segment } from "../../../src/lib/parser/segment";

/** docs/PLAN.md §8.7, §11.1 stages 1–2. */

describe("normaliseText", () => {
  test("normalises decomposed Danish characters to NFC", () => {
    // The shape macOS clipboards and several PDF extractors produce. Compared
    // through a variable so TypeScript cannot fold the literals together and
    // declare the comparison pointless — at runtime they are not equal, which
    // is the entire reason this normalisation exists.
    const decomposed: string = "a\u030A";
    const composed: string = "\u00E5";
    expect(decomposed === composed).toBe(false);
    expect(decomposed.normalize("NFC") === composed).toBe(true);
    expect(normaliseText(decomposed)).toBe("å");
    expect(normaliseText("Ma\u030Ansdag")).toBe("Månsdag");
  });

  test("collapses CRLF and lone CR to LF", () => {
    expect(normaliseText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  test("replaces non-breaking and exotic spaces with a plain space", () => {
    expect(normaliseText("kl.\u00A015.30")).toBe("kl. 15.30");
    expect(normaliseText("a\u202Fb")).toBe("a b");
  });

  test("strips zero-width characters and soft hyphens", () => {
    expect(normaliseText("ar\u00ADbejds\u200Btid")).toBe("arbejdstid");
    expect(normaliseText("\uFEFFDagsorden")).toBe("Dagsorden");
  });

  test("collapses three or more blank lines to one", () => {
    expect(normaliseText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  test("removes trailing whitespace so `ends with a colon` rules work", () => {
    expect(normaliseText("Dagsorden:   \nnæste")).toBe("Dagsorden:\nnæste");
  });
});

describe("normaliseValue", () => {
  test("normalises a single field without touching line structure", () => {
    expect(normaliseValue("Lærerv\u00E6relset")).toBe("Lærerværelset");
    expect(normaliseValue("a\nb")).toBe("a\nb");
  });
});

describe("segment", () => {
  test("drops blank lines but records the blank context around each line", () => {
    const lines = segment("Titel\n\nAfsnit\nfortsat");
    expect(lines.map((line) => line.text)).toEqual(["Titel", "Afsnit", "fortsat"]);
    expect(lines[0]?.blankAfter).toBe(true);
    expect(lines[1]?.blankBefore).toBe(true);
    expect(lines[1]?.blankAfter).toBe(false);
  });

  test("counts a tab as four columns of indentation", () => {
    const lines = segment("a\n\t- b\n    - c");
    expect(lines[1]?.indent).toBe(4);
    expect(lines[2]?.indent).toBe(4);
  });

  test("an empty input produces no lines", () => {
    expect(segment("")).toEqual([]);
  });
});
