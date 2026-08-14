import { formatDate, formatTimeRange } from "../i18n/format";
import type { DocumentLabels } from "../labels/types";
import { inlineToPlain } from "../model/factory";
import type { Block, DocLang, NewsletterDoc, RichText } from "../model/types";
import { serialiseInline } from "../parser/inline";

/**
 * The plain-text serialisation — docs/PLAN.md §15.4.
 *
 * Deliberately not a stripped-tags dump. This is the readable Markdown-ish form
 * used for both the clipboard's `text/plain` flavour and the raw-text view
 * (§7.5), which is why it round-trips: anything the parser can express is
 * written in a shape the parser reads back, including an action item's owner and
 * deadline (`— Mette, frist 01.09.2026`).
 *
 * Lines are never hard-wrapped: wrapping fights every target that reflows.
 */

const DUE_WORD: Record<DocLang, string> = { da: "frist", en: "due" };

export function renderPlainText(doc: NewsletterDoc, labels: DocumentLabels): string {
  const lang = doc.docLang;
  const out: string[] = [];

  const title = doc.meta.title.trim();
  if (title) out.push(title.toLocaleUpperCase(lang === "da" ? "da-DK" : "en-GB"));

  const subtitle = doc.meta.subtitle?.trim();
  if (subtitle) out.push(subtitle);

  const meta = [
    formatDate(doc.meta.date, lang, "full"),
    formatTimeRange(doc.meta.timeStart, doc.meta.timeEnd, lang),
    doc.meta.location?.trim() ?? "",
  ].filter((part) => part.length > 0);
  if (meta.length > 0) out.push(meta.join(" · "));

  if (doc.intro && doc.intro.length > 0) {
    out.push("");
    out.push(serialiseInline(doc.intro));
  }

  for (const section of doc.sections) {
    if (section.heading) {
      out.push("");
      out.push(`${section.heading.level === 3 ? "###" : "##"} ${section.heading.text}`);
    }
    for (const block of section.blocks) {
      const rendered = renderBlockText(block, labels, lang);
      if (rendered.length > 0) {
        out.push("");
        out.push(rendered);
      }
    }
  }

  const footer = [doc.meta.organisation?.trim(), doc.meta.footerNote?.trim()].filter(
    (part): part is string => Boolean(part && part.length > 0),
  );
  if (footer.length > 0) {
    out.push("");
    out.push(footer.join(" · "));
  }

  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

function renderBlockText(block: Block, labels: DocumentLabels, lang: DocLang): string {
  switch (block.type) {
    case "heading":
      return `### ${block.text}`;
    case "paragraph":
      return serialiseInline(block.content);
    case "list":
      return block.items
        .map((item, index) => (block.ordered ? `${index + 1}. ${text(item)}` : `- ${text(item)}`))
        .join("\n");
    case "agenda": {
      const heading = `## ${(block.title ?? labels.agenda).toLocaleUpperCase(locale(lang))}`;
      const items = block.items.map((item, index) => {
        const extras = [
          item.presenter ? `v/ ${item.presenter}` : "",
          typeof item.minutes === "number" ? `${item.minutes} ${labels.minutes}` : "",
        ].filter((part) => part.length > 0);
        const suffix = extras.length > 0 ? ` (${extras.join(", ")})` : "";
        return `${index + 1}. ${item.text}${suffix}`;
      });
      return [heading, ...items].join("\n");
    }
    case "decisions": {
      const heading = `## ${(block.title ?? labels.decisions).toLocaleUpperCase(locale(lang))}`;
      return [heading, ...block.items.map((item) => `- ${text(item)}`)].join("\n");
    }
    case "actions": {
      const heading = `## ${(block.title ?? labels.actions).toLocaleUpperCase(locale(lang))}`;
      const items = block.items.map((item) => {
        const parts = [
          item.owner ?? "",
          item.due ? `${DUE_WORD[lang]} ${formatDate(item.due, lang, "short")}` : "",
        ].filter((part) => part.length > 0);
        const suffix = parts.length > 0 ? ` — ${parts.join(", ")}` : "";
        return `- ${text(item.task)}${suffix}`;
      });
      return [heading, ...items].join("\n");
    }
    case "notice": {
      const tag =
        block.title ?? (block.tone === "important" ? labels.plainImportant : labels.plainInfo);
      return `[${tag.toLocaleUpperCase(locale(lang))}] ${serialiseInline(block.content)}`;
    }
    case "quote": {
      const body = `> ${serialiseInline(block.content)}`;
      return block.attribution ? `${body}\n> — ${block.attribution}` : body;
    }
    case "contact": {
      const heading = `## ${(block.title ?? labels.contact).toLocaleUpperCase(locale(lang))}`;
      const rows = block.entries.map((entry) =>
        [entry.name, entry.role, entry.email, entry.phone, entry.url]
          .filter((part): part is string => Boolean(part && part.length > 0))
          .join(" · "),
      );
      return [heading, ...rows].join("\n");
    }
    case "closing": {
      const body = serialiseInline(block.content);
      const signature = block.signature ?? [];
      return [body, ...signature].filter((part) => part.length > 0).join("\n");
    }
  }
}

function text(content: RichText): string {
  return serialiseInline(content);
}

function locale(lang: DocLang): string {
  return lang === "da" ? "da-DK" : "en-GB";
}

export { inlineToPlain };
