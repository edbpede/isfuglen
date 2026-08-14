import type { Line } from "./types";

/** Stage 2 — split normalised text into non-blank lines with their context. */
export function segment(normalised: string): Line[] {
  if (normalised.length === 0) return [];
  const raw = normalised.split("\n");
  const lines: Line[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index] ?? "";
    if (value.trim().length === 0) continue;
    lines.push({
      text: value.trim(),
      index,
      indent: indentOf(value),
      blankBefore: index === 0 || (raw[index - 1] ?? "").trim().length === 0,
      blankAfter: index === raw.length - 1 || (raw[index + 1] ?? "").trim().length === 0,
    });
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
