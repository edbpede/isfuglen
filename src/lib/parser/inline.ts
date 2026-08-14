import { link, text as textNode } from "../model/factory";
import type { Inline, InlineMark, RichText } from "../model/types";

/**
 * Plain text → `RichText`.
 *
 * Recognises exactly what the raw-text view serialises (§7.5), so the two round
 * trip: `**bold**`, `*italic*` / `_italic_`, `[label](href)`, bare URLs and bare
 * email addresses. Nothing else — this is not a Markdown implementation, and it
 * must not grow into one.
 */

const TOKEN_SOURCE =
  /(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]\n]+\]\([^)\s]+\))|((?:https?:\/\/|www\.)[^\s<>"')]+)|([\w.+-]+@[\w-]+\.[\w.-]+)/
    .source;

/**
 * A fresh regex per call. `parseInline` recurses for nested marks, and a shared
 * `/g/` regex carries `lastIndex` across those calls — which turns the outer
 * loop into an infinite one the first time a mark contains another mark.
 */
function tokenRegex(): RegExp {
  return new RegExp(TOKEN_SOURCE, "g");
}

function withMarks(value: string, marks: InlineMark[]): Inline {
  return marks.length > 0 ? textNode(value, marks) : textNode(value);
}

function href(value: string): string {
  if (value.includes("@") && !value.includes("://")) return `mailto:${value}`;
  if (value.startsWith("www.")) return `https://${value}`;
  return value;
}

export function parseInline(source: string, marks: InlineMark[] = []): RichText {
  if (source.length === 0) return [];
  const nodes: RichText = [];
  let cursor = 0;

  const token = tokenRegex();
  let match = token.exec(source);
  while (match) {
    if (match.index > cursor) {
      nodes.push(withMarks(source.slice(cursor, match.index), marks));
    }

    const [whole, strongStar, strongUnderscore, emStar, emUnderscore, mdLink, url, email] = match;

    if (strongStar || strongUnderscore) {
      const inner = (strongStar ?? strongUnderscore ?? "").slice(2, -2);
      nodes.push(...parseInline(inner, addMark(marks, "bold")));
    } else if (emStar || emUnderscore) {
      const inner = (emStar ?? emUnderscore ?? "").slice(1, -1);
      nodes.push(...parseInline(inner, addMark(marks, "italic")));
    } else if (mdLink) {
      const parsed = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(mdLink);
      if (parsed) nodes.push(link(href(parsed[2] ?? ""), parsed[1] ?? "", marks));
    } else if (url) {
      const trimmed = url.replace(/[.,;:!?]+$/, "");
      nodes.push(link(href(trimmed), trimmed, marks));
      if (trimmed.length < url.length) nodes.push(withMarks(url.slice(trimmed.length), marks));
    } else if (email) {
      nodes.push(link(href(email), email, marks));
    }

    cursor = match.index + whole.length;
    match = token.exec(source);
  }

  if (cursor < source.length) nodes.push(withMarks(source.slice(cursor), marks));
  return nodes.length > 0 ? nodes : [withMarks(source, marks)];
}

function addMark(marks: InlineMark[], mark: InlineMark): InlineMark[] {
  return marks.includes(mark) ? marks : [...marks, mark];
}

/** `RichText` → the same Markdown-ish source, so the raw view round trips. */
export function serialiseInline(content: RichText): string {
  return content
    .map((node) => {
      if (node.kind === "break") return "\n";
      const marked = applyMarks(node.text, node.marks);
      if (node.kind === "link") {
        const bare = node.href === node.text || node.href === `mailto:${node.text}`;
        return bare ? marked : `[${marked}](${node.href})`;
      }
      return marked;
    })
    .join("");
}

/**
 * Bold uses asterisks, italic uses underscores. Mixing them matters: writing
 * both with asterisks produces `***begge***`, which no Markdown-ish reader —
 * including `parseInline` — can split back into two marks unambiguously.
 */
function applyMarks(value: string, marks?: InlineMark[]): string {
  let result = value;
  if (marks?.includes("italic")) result = `_${result}_`;
  if (marks?.includes("bold")) result = `**${result}**`;
  return result;
}
