/**
 * Stage 1 — docs/PLAN.md §11.1, §8.7.
 *
 * Unicode normalisation to NFC is the load-bearing part. macOS clipboards and
 * several PDF extractors emit decomposed `å` (`a` + U+030A), which then fails a
 * naive `includes("å")` in the Danish rule packs and renders inconsistently in
 * the DOCX. Normalising once at the boundary removes that whole class of bug:
 * `"a\u030A" === "\u00E5"` is false, `"a\u030A".normalize("NFC") === "\u00E5"`
 * is true.
 */

// Written as an alternation rather than a character class: ZWJ (U+200D) is a
// joiner, and a class containing it can match half of a composed sequence.
const ZERO_WIDTH = /\u200B|\u200C|\u200D|\u2060|\uFEFF/g;
/** NBSP, narrow NBSP, figure space, thin space — all render as a space. */
const SPACE_LIKE = /[\u00A0\u2007\u202F\u2009\u2002\u2003]/g;
/** Soft hyphen: invisible on screen, poison in a string comparison. */
const SOFT_HYPHEN = /\u00AD/g;

export function normaliseText(input: string): string {
  return (
    input
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      .replace(ZERO_WIDTH, "")
      .replace(SOFT_HYPHEN, "")
      .replace(SPACE_LIKE, " ")
      // Trailing whitespace on a line is never meaningful here and breaks
      // "line ends with a colon" style rules.
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      // Three or more blank lines carry no more meaning than one blank line.
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** The same normalisation applied to a single value, e.g. a form field on paste. */
export function normaliseValue(input: string): string {
  return input
    .normalize("NFC")
    .replace(ZERO_WIDTH, "")
    .replace(SOFT_HYPHEN, "")
    .replace(SPACE_LIKE, " ");
}
