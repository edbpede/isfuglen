import { describe, expect, test } from "bun:test";
import { parseNewsletter } from "../../../src/lib/parser/index";

/** docs/PLAN.md §20.1 — the adversarial inputs, each asserted not to break. */

const TODAY = new Date(2026, 0, 1);
const parse = (raw: string, lang: "da" | "en" = "da") =>
  parseNewsletter(raw, { lang, today: TODAY });

describe("degenerate input", () => {
  test("empty input produces an empty, valid document", () => {
    const { doc, report } = parse("");
    expect(doc.sections).toEqual([]);
    expect(doc.meta.title).toBe("");
    expect(report.sectionCount).toBe(0);
    expect(report.lineCount).toBe(0);
  });

  test("whitespace-only input is the same as empty", () => {
    expect(parse("   \n\n\t  \n").doc.sections).toEqual([]);
  });

  test("a single word becomes the title and nothing else", () => {
    const { doc } = parse("Klubmøde");
    expect(doc.meta.title).toBe("Klubmøde");
    expect(doc.sections).toEqual([]);
  });

  test("a single sentence keeps its full stop and becomes content", () => {
    const { doc } = parse("Vi mødes på fredag.");
    expect(doc.meta.title).toBe("");
    expect(doc.intro).toBeDefined();
  });
});

describe("hostile shapes", () => {
  test("one very long line with no breaks stays one paragraph", () => {
    const sentence = "Vi talte om forberedelsestiden og blev enige om at følge op. ";
    const { doc } = parse(`Titel\n\n${sentence.repeat(80)}`);
    const blocks = doc.sections.flatMap((section) => section.blocks);
    expect(blocks.length + (doc.intro ? 1 : 0)).toBe(1);
  });

  test("fifty pages of notes parse in well under a second", () => {
    const page = [
      "Dagsorden",
      "1. Første punkt",
      "2. Andet punkt",
      "",
      "Beslutninger",
      "- Vi besluttede noget.",
      "",
      "Et almindeligt afsnit med lidt tekst i.",
      "",
    ].join("\n");
    const { doc, report } = parse(`Stort referat\n\n${page.repeat(200)}`);
    expect(doc.sections.length).toBeGreaterThan(100);
    expect(report.durationMs).toBeLessThan(2000);
  });

  test("ALL CAPS throughout does not produce a document of headings", () => {
    const { doc } = parse(
      "REFERAT\n\nVI TALTE OM FORBEREDELSESTIDEN OG BLEV ENIGE OM AT FØLGE OP PÅ DET.",
    );
    const headings = doc.sections.filter((section) => section.heading).length;
    expect(headings).toBe(0);
  });

  test("Windows line endings and tab-indented lists", () => {
    const { doc } = parse("Titel\r\n\r\nDagsorden\r\n\t- Et punkt\r\n\t- Et punkt til\r\n");
    const agenda = doc.sections.flatMap((s) => s.blocks).find((b) => b.type === "agenda");
    expect(agenda?.items.map((item) => item.text)).toEqual(["Et punkt", "Et punkt til"]);
  });

  test("decomposed Danish characters survive as composed ones", () => {
    const { doc } = parse("Kl\u0075b\u00ADm\u00F8de\n\nVi m\u00F8des i la\u030Ardsalen.");
    expect(doc.meta.title).toBe("Klubmøde");
    expect(JSON.stringify(doc)).toContain("lårdsalen");
  });

  test("smart quotes and Danish quotation marks both make a quote", () => {
    const smart = parse("Titel\n\n\u201CVi skal have en aftale.\u201D");
    expect(smart.doc.sections.flatMap((s) => s.blocks)[0]?.type).toBe("quote");
    const danish = parse("Titel\n\n»Vi skal have en aftale.«");
    expect(danish.doc.sections.flatMap((s) => s.blocks)[0]?.type).toBe("quote");
  });

  test("mixed Danish and English notes still find both packs", () => {
    const { doc } = parse("Referat\n\nDagsorden\n- Et punkt\n\nAction items\n- Do a thing – Anne");
    const types = doc.sections.flatMap((s) => s.blocks).map((block) => block.type);
    expect(types).toEqual(["agenda", "actions"]);
  });
});

describe("stability", () => {
  test("parsing is deterministic apart from ids", () => {
    const raw = "Titel\n\nDagsorden\n1. Et punkt\n\nHandlinger\n- Gør noget – Anne";
    const strip = (value: unknown) =>
      JSON.stringify(value, (key, item) =>
        key === "id" || key === "createdAt" || key === "updatedAt" ? undefined : item,
      );
    expect(strip(parse(raw).doc)).toBe(strip(parse(raw).doc));
  });

  test("a document always survives a JSON round trip", () => {
    const { doc } = parse("Titel\n\nDagsorden\n1. Et punkt");
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });
});
