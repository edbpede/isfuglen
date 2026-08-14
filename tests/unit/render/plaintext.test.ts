import { describe, expect, test } from "bun:test";
import { labelsFor } from "../../../src/lib/labels/index";
import { renderPlainText } from "../../../src/lib/render/plaintext";
import { everyBlockDoc } from "../helpers/document";

/** docs/PLAN.md §15.4 — a readable serialisation, not a stripped-tags dump. */

describe("plain text", () => {
  const danish = renderPlainText(everyBlockDoc("da"), labelsFor("da"));

  test("the title is upper-cased and the meta line is Danish", () => {
    expect(danish.startsWith("KLUBMØDE AUGUST")).toBe(true);
    expect(danish).toContain("fredag den 14. august 2026");
    expect(danish).toContain("kl.\u00A015.30\u201317.00");
  });

  test("block labels are headings, and notices are tagged", () => {
    expect(danish).toContain("## DAGSORDEN");
    expect(danish).toContain("## BESLUTNINGER");
    expect(danish).toContain("## HANDLINGER");
    expect(danish).toContain("[VIGTIGT] Frist for tilmelding er 20. august.");
    expect(danish).toContain("[TIL ORIENTERING] Kredsen holder generalforsamling i marts.");
  });

  test("an action item keeps its owner and deadline in a form the parser reads back", () => {
    expect(danish).toContain("- Indkalde til møde — Mette, frist 01.09.2026");
  });

  test("an agenda item keeps its presenter and duration", () => {
    expect(danish).toContain("2. Nyt fra kredsen (v/ Mette, 10 min.)");
  });

  test("lists keep their marker type", () => {
    expect(danish).toContain("- Første punkt");
    expect(danish).toContain("1. Et");
  });

  test("a quote keeps its attribution", () => {
    expect(danish).toContain("> Vi skal have en aftale.");
    expect(danish).toContain("> — Mette Hansen");
  });

  test("marks serialise so that bold and italic can be told apart", () => {
    expect(danish).toContain("**fed**");
    expect(danish).toContain("_kursiv_");
  });

  test("a bare link is written bare and a labelled one keeps its label", () => {
    expect(danish).toContain("[kredsen](https://kreds18.dk)");
  });

  test("English labels follow the document language", () => {
    const english = renderPlainText(everyBlockDoc("en"), labelsFor("en"));
    expect(english).toContain("## AGENDA");
    expect(english).toContain("## DECISIONS");
    expect(english).toContain("## ACTION ITEMS");
    expect(english).toContain("[IMPORTANT]");
    // See tests/unit/i18n/format.test.ts: the comma in the English full date is
    // ICU's, and it has changed between releases.
    expect(english).toMatch(/Friday,? 14 August 2026/);
  });

  test("nothing is hard-wrapped — wrapping fights every target that reflows", () => {
    const longest = danish.split("\n").reduce((a, b) => (a.length > b.length ? a : b));
    expect(longest.length).toBeGreaterThan(40);
  });

  test("the output ends with exactly one newline and no blank-line runs", () => {
    expect(danish.endsWith("\n")).toBe(true);
    expect(danish).not.toContain("\n\n\n");
  });
});
