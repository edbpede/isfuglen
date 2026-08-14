import type { Confidence } from "../model/types";
import { type Chunk, type Classified, isHeadingKind } from "./types";

/**
 * Stage 4 — consecutive same-kind lines become one provisional block (§11.1).
 *
 * Headings are always alone. Paragraphs break on a blank line, because a blank
 * line is the one piece of structure every writer uses without being asked.
 * Lists survive a stray blank line between items, which pasted notes are full of.
 */
export function group(entries: Classified[]): Chunk[] {
  const chunks: Chunk[] = [];

  for (const entry of entries) {
    const current = chunks.at(-1);
    const continues =
      current !== undefined &&
      current.kind === entry.kind &&
      !isHeadingKind(entry.kind) &&
      !(entry.kind === "paragraph" && current.entries.at(-1)?.line.blankAfter === true) &&
      !(entry.kind === "quote" && current.entries.at(-1)?.line.blankAfter === true) &&
      !(entry.kind === "metaLine" && current.entries.at(-1)?.line.blankAfter === true);

    if (continues && current) {
      current.entries.push(entry);
      current.confidence = weakest(current.confidence, entry.confidence);
      continue;
    }

    chunks.push({
      kind: entry.kind,
      entries: [entry],
      confidence: entry.confidence,
      ruleId: entry.ruleId,
    });
  }

  return chunks;
}

const ORDER: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };

export function weakest(a: Confidence, b: Confidence): Confidence {
  return ORDER[a] <= ORDER[b] ? a : b;
}
