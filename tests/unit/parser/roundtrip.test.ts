import { describe, expect, test } from "bun:test";
import { labelsFor } from "../../../src/lib/labels/index";
import type { DocLang } from "../../../src/lib/model/types";
import { parseNewsletter } from "../../../src/lib/parser/index";
import { renderPlainText } from "../../../src/lib/render/plaintext";
import { outline } from "../helpers/outline";

/**
 * The raw-text view — docs/PLAN.md §7.5.
 *
 * "Round-tripping is lossless for everything the parser can express" is a claim,
 * so it is asserted rather than described. The parser reads its own
 * serialisation, including an action item's owner and deadline and an agenda
 * item's presenter and duration.
 */

const TODAY = new Date(2026, 0, 1);

const FIXTURES: [string, DocLang][] = [
  ["da/klubmoede-referat.txt", "da"],
  ["da/uformelle-noter.txt", "da"],
  ["en/branch-meeting.txt", "en"],
];

describe("serialise → parse", () => {
  for (const [path, lang] of FIXTURES) {
    test(`${path} survives the round trip unchanged`, async () => {
      const raw = await Bun.file(new URL(`../../fixtures/${path}`, import.meta.url)).text();
      const first = parseNewsletter(raw, { lang, today: TODAY });
      const serialised = renderPlainText(first.doc, labelsFor(lang));
      const second = parseNewsletter(serialised, { lang, today: TODAY });

      expect(outline(second.doc)).toEqual(outline(first.doc));
    });

    test(`${path} is stable across a second round trip`, async () => {
      const raw = await Bun.file(new URL(`../../fixtures/${path}`, import.meta.url)).text();
      const first = parseNewsletter(raw, { lang, today: TODAY });
      const once = renderPlainText(first.doc, labelsFor(lang));
      const twice = renderPlainText(
        parseNewsletter(once, { lang, today: TODAY }).doc,
        labelsFor(lang),
      );

      expect(twice).toBe(once);
    });
  }
});

describe("the syntax the serialisation emits", () => {
  test("a Markdown heading keeps its block type rather than becoming prose", () => {
    const { doc } = parseNewsletter("Titel\n\n## DAGSORDEN\n1. Et punkt", {
      lang: "da",
      today: TODAY,
    });
    expect(doc.sections[0]?.blocks[0]?.type).toBe("agenda");
  });

  test("a tagged notice keeps its tone", () => {
    const { doc } = parseNewsletter("Titel\n\n[VIGTIGT] Frist er på fredag", {
      lang: "da",
      today: TODAY,
    });
    const block = doc.sections[0]?.blocks[0];
    expect(block?.type).toBe("notice");
    expect(block?.type === "notice" ? block.tone : undefined).toBe("important");
  });

  test("a quote keeps its attribution", () => {
    const { doc } = parseNewsletter("Titel\n\n> Vi skal have en aftale.\n> — Mette", {
      lang: "da",
      today: TODAY,
    });
    const block = doc.sections[0]?.blocks[0];
    expect(block?.type).toBe("quote");
    expect(block?.type === "quote" ? block.attribution : undefined).toBe("Mette");
  });

  test("an action item's owner and deadline survive the dash form", () => {
    const { doc } = parseNewsletter(
      "Titel\n\n## HANDLINGER\n- Indkalde til møde — Mette, frist 01.09.2026",
      { lang: "da", today: TODAY },
    );
    const block = doc.sections[0]?.blocks[0];
    expect(block?.type).toBe("actions");
    if (block?.type !== "actions") return;
    expect(block.items[0]?.owner).toBe("Mette");
    expect(block.items[0]?.due).toBe("2026-09-01");
  });
});
