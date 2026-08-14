import type { DocLang, DocumentMeta } from "../model/types";
import { findDate, findTime, isWeekdayWord } from "./dates";
import { extractMeta } from "./enrich";
import { canonical } from "./rules/shared";
import type { Classified } from "./types";

/**
 * Stage 5a — promote the document header out of the body (docs/PLAN.md §11.1).
 *
 * This runs on classified *lines*, before grouping, because a title, a subtitle
 * and a meeting meta line are usually three consecutive lines with no blank line
 * between them — which grouping would fuse into a single paragraph and lose.
 *
 * The heuristics are §11.4's, in order, and each one only ever consumes a line
 * it is confident about. A line it declines stays in the body.
 */

const META_DATE = new Set(["dato", "date"]);
const META_TIME = new Set(["tid", "tidspunkt", "time"]);
const META_PLACE = new Set(["sted", "mødested", "lokale", "place", "location", "venue", "room"]);
const META_BOTH = new Set(["tid og sted", "time and place"]);

export interface HeaderResult {
  meta: DocumentMeta;
  /** How many leading entries were consumed. */
  consumed: number;
}

export function extractHeader(entries: Classified[], lang: DocLang, today: Date): HeaderResult {
  const meta: DocumentMeta = { title: "" };
  let cursor = 0;

  const first = entries[0];
  if (first && isTitleLine(first, lang, today)) {
    meta.title = displayText(first);
    cursor = 1;

    const second = entries[1];
    if (second && isSubtitleLine(second, lang, today)) {
      meta.subtitle = displayText(second);
      cursor = 2;
    }
  }

  while (cursor < entries.length) {
    const entry = entries[cursor];
    if (!entry) break;
    if (entry.kind === "metaLine" && applyLabelledMeta(entry, meta, lang, today)) {
      cursor += 1;
      continue;
    }
    if (isBareMetaLine(entry, lang, today)) {
      const hit = extractMeta(entry.line.text, lang, today);
      if (hit.date) meta.date = hit.date;
      if (hit.timeStart) meta.timeStart = hit.timeStart;
      if (hit.timeEnd) meta.timeEnd = hit.timeEnd;
      if (hit.location && !meta.location) meta.location = hit.location;
      cursor += 1;
      continue;
    }
    break;
  }

  return { meta, consumed: cursor };
}

function displayText(entry: Classified): string {
  if (entry.extraction.shape === "prefix") return entry.line.text;
  return entry.extraction.label ?? entry.line.text;
}

function isPlainish(entry: Classified): boolean {
  return entry.kind === "paragraph" || entry.kind === "heading";
}

/** First non-empty line, under 80 characters, no terminal sentence punctuation. */
function isTitleLine(entry: Classified, lang: DocLang, today: Date): boolean {
  if (!isPlainish(entry)) return false;
  const value = entry.line.text;
  if (value.length === 0 || value.length >= 80) return false;
  if (/[.!?]$/.test(value)) return false;
  return !isBareMetaLine(entry, lang, today);
}

/** Second line, under 100 characters, no terminal punctuation. */
function isSubtitleLine(entry: Classified, lang: DocLang, today: Date): boolean {
  if (!isPlainish(entry)) return false;
  const value = entry.line.text;
  if (value.length === 0 || value.length >= 100) return false;
  if (/[.!?]$/.test(value)) return false;
  return !isBareMetaLine(entry, lang, today);
}

/**
 * A line that is a date, a time and at most a short place — the meeting meta
 * line. The residual test is what stops a sentence that merely mentions a date
 * from being swallowed into the header.
 */
export function isBareMetaLine(entry: Classified, lang: DocLang, today: Date): boolean {
  const value = entry.line.text;
  if (value.length === 0 || value.length > 90) return false;
  if (/[!?]$/.test(value)) return false;

  const date = findDate(value, lang, today);
  const time = findTime(value);
  if (!date && !time) return false;

  let residual = value;
  if (date) residual = residual.slice(0, date.start) + residual.slice(date.end);
  if (time) residual = residual.replace(time.match, " ");

  const words = residual
    .split(/[\s,;·|]+/)
    .filter((word) => word.length > 0)
    .filter((word) => !isWeekdayWord(word, lang))
    .filter((word) => !isFillerWord(word));

  return words.join(" ").length <= 40;
}

const FILLER = /^(den|d\.|kl\.?|the|at|on|og|and|fra|til|to|from|i|in)$/i;
function isFillerWord(word: string): boolean {
  return FILLER.test(word.replace(/[.,]$/, ""));
}

function applyLabelledMeta(
  entry: Classified,
  meta: DocumentMeta,
  lang: DocLang,
  today: Date,
): boolean {
  const label = canonical(entry.extraction.label ?? "", lang);
  const rest = entry.extraction.rest ?? "";
  if (rest.length === 0) return false;

  const hit = extractMeta(rest, lang, today);

  if (META_BOTH.has(label)) {
    if (hit.date) meta.date = hit.date;
    if (hit.timeStart) meta.timeStart = hit.timeStart;
    if (hit.timeEnd) meta.timeEnd = hit.timeEnd;
    if (hit.location) meta.location = hit.location;
    return true;
  }
  if (META_DATE.has(label)) {
    if (hit.date) meta.date = hit.date;
    if (hit.timeStart) meta.timeStart = hit.timeStart;
    if (hit.timeEnd) meta.timeEnd = hit.timeEnd;
    return hit.date !== undefined || hit.timeStart !== undefined;
  }
  if (META_TIME.has(label)) {
    if (hit.timeStart) meta.timeStart = hit.timeStart;
    if (hit.timeEnd) meta.timeEnd = hit.timeEnd;
    if (hit.date) meta.date = hit.date;
    return hit.timeStart !== undefined || hit.date !== undefined;
  }
  if (META_PLACE.has(label)) {
    meta.location = rest.trim();
    return true;
  }

  // `Referent: Jens` and friends are content, not document metadata.
  return false;
}
