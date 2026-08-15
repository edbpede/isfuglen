import type { DocLang } from "../../model/types";
import type { Line, LineKind, ParseContext, Rule, RuleExtraction } from "../types";

/**
 * Rule construction helpers — docs/PLAN.md §11.2.
 *
 * Rules are data. Everything here exists so that a rule pack reads as a table
 * of triggers rather than as a pile of regular expressions, and so that adding a
 * language is adding a file.
 */

export function localeOf(lang: DocLang): string {
  return lang === "da" ? "da-DK" : "en-GB";
}

export function lower(value: string, lang: DocLang): string {
  return value.toLocaleLowerCase(localeOf(lang));
}

/** `-`, `–`, `—`, `•`, `·`, `*`, `o` — the Danish list markers of §11.3. */
export const BULLET_MARKER = /^([-–—•·*]|o)\s+/;
/** `1.`, `1)`, `(1)`, `a)`, `a.`, `1.1` */
export const ORDERED_MARKER = /^(\(?\d+(?:\.\d+)*[.)]?|\(?[a-zæøå][.)])\s+/i;
export const NUMERIC_PREFIX = /^\(?\d+(?:\.\d+)*[.)]\s+/;

export function stripNumericPrefix(value: string): string {
  return value.replace(NUMERIC_PREFIX, "").trim();
}

export function hasBulletMarker(value: string): boolean {
  return BULLET_MARKER.test(value);
}

export function stripMarker(value: string): { text: string; marker: string; ordered: boolean } {
  const bullet = BULLET_MARKER.exec(value);
  if (bullet) {
    return { text: value.slice(bullet[0].length).trim(), marker: bullet[1] ?? "-", ordered: false };
  }
  const ordered = ORDERED_MARKER.exec(value);
  if (ordered) {
    return {
      text: value.slice(ordered[0].length).trim(),
      marker: ordered[1] ?? "1.",
      ordered: true,
    };
  }
  return { text: value, marker: "", ordered: false };
}

export type TriggerMode = "labelled" | "exact" | "prefix";

export interface Trigger {
  word: string;
  mode?: TriggerMode;
}

export function triggers(words: string[], mode: TriggerMode = "labelled"): Trigger[] {
  return words.map((word) => ({ word, mode }));
}

/** Splits `Beslutning: vi gør X` into its label and the rest of the line. */
export function splitLabelled(value: string): { head: string; rest: string } {
  const colon = value.indexOf(":");
  if (colon > 0 && colon < 42) {
    return { head: value.slice(0, colon).trim(), rest: value.slice(colon + 1).trim() };
  }
  const dash = /^([^–—-]{2,40})\s+[–—-]\s+(.+)$/.exec(value);
  if (dash) return { head: (dash[1] ?? "").trim(), rest: (dash[2] ?? "").trim() };
  return { head: value.trim(), rest: "" };
}

const TRAILING_PUNCTUATION = /[.:;!?]+$/;

export function canonical(value: string, lang: DocLang): string {
  return lower(stripNumericPrefix(value).replace(TRAILING_PUNCTUATION, "").trim(), lang);
}

export interface LexiconRuleOptions {
  id: string;
  lang: DocLang;
  kind: LineKind;
  score: number;
  triggers: Trigger[];
  /** Longest line length that may still be read as this heading. */
  maxLength?: number;
}

/**
 * A heading-lexicon rule. Matches the whole line, `Trigger: rest of the line`,
 * and optionally a prefix such as `Nyt fra …`. A line that starts with a bullet
 * marker is never a heading — it is an item in someone's list.
 */
export function lexiconRule(options: LexiconRuleOptions): Rule {
  const maxLength = options.maxLength ?? 80;
  const prepared = options.triggers.map((trigger) => ({
    mode: trigger.mode ?? "labelled",
    canonical: lower(trigger.word, options.lang),
  }));

  return {
    id: options.id,
    lang: options.lang,
    kind: options.kind,
    score: options.score,
    test(line) {
      // A line the writer bulleted is an item, never a heading.
      if (hasBulletMarker(line.text)) return false;

      const { head, rest } = splitLabelled(line.text);
      const wholeLine = canonical(line.text, options.lang);
      const headOnly = canonical(head, options.lang);

      // A numbered line may still be a heading (`1. Dagsorden`), but only when a
      // blank line separates it from what came before. Inside a run of numbered
      // lines it is an agenda item, whatever word it happens to start with.
      if (ORDERED_MARKER.test(line.text)) {
        if (!line.blankBefore) return false;
        return prepared.some(
          (trigger) => trigger.mode !== "prefix" && trigger.canonical === wholeLine,
        );
      }

      for (const trigger of prepared) {
        if (trigger.mode === "exact") {
          if (wholeLine === trigger.canonical) return true;
          continue;
        }
        if (trigger.mode === "prefix") {
          if (line.text.length <= maxLength && wholeLine.startsWith(`${trigger.canonical} `)) {
            return true;
          }
          continue;
        }
        if (wholeLine === trigger.canonical) return true;
        if (rest.length > 0 && headOnly === trigger.canonical) return true;
      }
      return false;
    },
    extract(line): RuleExtraction {
      const { head, rest } = splitLabelled(line.text);
      const wholeLine = canonical(line.text, options.lang);
      const headOnly = canonical(head, options.lang);

      const whole = prepared.find(
        (trigger) => trigger.mode !== "prefix" && trigger.canonical === wholeLine,
      );
      if (whole) {
        return {
          shape: "whole",
          label: stripNumericPrefix(line.text).replace(TRAILING_PUNCTUATION, "").trim(),
          labelIsGeneric: true,
        };
      }

      const labelled = prepared.find(
        (trigger) => trigger.mode !== "prefix" && rest.length > 0 && trigger.canonical === headOnly,
      );
      if (labelled) {
        return { shape: "labelled", label: head.trim(), labelIsGeneric: true, rest };
      }

      const prefix = prepared.find(
        (trigger) => trigger.mode === "prefix" && wholeLine.startsWith(`${trigger.canonical} `),
      );
      return {
        shape: "prefix",
        label: prefix ? prefix.canonical : head.trim(),
        labelIsGeneric: true,
        rest: line.text,
      };
    },
  };
}

/* ---------- structural rules, shared by every language ---------- */

const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;
const URL = /\b(?:https?:\/\/|www\.)\S+/i;
const PHONE = /(?:\+45\s*)?(?:\d{2}\s?){4}\b/;
const OPEN_QUOTE = /^["“»„'']/;
const CLOSE_QUOTE = /["”«''],?[.!?]?$/;

/**
 * `[VIGTIGT] …` and `[TIL ORIENTERING] …` — the shape the plain-text
 * serialisation gives a notice (§15.4).
 */
const TAGGED_NOTICE = /^\[([^\]]{2,40})\]\s+(.+)$/;
const IMPORTANT_TAGS = new Set(["vigtigt", "vigtig", "obs", "nb", "important", "note"]);

export function structuralRules(lang: DocLang): Rule[] {
  return [
    // A line the source explicitly tagged as a notice.
    {
      id: `${lang}.markdown.notice`,
      lang,
      kind: "importantHeading",
      score: 94,
      test: (line) => TAGGED_NOTICE.test(line.text),
      extract: (line) => {
        const match = TAGGED_NOTICE.exec(line.text);
        const tag = lower((match?.[1] ?? "").trim(), lang);
        return {
          shape: "labelled",
          label: (match?.[1] ?? "").trim(),
          labelIsGeneric: true,
          rest: (match?.[2] ?? "").trim(),
          tone: IMPORTANT_TAGS.has(tag) ? "important" : "info",
        };
      },
    },
    // `> quoted line` and its `> — attribution` companion.
    {
      id: `${lang}.markdown.quote`,
      lang,
      kind: "quote",
      score: 92,
      test: (line) => /^>\s+/.test(line.text),
      extract: (line) => {
        const body = line.text.replace(/^>\s+/, "").trim();
        const attribution = /^[\u2014\u2013-]\s+(.+)$/.exec(body);
        return attribution ? { attribution: (attribution[1] ?? "").trim() } : { rest: body };
      },
    },
    /**
     * An explicit Markdown heading whose words the lexicon did not recognise.
     * Scored below both lexical packs on purpose: `## Dagsorden` must still be
     * an agenda heading, not a generic one.
     */
    {
      id: `${lang}.markdown.heading`,
      lang,
      kind: "heading",
      score: 82,
      test: (line) => line.headingLevel !== undefined,
      extract: (line) => ({ label: line.text, level: line.headingLevel }),
    },
    {
      id: `${lang}.structure.orderedItem`,
      lang,
      kind: "orderedItem",
      score: 78,
      test: (line) => ORDERED_MARKER.test(line.text) && !NUMERIC_HEADING_ONLY.test(line.text),
      extract: (line) => {
        const stripped = stripMarker(line.text);
        return { rest: stripped.text, marker: stripped.marker };
      },
    },
    {
      id: `${lang}.structure.listItem`,
      lang,
      kind: "listItem",
      score: 78,
      test: (line) => BULLET_MARKER.test(line.text),
      extract: (line) => {
        const stripped = stripMarker(line.text);
        return { rest: stripped.text, marker: stripped.marker };
      },
    },
    /**
     * A list whose numbering the clipboard ate. Scored above `shortHeading` so
     * the first item stops being read as a heading, and below every marker and
     * lexicon rule so a list the writer actually marked still wins.
     */
    {
      id: `${lang}.structure.recoveredList`,
      lang,
      kind: "orderedItem",
      score: 50,
      uncertain: true,
      test: (line, ctx) => lostListRun(positionOf(line, ctx), ctx) !== undefined,
      extract: (line) => ({ rest: line.text }),
    },
    {
      id: `${lang}.structure.quote`,
      lang,
      kind: "quote",
      score: 62,
      test: (line) =>
        OPEN_QUOTE.test(line.text) && CLOSE_QUOTE.test(line.text) && line.text.length > 8,
      extract: (line) => ({
        rest: line.text.replace(OPEN_QUOTE, "").replace(CLOSE_QUOTE, "").trim(),
      }),
    },
    {
      id: `${lang}.structure.contactLine`,
      lang,
      kind: "contactLine",
      score: 70,
      test: (line) =>
        line.text.length < 120 &&
        (EMAIL.test(line.text) ||
          URL.test(line.text) ||
          (PHONE.test(line.text) && line.text.length < 60)),
    },
    {
      id: `${lang}.structure.allCapsHeading`,
      lang,
      kind: "heading",
      score: 58,
      test: (line) =>
        line.text.length >= 3 &&
        line.text.length < 60 &&
        !hasBulletMarker(line.text) &&
        isAllCaps(line.text, lang),
      extract: (line) => ({ label: sentenceCase(line.text, lang) }),
    },
    {
      id: `${lang}.structure.shortHeading`,
      lang,
      kind: "heading",
      score: 46,
      test: (line, ctx) =>
        line.text.length < 60 &&
        line.blankBefore &&
        !line.blankAfter &&
        !hasBulletMarker(line.text) &&
        !/[.!?,;:]$/.test(line.text) &&
        hasFollowingContent(line, ctx),
      extract: (line) => ({ label: line.text }),
    },
    /**
     * A line ending in a colon announces what comes after it. That is a heading,
     * whether what follows is a list or a paragraph — `Besparelser på
     * skoleområdet:` on its own line is nobody's body text.
     */
    {
      id: `${lang}.structure.colonHeading`,
      lang,
      kind: "heading",
      score: 52,
      test: (line, ctx) =>
        line.text.endsWith(":") &&
        line.text.length < 70 &&
        !hasBulletMarker(line.text) &&
        (nextLineOpensList(line, ctx) || standsAlone(line, ctx)),
      extract: (line) => ({ label: line.text.replace(/:$/, "").trim() }),
    },
    // The `everything else` row of §11.4. It is the expected outcome for body
    // text, not an uncertainty, so it sits at the bottom of the medium band —
    // flagging every paragraph would make the review strip worthless.
    {
      id: `${lang}.structure.paragraph`,
      lang,
      kind: "paragraph",
      score: 40,
      fallback: true,
      test: () => true,
    },
  ];
}

/** `1.1` and `1.` alone are numbering, not a heading. */
const NUMERIC_HEADING_ONLY = /^\(?\d+(?:\.\d+)*[.)]?$/;

export function isAllCaps(value: string, lang: DocLang): boolean {
  const letters = value.replace(/[^\p{L}]/gu, "");
  if (letters.length < 3) return false;
  return letters === letters.toLocaleUpperCase(localeOf(lang));
}

/**
 * Danish does not capitalise nouns, so de-capitalising an ALL CAPS heading means
 * the first letter and nothing else.
 */
export function sentenceCase(value: string, lang: DocLang): string {
  const locale = localeOf(lang);
  const lowered = value.toLocaleLowerCase(locale);
  const index = lowered.search(/\p{L}/u);
  if (index < 0) return lowered;
  return (
    lowered.slice(0, index) +
    lowered.charAt(index).toLocaleUpperCase(locale) +
    lowered.slice(index + 1)
  );
}

function hasFollowingContent(line: Line, ctx: ParseContext): boolean {
  const position = positionOf(line, ctx);
  return position >= 0 && position < ctx.lines.length - 1;
}

function nextLineOpensList(line: Line, ctx: ParseContext): boolean {
  const position = positionOf(line, ctx);
  const next = position >= 0 ? ctx.lines[position + 1] : undefined;
  if (!next) return false;
  if (BULLET_MARKER.test(next.text) || ORDERED_MARKER.test(next.text)) return true;
  return lostListRun(position + 1, ctx) !== undefined;
}

/** The line is a block of its own: blank above, blank below, content after. */
function standsAlone(line: Line, ctx: ParseContext): boolean {
  return line.blankBefore && line.blankAfter && hasFollowingContent(line, ctx);
}

/**
 * Array position of a line, memoised per parse. `Line.index` counts blank lines
 * too, so it is not the position; a linear scan per rule per line is what this
 * replaces.
 */
const POSITIONS = new WeakMap<Line[], Map<number, number>>();

function positionOf(line: Line, ctx: ParseContext): number {
  let index = POSITIONS.get(ctx.lines);
  if (!index) {
    index = new Map(ctx.lines.map((candidate, position) => [candidate.index, position]));
    POSITIONS.set(ctx.lines, index);
  }
  return index.get(line.index) ?? -1;
}

/* ---------- lists whose numbering the source lost ---------- */

/**
 * Google Docs copies a numbered list to the clipboard without its numerals.
 * What lands in the paste box is a lead-in line followed by bare sentences, and
 * the heading heuristics then read the first of those sentences as a heading —
 * the one reading that is certainly wrong.
 *
 * The signal that survives the copy is the lead-in: `… hvor vi skal i gang med`,
 * `Punkter til drøftelse:`. Everything below reconstructs the list from that,
 * and refuses in every case it is not sure about: a run that would chop a
 * paragraph in half, a run of one, a run of lines that read as prose. Failing to
 * recover leaves today's behaviour; recovering wrongly costs the user an edit,
 * so the rule is `uncertain` and the review strip names it.
 */

/** Words that end a line which is about to open a list. */
const LEAD_IN_WORDS: Record<DocLang, readonly string[]> = {
  da: ["med", "følgende", "flg", "disse", "herunder", "nemlig"],
  en: ["with", "following", "these", "namely", "including"],
};

const MAX_LEAD_IN_LENGTH = 160;
const MIN_ITEM_LENGTH = 3;
const MAX_ITEM_LENGTH = 120;
const MIN_RECOVERED_ITEMS = 2;
/** `… stilling. Den næste …` — a second sentence means a paragraph, not an item. */
const SENTENCE_BREAK = /[.!?]["»”']?\s+\p{Lu}/u;
const ITEM_OPENING = /^[\p{Lu}\p{N}]/u;

function isListLeadIn(line: Line, lang: DocLang): boolean {
  const text = line.text;
  if (text.length === 0 || text.length > MAX_LEAD_IN_LENGTH) return false;
  if (hasBulletMarker(text) || ORDERED_MARKER.test(text)) return false;
  if (text.endsWith(":")) return true;
  if (/[.!?,;]$/.test(text)) return false;
  const lastWord = (lower(text, lang).split(/\s+/).at(-1) ?? "").replace(/[^\p{L}]/gu, "");
  return LEAD_IN_WORDS[lang].includes(lastWord);
}

/** One line that could be an item whose marker went missing. */
function looksLikeLostItem(line: Line): boolean {
  const text = line.text;
  if (text.length < MIN_ITEM_LENGTH || text.length > MAX_ITEM_LENGTH) return false;
  if (line.headingLevel !== undefined) return false;
  if (hasBulletMarker(text) || ORDERED_MARKER.test(text)) return false;
  if (EMAIL.test(text) || URL.test(text)) return false;
  // A trailing comma or colon is a wrapped clause; a lower-case opening is the
  // middle of one. Neither is how anyone writes a list item.
  if (/[,;:]$/.test(text)) return false;
  if (!ITEM_OPENING.test(text)) return false;
  return !SENTENCE_BREAK.test(text);
}

/**
 * The run of marker-less items the line at `position` belongs to, or `undefined`
 * when there is no such run.
 *
 * The items have to be one unbroken block of lines: a blank line between two of
 * them means the writer wrote two things, and the block has to end where the
 * source ends it. Both walks also stop at a lead-in, so one list's opening line
 * is never swallowed as the previous list's last item.
 */
function lostListRun(
  position: number,
  ctx: ParseContext,
): { start: number; end: number } | undefined {
  const lines = ctx.lines;
  const self = lines[position];
  if (!self || !looksLikeLostItem(self)) return undefined;

  let start = position;
  for (let previous = lines[start - 1]; previous && !previous.blankAfter; ) {
    if (isListLeadIn(previous, ctx.lang) || !looksLikeLostItem(previous)) break;
    start -= 1;
    previous = lines[start - 1];
  }

  let end = position;
  for (let next = lines[end + 1]; next && !lines[end]?.blankAfter; ) {
    if (isListLeadIn(next, ctx.lang) || !looksLikeLostItem(next)) break;
    end += 1;
    next = lines[end + 1];
  }

  if (end - start + 1 < MIN_RECOVERED_ITEMS) return undefined;

  const lead = lines[start - 1];
  if (!lead || !isListLeadIn(lead, ctx.lang)) return undefined;

  // The block has to end where the run ends. Chopping a paragraph in half is a
  // worse outcome than leaving the numbering lost.
  if (lines[end]?.blankAfter !== true) return undefined;

  return { start, end };
}

export const patterns = { EMAIL, URL, PHONE, OPEN_QUOTE, CLOSE_QUOTE };
