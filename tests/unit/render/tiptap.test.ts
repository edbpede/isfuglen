import { describe, expect, test } from "bun:test";
import type { InlineMark, RichText } from "../../../src/lib/model/types";
import {
  type BodyBlock,
  blocksToTipTapDoc,
  inlineToTipTap,
  tipTapDocToBlocks,
  tipTapToInline,
} from "../../../src/lib/render/tiptap";
import { stripIds } from "../helpers/outline";

/** docs/PLAN.md §10.4 — round-trip identity, property-tested over generated input. */

describe("inline conversion", () => {
  test("marks become TipTap marks", () => {
    expect(inlineToTipTap([{ kind: "text", text: "fed", marks: ["bold"] }])).toEqual([
      { type: "text", text: "fed", marks: [{ type: "bold" }] },
    ]);
  });

  test("a link is a mark on a text node, not a node of its own", () => {
    expect(inlineToTipTap([{ kind: "link", href: "https://a.dk", text: "a" }])).toEqual([
      { type: "text", text: "a", marks: [{ type: "link", attrs: { href: "https://a.dk" } }] },
    ]);
  });

  test("a hard break survives in both directions", () => {
    const content: RichText = [{ kind: "break" }];
    expect(tipTapToInline(inlineToTipTap(content))).toEqual(content);
  });

  test("ignores node types outside our schema", () => {
    expect(tipTapToInline([{ type: "image", attrs: { src: "x.png" } }])).toEqual([]);
  });

  test("drops empty text runs rather than emitting invalid TipTap nodes", () => {
    expect(inlineToTipTap([{ kind: "text", text: "" }])).toEqual([]);
  });
});

describe("round-trip identity", () => {
  const words = ["Klubmøde", "æøå", "arbejdstidsaftale", "referat", "ÆØÅ"];
  const markSets: (InlineMark[] | undefined)[] = [
    undefined,
    ["bold"],
    ["italic"],
    ["bold", "italic"],
  ];

  const generated: RichText[] = [];
  for (const word of words) {
    for (const marks of markSets) {
      generated.push(
        marks ? [{ kind: "text", text: word, marks }] : [{ kind: "text", text: word }],
      );
      generated.push([
        { kind: "text", text: `${word} ` },
        marks
          ? { kind: "link", href: "https://kreds18.dk", text: word, marks }
          : { kind: "link", href: "https://kreds18.dk", text: word },
        { kind: "break" },
        { kind: "text", text: word },
      ]);
    }
  }

  test(`RichText survives ${generated.length} generated conversions`, () => {
    for (const content of generated) {
      expect(tipTapToInline(inlineToTipTap(content))).toEqual(content);
    }
  });
});

describe("block conversion", () => {
  const blocks: BodyBlock[] = [
    { id: "a", type: "paragraph", content: [{ kind: "text", text: "Et afsnit" }] },
    {
      id: "b",
      type: "list",
      ordered: false,
      items: [[{ kind: "text", text: "Et" }], [{ kind: "text", text: "To" }]],
    },
    {
      id: "c",
      type: "list",
      ordered: true,
      items: [[{ kind: "text", text: "Første" }]],
    },
  ];

  test("paragraphs and lists round trip", () => {
    expect(stripIds(tipTapDocToBlocks(blocksToTipTapDoc(blocks)))).toEqual(stripIds(blocks));
  });

  test("an empty body still produces a valid document with one paragraph", () => {
    expect(blocksToTipTapDoc([])).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});
