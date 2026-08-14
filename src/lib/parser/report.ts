import { inlineToPlain } from "../model/factory";
import type { Block, NewsletterDoc } from "../model/types";
import type { Chunk, LowConfidenceEntry, ParseReport } from "./types";

/**
 * Stage 8 — the report the review strip reads (docs/PLAN.md §3.4, §11.6).
 *
 * Only `low` confidence is surfaced. `sourceRuleId` travels with it so a field
 * report becomes a debuggable statement: "the rule `da.heading.agenda` fired on
 * this line".
 */
export function buildReport(
  doc: NewsletterDoc,
  chunks: Chunk[],
  lineCount: number,
  durationMs: number,
): ParseReport {
  const rulesFired: Record<string, number> = {};
  for (const chunk of chunks) {
    for (const entry of chunk.entries) {
      rulesFired[entry.ruleId] = (rulesFired[entry.ruleId] ?? 0) + 1;
    }
  }

  let agendaCount = 0;
  let decisionCount = 0;
  let actionCount = 0;
  let noticeCount = 0;
  const lowConfidence: LowConfidenceEntry[] = [];

  for (const section of doc.sections) {
    for (const block of section.blocks) {
      if (block.type === "agenda") agendaCount += 1;
      if (block.type === "decisions") decisionCount += block.items.length;
      if (block.type === "actions") actionCount += block.items.length;
      if (block.type === "notice") noticeCount += 1;
      if (block.confidence === "low") {
        lowConfidence.push({
          blockId: block.id,
          ruleId: block.sourceRuleId ?? "unknown",
          preview: previewOf(block),
        });
      }
    }
  }

  return {
    sectionCount: doc.sections.length,
    agendaCount,
    decisionCount,
    actionCount,
    noticeCount,
    lowConfidence,
    rulesFired,
    lineCount,
    durationMs,
  };
}

const PREVIEW_LENGTH = 60;

function previewOf(block: Block): string {
  const value = plainOf(block).replace(/\s+/g, " ").trim();
  return value.length > PREVIEW_LENGTH ? `${value.slice(0, PREVIEW_LENGTH - 1)}…` : value;
}

function plainOf(block: Block): string {
  switch (block.type) {
    case "heading":
      return block.text;
    case "paragraph":
    case "notice":
    case "quote":
    case "closing":
      return inlineToPlain(block.content);
    case "list":
      return block.items.map(inlineToPlain).join(" · ");
    case "agenda":
      return block.items.map((item) => item.text).join(" · ");
    case "decisions":
      return block.items.map(inlineToPlain).join(" · ");
    case "actions":
      return block.items.map((item) => inlineToPlain(item.task)).join(" · ");
    case "contact":
      return block.entries.map((entry) => entry.name ?? entry.email ?? "").join(" · ");
  }
}
