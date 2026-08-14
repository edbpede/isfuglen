import { actionItem, agendaItem, contactEntry, rich } from "../model/factory";
import type { ActionItem, AgendaItem, ContactEntry, DocLang, IsoDate } from "../model/types";
import { findDate, findTime, isWeekdayWord } from "./dates";
import { patterns } from "./rules/shared";

/**
 * Stage 6 — pull structured fields out of an already-classified line (§11.3).
 *
 * Owner detection is positional plus an explicit prefix (`Ansvarlig`, `ansv.`,
 * `v/`, `ved`). It never consults a name dictionary: guessing that a capitalised
 * word is a person is how a parser starts inventing facts about people.
 */

const OWNER_PREFIX: Record<DocLang, RegExp> = {
  da: /\b(?:ansvarlig|ansv\.?|v\/|ved)\s*:?\s*/i,
  en: /\b(?:responsible|owner|by)\s*:?\s*/i,
};

const DUE_PREFIX: Record<DocLang, RegExp> = {
  da: /\b(?:frist|senest|inden|deadline)\s*:?\s*/i,
  en: /\b(?:due|deadline|before|by)\s*:?\s*/i,
};

const MINUTES = /\((\d{1,3})\s*(?:min|minutter|minutes)\.?\)|\b(\d{1,3})\s*min\.?\b/i;
/**
 * `v/` is a notation rather than a Danish word, and the plain-text
 * serialisation writes it in both languages — so both packs read it back. That
 * is what keeps the raw-text view lossless in an English document (§7.5).
 */
const PRESENTER: Record<DocLang, RegExp> = {
  da: /\b(?:v\/|ved|oplæg ved|oplægsholder)\s*:?\s*([^,;()]+)/i,
  en: /(?:\bv\/|\b(?:by|presented by|presenter))\s*:?\s*([^,;()]+)/i,
};

const SEPARATOR = /\s+[–—]\s+|\s+-\s+/;

function cleanup(value: string): string {
  return value
    .replace(/^[\s,;.:–—-]+/, "")
    .replace(/[\s,;:–—-]+$/, "")
    .trim();
}

/**
 * `Indkalde til møde om arbejdstid (Ansvarlig: Mette, frist 01.09.2026)`
 * `Sende referat – Jens, senest 20.08.2026`
 * `Mette: Indkalde til møde inden 1. september`
 * `Opgave | Ansvarlig | Frist`
 */
export function extractActionItem(text: string, lang: DocLang, today = new Date()): ActionItem {
  const source = text.trim();

  if (source.includes("|")) {
    const cells = source.split("|").map((cell) => cell.trim());
    const task = cells[0] ?? "";
    const owner = cells[1];
    const dueCell = cells[2];
    const due = dueCell ? findDate(dueCell, lang, today)?.iso : undefined;
    return actionItem(rich(task), owner || undefined, due);
  }

  let remainder = source;
  let owner: string | undefined;
  let due: IsoDate | undefined;

  // A trailing parenthetical is the most common carrier of both fields.
  const parenthetical = /\(([^)]*)\)\s*$/.exec(remainder);
  if (parenthetical) {
    const inner = parenthetical[1] ?? "";
    const parsed = readOwnerAndDue(inner, lang, today);
    if (parsed.owner || parsed.due) {
      owner = parsed.owner;
      due = parsed.due;
      remainder = remainder.slice(0, parenthetical.index).trim();
    }
  }

  if (!due) {
    const dueHit = readDue(remainder, lang, today);
    if (dueHit) {
      due = dueHit.iso;
      remainder = cleanup(remainder.slice(0, dueHit.start) + remainder.slice(dueHit.end));
    }
  }

  if (!owner) {
    const prefixed = OWNER_PREFIX[lang].exec(remainder);
    if (prefixed && prefixed.index !== undefined) {
      const after = remainder.slice(prefixed.index + prefixed[0].length);
      const value = cleanup(after.split(/[,;()]/)[0] ?? "");
      if (value.length > 0 && value.length < 40) {
        owner = value;
        remainder = cleanup(remainder.slice(0, prefixed.index));
      }
    }
  }

  if (!owner) {
    // A dash separates the task from the owner, but either order occurs:
    // `Sende referat – Jens` and `Jens – tale med TR-kollegaen`. The owner is
    // the shorter side, and only when it is short enough to be a name.
    const parts = remainder.split(SEPARATOR);
    if (parts.length === 2) {
      const head = cleanup(parts[0] ?? "");
      const tail = cleanup(parts[1] ?? "");
      if (isNameLike(head) && head.length < tail.length) {
        owner = head;
        remainder = tail;
      } else if (isNameLike(tail) && tail.length < head.length) {
        owner = tail;
        remainder = head;
      }
    }
  }

  if (!owner) {
    // `Mette: Indkalde til møde` : a short leading segment before a colon.
    const leading = /^([^:]{2,28}):\s+(.+)$/.exec(remainder);
    if (leading && countWords(leading[1] ?? "") <= 3) {
      owner = cleanup(leading[1] ?? "");
      remainder = cleanup(leading[2] ?? "");
    }
  }

  return actionItem(rich(cleanup(remainder)), owner, due);
}

function readOwnerAndDue(
  inner: string,
  lang: DocLang,
  today: Date,
): { owner?: string; due?: IsoDate } {
  const result: { owner?: string; due?: IsoDate } = {};
  let rest = inner;

  const dueHit = readDue(rest, lang, today);
  if (dueHit) {
    result.due = dueHit.iso;
    rest = cleanup(rest.slice(0, dueHit.start) + rest.slice(dueHit.end));
  }

  const prefixed = OWNER_PREFIX[lang].exec(rest);
  if (prefixed && prefixed.index !== undefined) {
    const after = rest.slice(prefixed.index + prefixed[0].length);
    const value = cleanup(after.split(/[,;]/)[0] ?? "");
    if (value.length > 0 && value.length < 40) result.owner = value;
  } else {
    const value = cleanup(rest.split(/[,;]/)[0] ?? "");
    if (value.length > 0 && value.length < 40 && countWords(value) <= 4) result.owner = value;
  }

  return result;
}

function readDue(
  value: string,
  lang: DocLang,
  today: Date,
): { iso: IsoDate; start: number; end: number } | undefined {
  const prefix = DUE_PREFIX[lang].exec(value);
  if (!prefix || prefix.index === undefined) return undefined;
  const after = value.slice(prefix.index + prefix[0].length);
  const hit = findDate(after, lang, today);
  if (!hit) return undefined;
  return {
    iso: hit.iso,
    start: prefix.index,
    end: prefix.index + prefix[0].length + hit.end,
  };
}

function countWords(value: string): number {
  return value.split(/\s+/).filter((word) => word.length > 0).length;
}

/** Short, unpunctuated, at most two words — the shape of a name, not a task. */
function isNameLike(value: string): boolean {
  return value.length > 0 && value.length < 32 && !/[.!?]$/.test(value) && countWords(value) <= 2;
}

/** `Godkendelse af referat (v/ Mette, 10 min.)` */
export function extractAgendaItem(text: string, lang: DocLang): AgendaItem {
  let remainder = text.trim();
  let presenter: string | undefined;
  let minutes: number | undefined;

  const minutesHit = MINUTES.exec(remainder);
  if (minutesHit) {
    const value = Number(minutesHit[1] ?? minutesHit[2]);
    if (Number.isFinite(value) && value > 0 && value < 600) minutes = value;
    remainder = cleanup(remainder.replace(MINUTES, " "));
  }

  const presenterHit = PRESENTER[lang].exec(remainder);
  if (presenterHit) {
    const value = cleanup(presenterHit[1] ?? "");
    if (value.length > 0 && value.length < 40) {
      presenter = value;
      remainder = cleanup(remainder.replace(PRESENTER[lang], " "));
    }
  }

  // Removing the presenter and the duration leaves the brackets they lived in.
  remainder = cleanup(
    remainder
      .replace(/\([\s,;.:·|/-]*\)/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.;:])/g, "$1"),
  );
  return agendaItem(remainder, presenter, minutes);
}

/** `Mette Hansen · mette@ishoejlaererkreds.dk · 12 34 56 78` */
export function extractContactEntry(text: string): ContactEntry {
  let remainder = text.trim();
  const entry: Omit<ContactEntry, "id"> = {};

  const email = patterns.EMAIL.exec(remainder);
  if (email) {
    entry.email = email[0];
    remainder = remainder.replace(email[0], " ");
  }

  const url = patterns.URL.exec(remainder);
  if (url) {
    entry.url = url[0].replace(/[).,]$/, "");
    remainder = remainder.replace(url[0], " ");
  }

  const phone = patterns.PHONE.exec(remainder);
  if (phone && phone[0].replace(/\D/g, "").length >= 8) {
    entry.phone = phone[0].trim();
    remainder = remainder.replace(phone[0], " ");
  }

  const parts = remainder
    .split(/[·|,;]|\s{2,}/)
    .map((part) => cleanup(part))
    .filter((part) => part.length > 0);

  if (parts[0]) entry.name = parts[0];
  if (parts[1]) entry.role = parts[1];

  return contactEntry(entry);
}

export interface MetaHit {
  date?: IsoDate;
  timeStart?: string;
  timeEnd?: string;
  location?: string;
}

/** Reads a meta line such as `Tid og sted: 14. august kl. 15.30–17.00, Lærerværelset`. */
export function extractMeta(value: string, lang: DocLang, today = new Date()): MetaHit {
  const hit: MetaHit = {};
  let remainder = value;

  const date = findDate(remainder, lang, today);
  if (date) {
    hit.date = date.iso;
    remainder = `${remainder.slice(0, date.start)} ${remainder.slice(date.end)}`;
  }

  const time = findTime(remainder);
  if (time) {
    hit.timeStart = time.start;
    if (time.end) hit.timeEnd = time.end;
    remainder = remainder.replace(time.match, " ");
  }

  // What is left after the date and the time is the place — but only the parts
  // of it that are not weekday words, `den`, `kl.` or leftover separators.
  const segments = remainder
    .split(/[,;·|]+/)
    .map((segment) => cleanup(segment))
    .map((segment) => stripLeadingNoise(segment, lang))
    .filter((segment) => segment.length > 1 && /\p{L}/u.test(segment));

  const location = segments.join(", ");
  if (location.length > 1) hit.location = location;

  return hit;
}

/**
 * Only *leading* noise is removed: `fredag den` in front of a place is residue
 * from the date, but an article inside the place name is part of it.
 */
const LEADING_NOISE = /^(den|d\.|kl\.?|at|on|fra|til|from)$/i;

function stripLeadingNoise(segment: string, lang: DocLang): string {
  const words = segment.split(/\s+/).filter((word) => word.length > 0);
  while (words.length > 0) {
    const first = words[0] ?? "";
    if (isWeekdayWord(first, lang) || LEADING_NOISE.test(first.replace(/[.,]$/, ""))) {
      words.shift();
      continue;
    }
    break;
  }
  return cleanup(words.join(" "));
}
