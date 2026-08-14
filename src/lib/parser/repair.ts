import { isRichTextEmpty } from "../model/factory";
import type { Block, Section } from "../model/types";
import type { Assembly } from "./assemble";

/**
 * Stage 7 — merge stray fragments, drop empties, dedupe (docs/PLAN.md §11.1).
 *
 * Everything here is conservative: repair removes things the parser produced and
 * the user did not write. It never invents content, because a parser that
 * invents is one the review strip cannot make honest.
 */
export function repair(assembly: Assembly): Assembly {
  const sections: Section[] = [];

  for (const section of assembly.sections) {
    const blocks = dedupe(section.blocks.filter((block) => !isEmptyBlock(block)));
    if (blocks.length === 0 && !section.heading) continue;
    sections.push({ ...section, blocks });
  }

  const meta = { ...assembly.meta };
  if (meta.subtitle !== undefined && meta.subtitle.trim().length === 0) delete meta.subtitle;
  if (meta.location !== undefined && meta.location.trim().length === 0) delete meta.location;
  meta.title = meta.title.trim();

  const intro = assembly.intro && !isRichTextEmpty(assembly.intro) ? assembly.intro : undefined;
  return intro ? { meta, intro, sections } : { meta, sections };
}

export function isEmptyBlock(block: Block): boolean {
  switch (block.type) {
    case "heading":
      return block.text.trim().length === 0;
    case "paragraph":
      return isRichTextEmpty(block.content);
    case "list":
      return block.items.filter((item) => !isRichTextEmpty(item)).length === 0;
    case "agenda":
      return block.items.filter((item) => item.text.trim().length > 0).length === 0;
    case "decisions":
      return block.items.filter((item) => !isRichTextEmpty(item)).length === 0;
    case "actions":
      return block.items.filter((item) => !isRichTextEmpty(item.task)).length === 0;
    case "notice":
      return isRichTextEmpty(block.content) && (block.title ?? "").trim().length === 0;
    case "quote":
      return isRichTextEmpty(block.content);
    case "contact":
      return block.entries.filter((entry) => hasContactValue(entry)).length === 0;
    case "closing":
      return isRichTextEmpty(block.content) && (block.signature ?? []).length === 0;
  }
}

function hasContactValue(entry: {
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
  url?: string;
}): boolean {
  return Boolean(entry.name || entry.role || entry.email || entry.phone || entry.url);
}

/** Adjacent blocks whose rendered content is identical are a paste artefact. */
function dedupe(blocks: Block[]): Block[] {
  const result: Block[] = [];
  let previousKey = "";
  for (const block of blocks) {
    const key = signature(block);
    if (key === previousKey) continue;
    previousKey = key;
    result.push(block);
  }
  return result;
}

function signature(block: Block): string {
  const { id: _id, confidence: _confidence, sourceRuleId: _ruleId, ...rest } = block;
  return JSON.stringify(rest, (key, value) => (key === "id" ? undefined : value));
}
