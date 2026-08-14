import type { DocLang, IsoDate, WallClock } from "../model/types";

/**
 * Danish and English date/time recognition — docs/PLAN.md §11.3.
 *
 * Two rules that are not negotiable:
 *   - Ambiguous all-numeric dates are read **day-first**. `03/04/2026` is
 *     4 March in Danish convention and never 3 April.
 *   - Two-digit years map to `2000 + yy` for `yy <= 79`, otherwise `1900 + yy`.
 */

const DA_MONTHS: Record<string, number> = {
  januar: 1,
  jan: 1,
  februar: 2,
  feb: 2,
  marts: 3,
  mar: 3,
  april: 4,
  apr: 4,
  maj: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  oktober: 10,
  okt: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const EN_MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const MONTHS: Record<DocLang, Record<string, number>> = { da: DA_MONTHS, en: EN_MONTHS };

export const DA_WEEKDAYS = [
  "mandag",
  "tirsdag",
  "onsdag",
  "torsdag",
  "fredag",
  "lørdag",
  "søndag",
  "man",
  "tirs",
  "tir",
  "ons",
  "tors",
  "tor",
  "fre",
  "lør",
  "søn",
];

export const EN_WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "mon",
  "tue",
  "tues",
  "wed",
  "thu",
  "thur",
  "thurs",
  "fri",
  "sat",
  "sun",
];

export interface DateHit {
  iso: IsoDate;
  match: string;
  start: number;
  end: number;
  /** True when the source text carried no year and the current one was assumed. */
  yearAssumed: boolean;
}

export interface TimeHit {
  start: WallClock;
  end?: WallClock;
  match: string;
  index: number;
}

function expandYear(value: number): number {
  if (value >= 100) return value;
  return value <= 79 ? 2000 + value : 1900 + value;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(year, month - 1, day);
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
}

function iso(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Blanks out URLs and email addresses so `14/8` inside `https://a.dk/14/8` and
 * `2026` inside `a@b.dk/2026` never register as a date (§20.1).
 */
export function maskUris(value: string): string {
  return value
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, (m) => " ".repeat(m.length))
    .replace(/\bwww\.\S+/gi, (m) => " ".repeat(m.length))
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, (m) => " ".repeat(m.length));
}

const NAMED_DATE = /\b(?:(\d{1,2})\.?\s*)(?:\.\s*)?([a-zA-ZæøåÆØÅ]{3,9})\.?(?:\s+(\d{2,4}))?\b/;
/**
 * The dotted form requires a year. Without that rule `1.1` — the most common
 * sub-item numbering in Danish minutes — reads as 1 January every time.
 */
const DOTTED_DATE = /\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})\b/;
/** Slash and dash forms may omit the year: `14/8`, `14-08-2026`. */
const SLASHED_DATE = /\b(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?\b/;

/**
 * Finds the first date in a line. Returns `undefined` rather than guessing when
 * the text is relative (`i morgen`, `next week`) — a wrong date is worse than no
 * date, because the user cannot see that we invented one.
 */
export function findDate(value: string, lang: DocLang, today = new Date()): DateHit | undefined {
  const masked = maskUris(value);
  const months = MONTHS[lang];
  const otherMonths = lang === "da" ? EN_MONTHS : DA_MONTHS;

  const named = NAMED_DATE.exec(masked);
  if (named) {
    const day = Number(named[1]);
    const word = (named[2] ?? "").toLocaleLowerCase(lang === "da" ? "da-DK" : "en-GB");
    const month = months[word] ?? otherMonths[word];
    if (month !== undefined) {
      const yearRaw = named[3] ? Number(named[3]) : today.getFullYear();
      const year = named[3] ? expandYear(yearRaw) : yearRaw;
      if (isRealDate(year, month, day)) {
        return {
          iso: iso(year, month, day),
          match: named[0],
          start: named.index,
          end: named.index + named[0].length,
          yearAssumed: !named[3],
        };
      }
    }
  }

  for (const [pattern, dayIndex, monthIndex, yearIndex] of [
    [DOTTED_DATE, 1, 2, 3],
    [SLASHED_DATE, 1, 2, 3],
  ] as const) {
    const numeric = pattern.exec(masked);
    if (!numeric) continue;
    // Day-first, always. Danish convention, never US order.
    const day = Number(numeric[dayIndex]);
    const month = Number(numeric[monthIndex]);
    const yearRaw = numeric[yearIndex];
    const year = yearRaw ? expandYear(Number(yearRaw)) : today.getFullYear();
    if (!isRealDate(year, month, day)) continue;
    return {
      iso: iso(year, month, day),
      match: numeric[0],
      start: numeric.index,
      end: numeric.index + numeric[0].length,
      yearAssumed: !yearRaw,
    };
  }

  return undefined;
}

const TIME_RANGE = /(?:\bkl\.?\s*)?(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})(?:[.:](\d{2}))?/;
const HOUR_RANGE = /\bkl\.?\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\b/;
const SINGLE_TIME = /(?:\bkl\.?\s*)(\d{1,2})(?:[.:](\d{2}))?|\b(\d{1,2})[.:](\d{2})\b/;

function clock(hours: number, minutes: number): WallClock | undefined {
  if (hours > 23 || minutes > 59) return undefined;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function findTime(value: string): TimeHit | undefined {
  const masked = maskUris(value);

  const range = TIME_RANGE.exec(masked);
  if (range) {
    const start = clock(Number(range[1]), Number(range[2]));
    const end = clock(Number(range[3]), range[4] ? Number(range[4]) : 0);
    if (start) {
      return end
        ? { start, end, match: range[0], index: range.index }
        : { start, match: range[0], index: range.index };
    }
  }

  const hours = HOUR_RANGE.exec(masked);
  if (hours) {
    const start = clock(Number(hours[1]), 0);
    const end = clock(Number(hours[2]), 0);
    if (start) {
      return end
        ? { start, end, match: hours[0], index: hours.index }
        : { start, match: hours[0], index: hours.index };
    }
  }

  const single = SINGLE_TIME.exec(masked);
  if (single) {
    const h = single[1] ?? single[3];
    const m = single[2] ?? single[4];
    if (h !== undefined) {
      const start = clock(Number(h), m ? Number(m) : 0);
      if (start) return { start, match: single[0], index: single.index };
    }
  }

  return undefined;
}

export function isWeekdayWord(word: string, lang: DocLang): boolean {
  const list = lang === "da" ? DA_WEEKDAYS : EN_WEEKDAYS;
  const lowered = word.toLocaleLowerCase(lang === "da" ? "da-DK" : "en-GB").replace(/\.$/, "");
  return list.includes(lowered);
}

/** `14.08.2026` / `14/08/2026` — the short form the date inputs accept. */
export function parseShortDateInput(value: string, lang: DocLang): IsoDate | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const hit = findDate(trimmed, lang);
  return hit?.match.trim() === trimmed ? hit.iso : hit?.iso;
}
