import { describe, expect, test } from "bun:test";
import type { RichText } from "../../../src/lib/model/types";
import { parseInline, serialiseInline } from "../../../src/lib/parser/inline";

/** docs/PLAN.md §7.5 — the raw-text view round trips through this pair. */

describe("parseInline", () => {
  test("plain text is one run", () => {
    expect(parseInline("Kære kolleger")).toEqual([{ kind: "text", text: "Kære kolleger" }]);
  });

  test("recognises bold and italic in both syntaxes", () => {
    expect(parseInline("**fed**")).toEqual([{ kind: "text", text: "fed", marks: ["bold"] }]);
    expect(parseInline("*kursiv*")).toEqual([{ kind: "text", text: "kursiv", marks: ["italic"] }]);
    expect(parseInline("__fed__")).toEqual([{ kind: "text", text: "fed", marks: ["bold"] }]);
    expect(parseInline("_kursiv_")).toEqual([{ kind: "text", text: "kursiv", marks: ["italic"] }]);
  });

  test("nests marks", () => {
    expect(parseInline("**_begge_**")).toEqual([
      { kind: "text", text: "begge", marks: ["bold", "italic"] },
    ]);
  });

  test("auto-links bare URLs and email addresses", () => {
    expect(parseInline("Se www.kreds18.dk")).toEqual([
      { kind: "text", text: "Se " },
      { kind: "link", href: "https://www.kreds18.dk", text: "www.kreds18.dk" },
    ]);
    expect(parseInline("mette@kreds18.dk")).toEqual([
      { kind: "link", href: "mailto:mette@kreds18.dk", text: "mette@kreds18.dk" },
    ]);
  });

  test("does not swallow the punctuation after a link", () => {
    expect(parseInline("Se https://kreds18.dk.")).toEqual([
      { kind: "text", text: "Se " },
      { kind: "link", href: "https://kreds18.dk", text: "https://kreds18.dk" },
      { kind: "text", text: "." },
    ]);
  });

  test("reads a labelled link", () => {
    expect(parseInline("[kredsen](https://kreds18.dk)")).toEqual([
      { kind: "link", href: "https://kreds18.dk", text: "kredsen" },
    ]);
  });
});

describe("round trip", () => {
  const cases: RichText[] = [
    [{ kind: "text", text: "almindelig tekst" }],
    [{ kind: "text", text: "fed", marks: ["bold"] }],
    [{ kind: "text", text: "kursiv", marks: ["italic"] }],
    [{ kind: "text", text: "begge", marks: ["bold", "italic"] }],
    [
      { kind: "text", text: "Skriv til " },
      { kind: "link", href: "mailto:mette@kreds18.dk", text: "mette@kreds18.dk" },
      { kind: "text", text: " i dag" },
    ],
    [{ kind: "link", href: "https://kreds18.dk", text: "kredsen" }],
    [{ kind: "text", text: "æøå ÆØÅ »citat«" }],
  ];

  for (const content of cases) {
    test(`survives serialise → parse: ${serialiseInline(content)}`, () => {
      expect(parseInline(serialiseInline(content))).toEqual(content);
    });
  }

  test("a hard break serialises to a newline", () => {
    expect(
      serialiseInline([
        { kind: "text", text: "a" },
        { kind: "break" },
        { kind: "text", text: "b" },
      ]),
    ).toBe("a\nb");
  });
});
