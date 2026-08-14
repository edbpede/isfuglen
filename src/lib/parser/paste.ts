import { list, newId, paragraph } from "../model/factory";
import type { RichText } from "../model/types";
import type { BodyBlock } from "../render/tiptap";
import { parseInline } from "./inline";
import { normaliseText } from "./normalise";
import { BULLET_MARKER, ORDERED_MARKER, stripMarker } from "./rules/shared";

/**
 * Pasting into an existing document — docs/PLAN.md §11.7.
 *
 * A different problem from the initial parse, and deliberately a much smaller
 * one. Running the full pipeline on a paste would try to invent new sections in
 * the middle of a paragraph, so this recognises lists and links and nothing
 * else. Anything more ambitious is offered as an explicit choice instead.
 */

/** Enough structure that offering to lay it out as sections is worth the ask. */
export function looksStructured(text: string): boolean {
  const lines = normaliseText(text).split("\n");
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length <= 5) return false;

  const marked = nonEmpty.filter(
    (line) => BULLET_MARKER.test(line.trim()) || ORDERED_MARKER.test(line.trim()),
  ).length;
  const blankSeparated = lines.filter((line) => line.trim().length === 0).length;

  return marked >= 2 || blankSeparated >= 2;
}

/**
 * Plain text → the paragraph and list blocks a section body may contain.
 * Consecutive marked lines become one list; everything else is a paragraph,
 * split on blank lines exactly as a writer would expect.
 */
export function parsePastedBlocks(text: string): BodyBlock[] {
  const lines = normaliseText(text).split("\n");
  const blocks: BodyBlock[] = [];

  let paragraphLines: string[] = [];
  let listItems: RichText[] = [];
  let listOrdered = false;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push(paragraph(parseInline(paragraphLines.join(" "))));
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(list(listItems, listOrdered));
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const bullet = BULLET_MARKER.test(line);
    const ordered = ORDERED_MARKER.test(line);

    if (bullet || ordered) {
      flushParagraph();
      if (listItems.length > 0 && listOrdered !== ordered) flushList();
      listOrdered = ordered;
      listItems.push(parseInline(stripMarker(line).text));
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  if (blocks.length === 0) blocks.push({ id: newId(), type: "paragraph", content: [] });
  return blocks;
}
