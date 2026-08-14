import { inlineToPlain } from "../../../src/lib/model/factory";
import type { Block, NewsletterDoc, Section } from "../../../src/lib/model/types";

/**
 * A stable, readable summary of a parsed document.
 *
 * Block ids are `crypto.randomUUID()`, so a fixture cannot assert on a whole
 * `NewsletterDoc` literal. The outline keeps everything a regression would
 * change — structure, types, labels, extracted fields — and drops what it
 * cannot: the ids.
 */

export interface BlockOutline {
  type: Block["type"];
  title?: string;
  text?: string;
  items?: string[];
  tone?: string;
  ordered?: boolean;
  signature?: string[];
}

export interface SectionOutline {
  heading?: string;
  level?: 2 | 3;
  blocks: BlockOutline[];
}

export interface DocOutline {
  meta: Record<string, string>;
  intro?: string;
  sections: SectionOutline[];
}

export function outline(doc: NewsletterDoc): DocOutline {
  const meta: Record<string, string> = {};
  for (const [key, value] of Object.entries(doc.meta)) {
    if (typeof value === "string" && value.length > 0) meta[key] = value;
  }
  const result: DocOutline = {
    meta,
    sections: doc.sections.map(sectionOutline),
  };
  if (doc.intro) result.intro = inlineToPlain(doc.intro);
  return result;
}

function sectionOutline(section: Section): SectionOutline {
  const result: SectionOutline = { blocks: section.blocks.map(blockOutline) };
  if (section.heading) {
    result.heading = section.heading.text;
    result.level = section.heading.level;
  }
  return result;
}

export function blockOutline(block: Block): BlockOutline {
  switch (block.type) {
    case "heading":
      return { type: block.type, text: block.text };
    case "paragraph":
      return { type: block.type, text: inlineToPlain(block.content) };
    case "list":
      return { type: block.type, ordered: block.ordered, items: block.items.map(inlineToPlain) };
    case "agenda":
      return {
        type: block.type,
        ...(block.title ? { title: block.title } : {}),
        items: block.items.map((item) =>
          [
            item.text,
            item.presenter ? `v/${item.presenter}` : "",
            item.minutes ? `${item.minutes}m` : "",
          ]
            .filter((part) => part.length > 0)
            .join(" "),
        ),
      };
    case "decisions":
      return {
        type: block.type,
        ...(block.title ? { title: block.title } : {}),
        items: block.items.map(inlineToPlain),
      };
    case "actions":
      return {
        type: block.type,
        ...(block.title ? { title: block.title } : {}),
        items: block.items.map((item) =>
          [inlineToPlain(item.task), item.owner ?? "", item.due ?? ""]
            .filter((part) => part.length > 0)
            .join(" | "),
        ),
      };
    case "notice":
      return {
        type: block.type,
        tone: block.tone,
        ...(block.title ? { title: block.title } : {}),
        text: inlineToPlain(block.content),
      };
    case "quote":
      return { type: block.type, text: inlineToPlain(block.content) };
    case "contact":
      return {
        type: block.type,
        ...(block.title ? { title: block.title } : {}),
        items: block.entries.map((entry) =>
          [entry.name, entry.role, entry.email, entry.phone, entry.url]
            .filter((part): part is string => Boolean(part))
            .join(" · "),
        ),
      };
    case "closing":
      return {
        type: block.type,
        text: inlineToPlain(block.content),
        ...(block.signature ? { signature: block.signature } : {}),
      };
  }
}

/** Removes every `id` so two structurally identical documents compare equal. */
export function stripIds<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, item) => (key === "id" ? undefined : item))) as T;
}
