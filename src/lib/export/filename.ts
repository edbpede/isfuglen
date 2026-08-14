import type { NewsletterDoc } from "../model/types";

/**
 * Export filenames — docs/PLAN.md §13.4.
 *
 * Also what `document.title` is set to immediately before `window.print()`: the
 * browser print pipeline derives the PDF's title and the suggested filename from
 * it, and that is the only piece of PDF metadata this path can control.
 */

const MAX_LENGTH = 60;

/** Transliterates æ ø å so the filename survives every filesystem intact. */
export function slugify(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("da-DK")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-+$/, "");
}

export function documentSlug(doc: NewsletterDoc): string {
  const parts = [doc.meta.title, doc.meta.date].filter((part): part is string =>
    Boolean(part && part.trim().length > 0),
  );
  const slug = slugify(parts.join(" "));
  return slug.length > 0 ? slug : "nyhedsbrev";
}

export function docxFilename(doc: NewsletterDoc): string {
  return `${documentSlug(doc)}.docx`;
}

/** `Klubmøde august — Ishøj Lærerkreds`, restored after the dialog closes. */
export function printTitle(doc: NewsletterDoc): string {
  const title = doc.meta.title.trim();
  const organisation = doc.meta.organisation?.trim();
  if (title && organisation) return `${title} — ${organisation}`;
  if (title) return title;
  return organisation ?? "Nyhedsbrev";
}
