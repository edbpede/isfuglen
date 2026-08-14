import { describe, expect, test } from "bun:test";
import type { DocLang } from "../../../src/lib/model/types";
import { classifyLine } from "../../../src/lib/parser/classify";
import { allRuleIds, rulesFor } from "../../../src/lib/parser/rules";
import { sentenceCase } from "../../../src/lib/parser/rules/shared";
import { segment } from "../../../src/lib/parser/segment";
import type { LineKind } from "../../../src/lib/parser/types";

/**
 * docs/PLAN.md §11.2–§11.6. Every rule has a focused test, and `covers every
 * rule id` fails the build when a new rule arrives without one.
 */

const fired = new Set<string>();

function kindOf(source: string, lang: DocLang = "da", lineIndex = 0): LineKind {
  const lines = segment(source);
  const line = lines[lineIndex];
  if (!line) throw new Error(`no line ${lineIndex} in fixture`);
  const result = classifyLine(line, { lang, lines }, rulesFor(lang));
  fired.add(result.ruleId);
  return result.kind;
}

function ruleOf(source: string, lang: DocLang = "da", lineIndex = 0): string {
  const lines = segment(source);
  const line = lines[lineIndex];
  if (!line) throw new Error(`no line ${lineIndex} in fixture`);
  const result = classifyLine(line, { lang, lines }, rulesFor(lang));
  fired.add(result.ruleId);
  return result.ruleId;
}

describe("Danish heading lexicon", () => {
  test("agenda triggers", () => {
    expect(ruleOf("Dagsorden\nnæste")).toBe("da.heading.agenda");
    expect(kindOf("Mødets punkter\nnæste")).toBe("agendaHeading");
    expect(kindOf("DAGSORDEN:\nnæste")).toBe("agendaHeading");
  });

  test("decision triggers, both as a heading and as a label", () => {
    expect(ruleOf("Beslutninger\nnæste")).toBe("da.heading.decisions");
    expect(kindOf("Beslutning: Klubben bakker op\nnæste")).toBe("decisionsHeading");
  });

  test("action triggers", () => {
    expect(ruleOf("Handlinger\nnæste")).toBe("da.heading.actions");
    expect(kindOf("Hvem gør hvad\nnæste")).toBe("actionsHeading");
  });

  test("`Ansvarlig` opens a section only when it is the whole line", () => {
    expect(kindOf("Ansvarlig\nnæste")).toBe("actionsHeading");
    expect(kindOf("Ansvarlig: Mette\nnæste")).not.toBe("actionsHeading");
  });

  test("important notices match as a heading and as a sentence prefix", () => {
    expect(ruleOf("Vigtigt\nnæste")).toBe("da.heading.important");
    expect(kindOf("OBS: Husk tilmelding\nnæste")).toBe("importantHeading");
    expect(kindOf("Frist for tilmelding er 20. august.\nnæste")).toBe("importantHeading");
  });

  test("info notices", () => {
    expect(ruleOf("Til orientering\nnæste")).toBe("da.heading.info");
  });

  test("contact triggers", () => {
    expect(ruleOf("Kontaktoplysninger\nnæste")).toBe("da.heading.contact");
  });

  test("closing triggers", () => {
    expect(ruleOf("Med venlig hilsen\nIshøj")).toBe("da.heading.closing");
    expect(kindOf("Mvh\nIshøj")).toBe("closingHeading");
    expect(kindOf("På vegne af klubben\nIshøj")).toBe("closingHeading");
  });

  test("labelled meta lines", () => {
    expect(ruleOf("Sted: Lærerværelset\nnæste")).toBe("da.meta.labelled");
    expect(kindOf("Tid og sted: 14. august kl. 15.30\nnæste")).toBe("metaLine");
  });

  test("generic structural headings, including the `Nyt fra …` prefix", () => {
    expect(ruleOf("Eventuelt\nnæste")).toBe("da.heading.generic");
    expect(kindOf("Nyt fra hovedstyrelsen\nnæste")).toBe("heading");
  });
});

describe("English heading lexicon", () => {
  test("mirrors the Danish pack", () => {
    expect(ruleOf("Agenda\nnext", "en")).toBe("en.heading.agenda");
    expect(ruleOf("Decisions\nnext", "en")).toBe("en.heading.decisions");
    expect(ruleOf("Action items\nnext", "en")).toBe("en.heading.actions");
    expect(ruleOf("Important\nnext", "en")).toBe("en.heading.important");
    expect(ruleOf("Please note\nnext", "en")).toBe("en.heading.info");
    expect(ruleOf("Contact details\nnext", "en")).toBe("en.heading.contact");
    expect(ruleOf("Kind regards\nAnne", "en")).toBe("en.heading.closing");
    expect(ruleOf("Location: the staff room\nnext", "en")).toBe("en.meta.labelled");
    expect(ruleOf("Any other business\nnext", "en")).toBe("en.heading.generic");
  });

  test("the Danish pack wins a tie in a Danish document", () => {
    // `Info` exists in both packs; the active language decides.
    expect(ruleOf("Info\nnæste", "da")).toBe("da.heading.info");
    expect(ruleOf("Info\nnext", "en")).toBe("en.heading.info");
  });
});

describe("structural heuristics", () => {
  test("bullet markers", () => {
    expect(ruleOf("- Punkt et")).toBe("da.structure.listItem");
    expect(kindOf("• Punkt et")).toBe("listItem");
    expect(kindOf("* Punkt et")).toBe("listItem");
    expect(kindOf("o Punkt et")).toBe("listItem");
  });

  test("ordered markers", () => {
    expect(ruleOf("1. Punkt et")).toBe("da.structure.orderedItem");
    expect(kindOf("1) Punkt et")).toBe("orderedItem");
    expect(kindOf("(1) Punkt et")).toBe("orderedItem");
    expect(kindOf("a) Punkt et")).toBe("orderedItem");
    expect(kindOf("1.1 Punkt et")).toBe("orderedItem");
  });

  test("a bulleted line is never a heading, whatever word it starts with", () => {
    expect(kindOf("- Dagsorden for mødet")).toBe("listItem");
  });

  test("a numbered line is a heading only when a blank line precedes it", () => {
    expect(kindOf("1. Godkendelse\n2. Dagsorden", "da", 1)).toBe("orderedItem");
    expect(kindOf("Noget\n\n1. Dagsorden\nnæste", "da", 1)).toBe("agendaHeading");
  });

  test("quotes in both Danish quotation styles", () => {
    expect(ruleOf('"Vi skal have en aftale."')).toBe("da.structure.quote");
    expect(kindOf("»Vi skal have en aftale.«")).toBe("quote");
  });

  test("contact lines", () => {
    expect(ruleOf("Mette Hansen · mette@kreds18.dk")).toBe("da.structure.contactLine");
    expect(kindOf("www.kreds18.dk")).toBe("contactLine");
  });

  test("ALL CAPS becomes a heading and is re-cased to Danish sentence case", () => {
    expect(ruleOf("VELKOMST OG NYT\nnæste")).toBe("da.structure.allCapsHeading");
    expect(sentenceCase("VELKOMST OG NYT", "da")).toBe("Velkomst og nyt");
    expect(sentenceCase("ÆNDRINGER", "da")).toBe("Ændringer");
  });

  test("a short unpunctuated line followed by content is a heading", () => {
    expect(ruleOf("Noget\n\nArbejdstid\nVi talte om det.", "da", 1)).toBe(
      "da.structure.shortHeading",
    );
  });

  test("a line ending in a colon in front of a list is that list's heading", () => {
    expect(ruleOf("Punkter til drøftelse:\n- Forberedelsestid")).toBe("da.structure.colonHeading");
  });

  test("a colon line alone between blank lines is a heading for whatever follows", () => {
    expect(
      kindOf("Noget\n\nBesparelser på skoleområdet:\n\nDer spares 8,3 mio. kr.", "da", 1),
    ).toBe("heading");
  });

  test("a colon line with nothing after it stays body text", () => {
    expect(kindOf("Noget\n\nVi mangler stadig svar på:", "da", 1)).toBe("paragraph");
  });

  test("everything else is a paragraph", () => {
    expect(ruleOf("Vi talte længe om forberedelsestiden, og alle var enige.")).toBe(
      "da.structure.paragraph",
    );
  });

  test("the raw-text serialisation reads back as the structure it came from", () => {
    // §7.5: the raw view round trips because the parser understands its own
    // output, not because the output is re-derived from the model.
    expect(ruleOf("## DAGSORDEN\n1. Et punkt")).toBe("da.heading.agenda");
    expect(ruleOf("## Et eller andet\nnoget")).toBe("da.markdown.heading");
    expect(kindOf("### Underoverskrift\nnoget")).toBe("heading");
    expect(ruleOf("[VIGTIGT] Frist for tilmelding")).toBe("da.markdown.notice");
    expect(ruleOf("> Vi skal have en aftale.")).toBe("da.markdown.quote");
  });

  test("a tagged notice carries its tone", () => {
    expect(kindOf("[TIL ORIENTERING] Kredsen holder generalforsamling")).toBe("importantHeading");
  });

  test("the same heuristics exist in the English pack", () => {
    expect(ruleOf("## Something else\nnext", "en")).toBe("en.markdown.heading");
    expect(ruleOf("[IMPORTANT] Deadline is Friday", "en")).toBe("en.markdown.notice");
    expect(ruleOf("> We need an agreement.", "en")).toBe("en.markdown.quote");
    expect(ruleOf("- One item", "en")).toBe("en.structure.listItem");
    expect(ruleOf("1. One item", "en")).toBe("en.structure.orderedItem");
    expect(ruleOf('"We need an agreement."', "en")).toBe("en.structure.quote");
    expect(ruleOf("Mette Hansen · mette@kreds18.dk", "en")).toBe("en.structure.contactLine");
    expect(ruleOf("WELCOME AND NEWS\nnext", "en")).toBe("en.structure.allCapsHeading");
    expect(ruleOf("Something\n\nWorking hours\nWe discussed it.", "en", 1)).toBe(
      "en.structure.shortHeading",
    );
    expect(ruleOf("Items for discussion:\n- Preparation time", "en")).toBe(
      "en.structure.colonHeading",
    );
    expect(ruleOf("We talked at length about preparation time, and everyone agreed.", "en")).toBe(
      "en.structure.paragraph",
    );
  });
});

describe("a list whose numbering the clipboard lost", () => {
  /**
   * Google Docs copies `1) Evaluering …` as `Evaluering …`. Without recovery the
   * first orphan becomes a heading, which is the one reading that is certainly
   * wrong — §11.4's short-heading heuristic firing on a list item.
   */
  const LOST = [
    "Lige om lidt skal vi have vores første MED-møde hvor vi skal i gang med",
    "",
    "Evaluering af dagene før skoledagene begyndte",
    "At give høringssvar til budget hvor der er kommet et rådighedskatalog.",
    "",
    "Og så videre.",
  ].join("\n");

  test("a lead-in ending in `med` turns the orphans that follow into list items", () => {
    expect(ruleOf(LOST, "da", 1)).toBe("da.structure.recoveredList");
    expect(kindOf(LOST, "da", 2)).toBe("orderedItem");
  });

  test("the lead-in itself is not swallowed into its own list", () => {
    expect(kindOf(LOST, "da", 0)).toBe("paragraph");
  });

  test("recovery is always low confidence, however cleanly it matched", () => {
    const lines = segment(LOST);
    const line = lines[1];
    if (!line) throw new Error("no line");
    expect(classifyLine(line, { lang: "da", lines }).confidence).toBe("low");
  });

  test("a colon lead-in works too, with the items straight after it", () => {
    const source = "Vi skal drøfte:\nForberedelsestid\nVikardækning\n\nDet var det.";
    expect(kindOf(source, "da", 1)).toBe("orderedItem");
    expect(kindOf(source, "da", 2)).toBe("orderedItem");
    // The colon line keeps its own job: it is the heading of the list.
    expect(ruleOf(source, "da", 0)).toBe("da.structure.colonHeading");
  });

  test("a marker the writer did type always wins", () => {
    expect(ruleOf("Vi skal drøfte:\n1) Forberedelsestid\n2) Vikardækning\n\nSlut", "da", 1)).toBe(
      "da.structure.orderedItem",
    );
  });

  test("one orphan is not a list", () => {
    expect(kindOf("Vi skal i gang med\n\nEvaluering af dagene\n\nSlut.", "da", 1)).not.toBe(
      "orderedItem",
    );
  });

  test("without a lead-in nothing is recovered", () => {
    const source = "Noget\n\nEvaluering af dagene\nAt give høringssvar\n\nSlut.";
    expect(kindOf(source, "da", 1)).toBe("heading");
  });

  test("a run that would chop a paragraph in half is refused", () => {
    // The third line is prose, so the run would end mid-block. Leaving the
    // numbering lost beats splitting someone's paragraph.
    const source = [
      "Vi skal i gang med",
      "Evaluering af dagene",
      "At give høringssvar",
      "Evalueringen skal selvfølgelig handle om de dage, der var planlagt på skolen, og om vores faglige eftermiddag på Gildbroskolen",
    ].join("\n");
    expect(kindOf(source, "da", 1)).not.toBe("orderedItem");
  });

  test("wrapped prose is not a list: lower-case openings and trailing commas", () => {
    const wrapped = "Vi har talt med\nMette og Jens om sagen,\nog de er enige i det hele.\n\nSlut.";
    expect(kindOf(wrapped, "da", 1)).not.toBe("orderedItem");
    expect(kindOf(wrapped, "da", 2)).not.toBe("orderedItem");
  });

  test("a line holding two sentences is a paragraph, not an item", () => {
    const source =
      "Vi skal i gang med\nEvaluering af dagene. Den skal handle om skolen.\nAt give høringssvar. Fristen er kort.\n\nSlut.";
    expect(kindOf(source, "da", 1)).not.toBe("orderedItem");
  });

  test("the English pack recovers the same shape", () => {
    const source =
      "We need to get started with\n\nEvaluating the days\nDrafting the response\n\nEnd.";
    expect(ruleOf(source, "en", 1)).toBe("en.structure.recoveredList");
    expect(kindOf(source, "en", 2)).toBe("orderedItem");
  });
});

describe("confidence", () => {
  test("an explicit lexical rule is high", () => {
    const lines = segment("Dagsorden\nnæste");
    const line = lines[0];
    if (!line) throw new Error("no line");
    expect(classifyLine(line, { lang: "da", lines }).confidence).toBe("high");
  });

  test("body text is medium, not low — flagging every paragraph is useless", () => {
    const lines = segment("Vi talte om forberedelsestiden, og alle var enige.");
    const line = lines[0];
    if (!line) throw new Error("no line");
    expect(classifyLine(line, { lang: "da", lines }).confidence).toBe("medium");
  });

  test("two rules of different kinds within ten points is low", () => {
    // contactLine (70) against orderedItem (78): the line is both.
    const lines = segment("1. mette@kreds18.dk");
    const line = lines[0];
    if (!line) throw new Error("no line");
    const result = classifyLine(line, { lang: "da", lines });
    expect(result.confidence).toBe("low");
  });
});

describe("rule registry", () => {
  test("covers every rule id", () => {
    const missing = allRuleIds().filter((id) => !fired.has(id));
    expect(missing).toEqual([]);
  });

  test("the active language's rules come first", () => {
    const rules = rulesFor("da");
    const firstEnglish = rules.findIndex((rule) => rule.id.startsWith("en."));
    const lastDanishLexical = rules.map((rule) => rule.id).lastIndexOf("da.heading.generic");
    expect(firstEnglish).toBeGreaterThan(lastDanishLexical);
  });
});
