import { describe, expect, test } from "bun:test";
import { parseNewsletter } from "../../../src/lib/parser/index";
import { outline } from "../helpers/outline";

/**
 * The fixture corpus — docs/PLAN.md §20.1.
 *
 * Each fixture is a whole document, asserted end to end. The assertions are on
 * an id-free outline rather than a literal `NewsletterDoc`, because block ids
 * are `crypto.randomUUID()`; everything a regression would actually change is
 * still covered.
 */

const TODAY = new Date(2026, 0, 1);

async function parseFixture(path: string, lang: "da" | "en") {
  const raw = await Bun.file(new URL(`../../fixtures/${path}`, import.meta.url)).text();
  return parseNewsletter(raw, { lang, today: TODAY });
}

describe("da/klubmoede-referat", () => {
  test("produces the expected document", async () => {
    const { doc } = await parseFixture("da/klubmoede-referat.txt", "da");

    expect(outline(doc)).toEqual({
      meta: {
        title: "Klubmøde august",
        subtitle: "Referat fra mødet",
        date: "2026-08-14",
        timeStart: "15:30",
        timeEnd: "17:00",
        location: "Lærerværelset",
      },
      intro: "Kære kolleger. Her er et kort referat fra klubmødet.",
      sections: [
        {
          blocks: [
            {
              type: "agenda",
              items: ["Godkendelse af referat", "Nyt fra kredsen v/Mette 10m", "Arbejdstid"],
            },
          ],
        },
        {
          blocks: [
            {
              type: "decisions",
              items: ["Klubben bakker op om forslaget.", "Vi holder et ekstra møde i september."],
            },
          ],
        },
        {
          blocks: [
            {
              type: "actions",
              items: [
                "Indkalde til møde om arbejdstid | Mette | 2026-09-01",
                "Sende referat til alle | Jens | 2026-08-20",
              ],
            },
          ],
        },
        {
          blocks: [
            { type: "notice", tone: "important", text: "Frist for tilmelding er 20. august." },
          ],
        },
        {
          blocks: [{ type: "contact", items: ["Mette Hansen · mette@ishoejlaererkreds.dk"] }],
        },
        {
          blocks: [
            {
              type: "closing",
              text: "Med venlig hilsen",
              signature: ["Ishøj Lærerkreds", "Kreds 18"],
            },
          ],
        },
      ],
    });
  });

  test("drops the pack's own heading word so labels follow the document language", async () => {
    const { doc } = await parseFixture("da/klubmoede-referat.txt", "da");
    const agenda = doc.sections[0]?.blocks[0];
    expect(agenda?.type).toBe("agenda");
    // `Dagsorden` matched the rule pack, so it is not frozen into the document.
    expect(agenda && "title" in agenda ? agenda.title : undefined).toBeUndefined();
  });

  test("reports what it found", async () => {
    const { report } = await parseFixture("da/klubmoede-referat.txt", "da");
    expect(report.sectionCount).toBe(6);
    expect(report.agendaCount).toBe(1);
    expect(report.decisionCount).toBe(2);
    expect(report.actionCount).toBe(2);
    expect(report.noticeCount).toBe(1);
    expect(report.rulesFired["da.heading.agenda"]).toBe(1);
  });
});

describe("da/uformelle-noter", () => {
  test("handles unlabelled, ALL CAPS and mixed-marker notes", async () => {
    const { doc } = await parseFixture("da/uformelle-noter.txt", "da");

    expect(doc.meta).toEqual({
      title: "Noter fra klubmødet",
      date: "2026-09-17",
      timeStart: "14:00",
      timeEnd: "16:00",
      location: "personalerummet",
    });

    const headings = doc.sections.map((section) => section.heading?.text);
    expect(headings).toContain("Velkomst og nyt");
    expect(headings).toContain("Punkter til drøftelse");

    const types = doc.sections.flatMap((section) => section.blocks.map((block) => block.type));
    expect(types).toEqual(["paragraph", "list", "notice", "notice", "quote", "actions", "closing"]);
  });

  test("recognises both notice tones", async () => {
    const { doc } = await parseFixture("da/uformelle-noter.txt", "da");
    const notices = doc.sections
      .flatMap((section) => section.blocks)
      .filter((block) => block.type === "notice");
    expect(notices.map((notice) => notice.tone)).toEqual(["important", "info"]);
  });

  test("reads `Navn: opgave` and `Navn – opgave` action forms", async () => {
    const { doc } = await parseFixture("da/uformelle-noter.txt", "da");
    const actions = doc.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.type === "actions");
    expect(actions?.items.map((item) => item.owner)).toEqual(["Mette", "Jens"]);
    expect(actions?.items.map((item) => item.due)).toEqual(["2026-10-01", "2026-09-25"]);
  });

  test("strips the quotation marks the template redraws", async () => {
    const { doc } = await parseFixture("da/uformelle-noter.txt", "da");
    const quote = doc.sections.flatMap((s) => s.blocks).find((block) => block.type === "quote");
    expect(quote?.content[0]).toEqual({
      kind: "text",
      text: "Vi skal have en aftale, der kan holde til hverdagen.",
    });
  });
});

describe("en/branch-meeting", () => {
  test("the English pack mirrors the Danish one", async () => {
    const { doc } = await parseFixture("en/branch-meeting.txt", "en");

    expect(doc.meta.title).toBe("September branch meeting");
    expect(doc.meta.subtitle).toBe("Minutes from the meeting");
    expect(doc.meta.date).toBe("2026-09-17");
    expect(doc.meta.timeStart).toBe("14:00");
    expect(doc.meta.timeEnd).toBe("16:00");

    const types = doc.sections.flatMap((section) => section.blocks.map((block) => block.type));
    expect(types).toEqual(["agenda", "decisions", "actions", "notice", "contact", "closing"]);
  });

  test("day-first reading applies to English numeric dates too", async () => {
    const { doc } = await parseFixture("en/branch-meeting.txt", "en");
    const actions = doc.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.type === "actions");
    // `01/10/2026` is 1 October, never 10 January.
    expect(actions?.items[0]?.due).toBe("2026-10-01");
  });
});
