import {
  link as makeLink,
  list as makeList,
  paragraph as makeParagraph,
  text as makeText,
  newId,
} from "../model/factory";
import type { Block, Inline, InlineMark, RichText } from "../model/types";

/**
 * The editor bridge — docs/PLAN.md §10.4.
 *
 * These are the only two functions in the project that know TipTap's JSON shape,
 * and they are pure. `export/` never imports this module: an export is a
 * function of `NewsletterDoc` and a `DocLang`, nothing else.
 *
 * The types are declared locally rather than imported from `@tiptap/core` so
 * that the converters can be unit-tested in `bun test` with no DOM and no
 * editor package loaded.
 */

export interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
}

const MARK_NAMES: Record<string, InlineMark> = { bold: "bold", italic: "italic" };

export function inlineToTipTap(content: RichText): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  for (const node of content) {
    if (node.kind === "break") {
      nodes.push({ type: "hardBreak" });
      continue;
    }
    if (node.text.length === 0) continue;

    const marks: TipTapMark[] = [];
    for (const mark of node.marks ?? []) marks.push({ type: mark });
    if (node.kind === "link") marks.push({ type: "link", attrs: { href: node.href } });

    nodes.push(
      marks.length > 0
        ? { type: "text", text: node.text, marks }
        : { type: "text", text: node.text },
    );
  }
  return nodes;
}

export function tipTapToInline(nodes: TipTapNode[] | undefined): RichText {
  if (!nodes) return [];
  const content: RichText = [];
  for (const node of nodes) {
    if (node.type === "hardBreak") {
      content.push({ kind: "break" });
      continue;
    }
    if (node.type !== "text" || !node.text) continue;

    const marks: InlineMark[] = [];
    let href: string | undefined;
    for (const mark of node.marks ?? []) {
      const known = MARK_NAMES[mark.type];
      if (known) marks.push(known);
      if (mark.type === "link" && typeof mark.attrs?.href === "string") href = mark.attrs.href;
    }

    content.push(href ? makeLink(href, node.text, marks) : makeText(node.text, marks));
  }
  return content;
}

/**
 * The blocks a section body's editor may contain. Everything else in the model
 * is edited through a real form field, not a rich-text surface (§5.3).
 */
export type BodyBlock = Extract<Block, { type: "paragraph" } | { type: "list" }>;

export function isBodyBlock(block: Block): block is BodyBlock {
  return block.type === "paragraph" || block.type === "list";
}

export function blocksToTipTapDoc(blocks: BodyBlock[]): TipTapNode {
  const content: TipTapNode[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph") {
      content.push(paragraphNode(block.content));
      continue;
    }
    content.push({
      type: block.ordered ? "orderedList" : "bulletList",
      content: block.items.map((item) => ({
        type: "listItem",
        content: [paragraphNode(item)],
      })),
    });
  }
  if (content.length === 0) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

function paragraphNode(content: RichText): TipTapNode {
  const inline = inlineToTipTap(content);
  return inline.length > 0 ? { type: "paragraph", content: inline } : { type: "paragraph" };
}

export function tipTapDocToBlocks(doc: TipTapNode): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  for (const node of doc.content ?? []) {
    if (node.type === "paragraph") {
      blocks.push({ id: newId(), type: "paragraph", content: tipTapToInline(node.content) });
      continue;
    }
    if (node.type === "bulletList" || node.type === "orderedList") {
      const items: RichText[] = [];
      for (const item of node.content ?? []) {
        const firstParagraph = (item.content ?? []).find((child) => child.type === "paragraph");
        items.push(tipTapToInline(firstParagraph?.content));
      }
      blocks.push({
        id: newId(),
        type: "list",
        ordered: node.type === "orderedList",
        items,
      });
    }
  }
  return blocks;
}

export { makeList, makeParagraph };

/** Turns arbitrary `Inline` into the subset the editor schema accepts. */
export function coerceInline(nodes: Inline[]): RichText {
  return nodes.filter((node) => node.kind !== "text" || node.text.length > 0);
}
