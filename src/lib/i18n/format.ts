import type { DocLang, IsoDate, WallClock } from "../model/types";
import type { Lang } from "./types";

/**
 * Every `Intl` call in the project goes through this module — docs/PLAN.md §8.6.
 *
 * Two Danish conventions are easy to get wrong by hand and are the reason this
 * is centralised rather than inlined: the time separator is a full stop
 * (`15.30`, not `15:30`), and `Æ Ø Å` collate *after* `Z`, so user-visible
 * sorting must use `Intl.Collator` rather than `Array.prototype.sort`.
 */

export const BCP47: Record<Lang, string> = { da: "da-DK", en: "en-GB" };

/** Word's proofing language, set per run in the DOCX export (§14.3). */
export const OOXML_LANG: Record<DocLang, string> = { da: "da-DK", en: "en-GB" };

const EN_DASH = "\u2013";
const NBSP = "\u00A0";
const MIDDOT = "\u00B7";

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
function dateFormatter(lang: Lang, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${lang}:${JSON.stringify(options)}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(BCP47[lang], options);
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

/**
 * `"2026-08-14"` → a local-midnight `Date`.
 *
 * `new Date("2026-08-14")` parses as UTC midnight, which renders as the 13th
 * anywhere west of Greenwich. The document's date is a calendar date, not an
 * instant, so it is built from local components.
 */
export function parseIsoDate(value: IsoDate): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date;
}

export function toIsoDate(date: Date): IsoDate {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type DateStyle = "full" | "long" | "short";

export function formatDate(
  value: IsoDate | undefined,
  lang: Lang,
  style: DateStyle = "full",
): string {
  if (!value) return "";
  const date = parseIsoDate(value);
  if (!date) return "";
  return dateFormatter(lang, { dateStyle: style }).format(date);
}

/** `"15:30"` → `15.30` (da) / `15:30` (en). */
export function formatTime(value: WallClock | undefined, lang: Lang): string {
  if (!value) return "";
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  const date = new Date(2000, 0, 1, hours, minutes);
  return dateFormatter(lang, { timeStyle: "short" }).format(date);
}

/** `kl. 15.30–17.00` / `15:30–17:00`, with non-breaking space after `kl.` */
export function formatTimeRange(
  start: WallClock | undefined,
  end: WallClock | undefined,
  lang: Lang,
): string {
  const from = formatTime(start, lang);
  if (!from) return "";
  const to = formatTime(end, lang);
  const range = to ? `${from}${EN_DASH}${to}` : from;
  return lang === "da" ? `kl.${NBSP}${range}` : range;
}

/**
 * The document's meta line: `fredag den 14. august 2026 · kl. 15.30–17.00 · Lærerværelset`.
 * Empty parts are dropped rather than leaving stray separators.
 */
export function formatMetaLine(
  parts: { date?: IsoDate; timeStart?: WallClock; timeEnd?: WallClock; location?: string },
  lang: Lang,
): string {
  const pieces = [
    formatDate(parts.date, lang, "full"),
    formatTimeRange(parts.timeStart, parts.timeEnd, lang),
    parts.location?.trim() ?? "",
  ].filter((piece) => piece.length > 0);
  return pieces.join(` ${MIDDOT} `);
}

const listFormatters = new Map<Lang, Intl.ListFormat>();
export function formatList(items: string[], lang: Lang): string {
  let formatter = listFormatters.get(lang);
  if (!formatter) {
    formatter = new Intl.ListFormat(BCP47[lang], { style: "long", type: "conjunction" });
    listFormatters.set(lang, formatter);
  }
  return formatter.format(items);
}

const collators = new Map<Lang, Intl.Collator>();
export function collator(lang: Lang): Intl.Collator {
  let value = collators.get(lang);
  if (!value) {
    value = new Intl.Collator(BCP47[lang], { sensitivity: "base", numeric: true });
    collators.set(lang, value);
  }
  return value;
}

/** Sorts user-visible strings correctly for Danish (`Æ Ø Å` after `Z`). */
export function sortByLocale<T>(items: T[], lang: Lang, key: (item: T) => string): T[] {
  const compare = collator(lang).compare;
  return [...items].sort((a, b) => compare(key(a), key(b)));
}

/** Relative wording for the draft-resume row: "i dag kl. 14.32" / "today at 14:32". */
export function formatSavedAt(iso: string, lang: Lang): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  const today = new Date();
  const sameDay =
    when.getFullYear() === today.getFullYear() &&
    when.getMonth() === today.getMonth() &&
    when.getDate() === today.getDate();
  const time = dateFormatter(lang, { timeStyle: "short" }).format(when);
  if (sameDay) {
    return lang === "da" ? `i dag kl.${NBSP}${time}` : `today at ${time}`;
  }
  const date = dateFormatter(lang, { dateStyle: "short" }).format(when);
  return lang === "da" ? `${date} kl.${NBSP}${time}` : `${date} at ${time}`;
}

export function formatClockTime(iso: string, lang: Lang): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return dateFormatter(lang, { timeStyle: "short" }).format(when);
}
