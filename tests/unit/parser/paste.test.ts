import { describe, expect, test } from "bun:test";
import { inlineToPlain } from "../../../src/lib/model/factory";
import { looksStructured, parsePastedBlocks } from "../../../src/lib/parser/paste";

/** docs/PLAN.md §11.7 — pasting into an existing document. */

describe("looksStructured", () => {
  test("a short paste is never worth interrupting for", () => {
    expect(looksStructured("En linje")).toBe(false);
    expect(looksStructured("En\nTo\nTre")).toBe(false);
  });

  test("several marked lines are structure", () => {
    expect(looksStructured("Overskrift\n- Et\n- To\n- Tre\nnoget\nmere tekst her")).toBe(true);
  });

  test("several blank-line-separated paragraphs are structure, past five lines", () => {
    // The threshold is the plan's: more than five lines, and structure in them.
    expect(looksStructured("Et afsnit\n\nEt til\n\nOg et tredje\n\nOg et fjerde")).toBe(false);
    expect(looksStructured("Et\nafsnit\n\nEt til\nher\n\nOg et tredje\nher\n\nOg et fjerde")).toBe(
      true,
    );
  });

  test("a wall of prose is not", () => {
    const line = "Vi talte om forberedelsestiden og blev enige om at følge op.";
    expect(looksStructured([line, line, line, line, line, line].join("\n"))).toBe(false);
  });
});

describe("parsePastedBlocks", () => {
  test("recognises lists and nothing more ambitious", () => {
    const blocks = parsePastedBlocks("Indledning\n- Et\n- To\n\n1. Første\n2. Andet");
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "list", "list"]);
    expect(blocks[1]?.type === "list" ? blocks[1].ordered : undefined).toBe(false);
    expect(blocks[2]?.type === "list" ? blocks[2].ordered : undefined).toBe(true);
  });

  test("never invents a section, whatever the words say", () => {
    const blocks = parsePastedBlocks("Dagsorden\nBeslutninger\nHandlinger");
    expect(blocks.map((block) => block.type)).toEqual(["paragraph"]);
  });

  test("joins wrapped lines and splits on blank lines", () => {
    const blocks = parsePastedBlocks("Første\nlinje\n\nAndet afsnit");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.type === "paragraph" ? inlineToPlain(blocks[0].content) : "").toBe(
      "Første linje",
    );
  });

  test("auto-links what the editor schema can hold", () => {
    const blocks = parsePastedBlocks("Skriv til mette@kreds18.dk");
    const content = blocks[0]?.type === "paragraph" ? blocks[0].content : [];
    expect(content.at(-1)).toEqual({
      kind: "link",
      href: "mailto:mette@kreds18.dk",
      text: "mette@kreds18.dk",
    });
  });

  test("an empty paste still produces a valid body", () => {
    expect(parsePastedBlocks("")).toHaveLength(1);
  });

  test("normalises decomposed characters on the way in", () => {
    const blocks = parsePastedBlocks("Ma\u030Anedens punkt");
    expect(blocks[0]?.type === "paragraph" ? inlineToPlain(blocks[0].content) : "").toBe(
      "Månedens punkt",
    );
  });
});
