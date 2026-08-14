import type { Line } from "./types";

/**
 * A Markdown heading marker. Stripped here rather than in a rule, so that every
 * rule downstream sees the heading's actual words — which is what lets the
 * lexicon classify `## DAGSORDEN` as an agenda heading (§7.5).
 */
const MARKDOWN_HEADING = /^(#{1,6})\s+(.+)$/;

/** Stage 2 — split normalised text into non-blank lines with their context. */
export function segment(normalised: string): Line[] {
  if (normalised.length === 0) return [];
  const raw = normalised.split("\n");
  const lines: Line[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index] ?? "";
    if (value.trim().length === 0) continue;

    const trimmed = value.trim();
    const marker = MARKDOWN_HEADING.exec(trimmed);
    const line: Line = {
      text: marker ? (marker[2] ?? "").trim() : trimmed,
      index,
      indent: indentOf(value),
      blankBefore: index === 0 || (raw[index - 1] ?? "").trim().length === 0,
      blankAfter: index === raw.length - 1 || (raw[index + 1] ?? "").trim().length === 0,
    };
    if (marker) line.headingLevel = (marker[1] ?? "").length >= 3 ? 3 : 2;

    lines.push(line);
  }

  return lines;
}

function indentOf(value: string): number {
  let columns = 0;
  for (const char of value) {
    if (char === " ") columns += 1;
    else if (char === "\t") columns += 4;
    else break;
  }
  return columns;
}
