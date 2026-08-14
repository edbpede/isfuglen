import { createDoc } from "../model/factory";
import type { DocLang, NewsletterDoc } from "../model/types";
import { assemble } from "./assemble";
import { classify } from "./classify";
import { group } from "./group";
import { extractHeader } from "./header";
import { normaliseText } from "./normalise";
import { repair } from "./repair";
import { buildReport } from "./report";
import { segment } from "./segment";
import type { ParseResult, Restructurer } from "./types";

export { findDate, findTime, parseShortDateInput } from "./dates";
export { parseInline, serialiseInline } from "./inline";
export { normaliseText, normaliseValue } from "./normalise";
export type { ParseReport, ParseResult, Restructurer } from "./types";

export interface ParseOptions {
  lang?: DocLang;
  organisation?: string;
  footerNote?: string;
  docLangExplicit?: boolean;
  /** Injected in tests so "no year given" resolves deterministically. */
  today?: Date;
}

/**
 * The eight-stage pipeline of docs/PLAN.md §11.1, run end to end.
 *
 * Every stage is a pure function, so a failure in stage 6 cannot corrupt what
 * stage 3 decided, and each is unit-testable on its own.
 */
export function parseNewsletter(raw: string, options: ParseOptions = {}): ParseResult {
  const started = now();
  const lang = options.lang ?? "da";
  const today = options.today ?? new Date();

  const normalised = normaliseText(raw);
  const lines = segment(normalised);
  const classified = classify({ lang, lines });
  const header = extractHeader(classified, lang, today);
  const chunks = group(classified.slice(header.consumed));
  const assembled = repair(assemble({ chunks, meta: header.meta, lang, today }));

  const doc: NewsletterDoc = createDoc({
    docLang: lang,
    ...(options.docLangExplicit !== undefined ? { docLangExplicit: options.docLangExplicit } : {}),
    ...(options.organisation ? { organisation: options.organisation } : {}),
    ...(options.footerNote ? { footerNote: options.footerNote } : {}),
  });
  doc.meta = { ...doc.meta, ...assembled.meta };
  if (assembled.intro) doc.intro = assembled.intro;
  doc.sections = assembled.sections;

  const report = buildReport(doc, chunks, lines.length, now() - started);
  return { doc, report };
}

/**
 * The only `Restructurer` registered in v1 (§11.8). A future AI path implements
 * the same interface; nothing else in the app changes.
 */
export const ruleBasedRestructurer: Restructurer = {
  id: "rule-based",
  async restructure(raw, ctx) {
    return parseNewsletter(raw, { lang: ctx.lang });
  },
};

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
