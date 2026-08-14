import { formatDate, formatTimeRange } from "../i18n/format";
import type { DocumentLabels } from "../labels/types";
import type {
  ActionBlock,
  AgendaBlock,
  Block,
  ClosingBlock,
  ContactBlock,
  DecisionBlock,
  DocLang,
  NewsletterDoc,
  NoticeBlock,
  QuoteBlock,
  RichText,
  Section,
} from "../model/types";

/**
 * The preview renderer — docs/PLAN.md §10.4.
 *
 * One function produces the on-screen preview, the printed page and the
 * paginated Paged.js source. "The preview matches the export" is therefore not a
 * testing burden; it is a property of the design. Only the stylesheet differs.
 *
 * Class names are the semantic `nl-*` vocabulary defined in
 * `src/styles/document.css`, not utility classes: `@page`, break control and
 * print colour adjustment are rules UnoCSS has no reason to generate, and
 * keeping the document's whole appearance in one readable file is what makes
 * the print behaviour auditable.
 */

export interface RenderOptions {
  /** Path to the brand SVG. Omitted in tests and in the clipboard renderer. */
  logoSrc?: string;
  /** Rendered into `data-block-id` so the preview can map clicks to editor cards. */
  interactive?: boolean;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

export function renderInline(content: RichText): string {
  return content
    .map((node) => {
      if (node.kind === "break") return "<br />";
      const text = escapeHtml(node.text);
      const marked = applyMarks(text, node.marks);
      if (node.kind === "link") {
        return `<a href="${escapeAttribute(node.href)}">${marked}</a>`;
      }
      return marked;
    })
    .join("");
}

function applyMarks(value: string, marks?: readonly string[]): string {
  let result = value;
  if (marks?.includes("italic")) result = `<em>${result}</em>`;
  if (marks?.includes("bold")) result = `<strong>${result}</strong>`;
  return result;
}

function label(labels: DocumentLabels, key: keyof DocumentLabels): string {
  return escapeHtml(labels[key]);
}

function blockAttrs(block: Block, options: RenderOptions): string {
  if (!options.interactive) return "";
  const uncertain = block.confidence === "low" ? ' data-confidence="low"' : "";
  return ` data-block-id="${escapeAttribute(block.id)}"${uncertain}`;
}

/* ---------- blocks ---------- */

function renderAgenda(block: AgendaBlock, labels: DocumentLabels, options: RenderOptions): string {
  const items = block.items
    .map((item) => {
      const presenter = item.presenter
        ? `<span class="nl-agenda-presenter">${escapeHtml(item.presenter)}</span>`
        : "";
      const minutes =
        typeof item.minutes === "number"
          ? `<span class="nl-agenda-minutes">${item.minutes} ${label(labels, "minutes")}</span>`
          : "";
      return `<li class="nl-agenda-item"><span class="nl-agenda-text">${escapeHtml(item.text)}</span>${presenter}${minutes}</li>`;
    })
    .join("");
  return `<div class="nl-agenda"${blockAttrs(block, options)}><p class="nl-block-label">${escapeHtml(block.title ?? labels.agenda)}</p><ol class="nl-agenda-list">${items}</ol></div>`;
}

function renderDecisions(
  block: DecisionBlock,
  labels: DocumentLabels,
  options: RenderOptions,
): string {
  const items = block.items
    .map((item) => `<li class="nl-decision-item">${renderInline(item)}</li>`)
    .join("");
  return `<div class="nl-decisions"${blockAttrs(block, options)}><p class="nl-block-label">${escapeHtml(block.title ?? labels.decisions)}</p><ul class="nl-decision-list">${items}</ul></div>`;
}

function renderActions(
  block: ActionBlock,
  labels: DocumentLabels,
  lang: DocLang,
  options: RenderOptions,
): string {
  const items = block.items
    .map((item) => {
      const owner = item.owner
        ? `<span class="nl-action-owner">${escapeHtml(item.owner)}</span>`
        : "";
      const due = item.due
        ? `<span class="nl-action-due">${label(labels, "due")} ${escapeHtml(formatDate(item.due, lang, "short"))}</span>`
        : "";
      const meta = owner || due ? `<span class="nl-action-meta">${owner}${due}</span>` : "";
      return `<li class="nl-action-item"><span class="nl-action-task">${renderInline(item.task)}</span>${meta}</li>`;
    })
    .join("");
  return `<div class="nl-actions"${blockAttrs(block, options)}><p class="nl-block-label">${escapeHtml(block.title ?? labels.actions)}</p><ul class="nl-action-list">${items}</ul></div>`;
}

function renderNotice(block: NoticeBlock, labels: DocumentLabels, options: RenderOptions): string {
  // Full literal class strings, chosen by a lookup — never assembled at runtime.
  const wrapper = block.tone === "important" ? "nl-notice-important" : "nl-notice-info";
  const fallback = block.tone === "important" ? labels.important : labels.info;
  return `<aside class="${wrapper}"${blockAttrs(block, options)}><p class="nl-block-label">${escapeHtml(block.title ?? fallback)}</p><p class="nl-notice-body">${renderInline(block.content)}</p></aside>`;
}

function renderQuote(block: QuoteBlock, options: RenderOptions): string {
  const attribution = block.attribution
    ? `<footer class="nl-quote-attribution">${escapeHtml(block.attribution)}</footer>`
    : "";
  return `<blockquote class="nl-quote"${blockAttrs(block, options)}><p>${renderInline(block.content)}</p>${attribution}</blockquote>`;
}

function renderContact(
  block: ContactBlock,
  labels: DocumentLabels,
  options: RenderOptions,
): string {
  const rows = block.entries
    .map((entry) => {
      const name = entry.name ? escapeHtml(entry.name) : "";
      const role = entry.role
        ? `<span class="nl-contact-role">${escapeHtml(entry.role)}</span>`
        : "";
      const details: string[] = [];
      if (entry.email) {
        details.push(
          `<a href="mailto:${escapeAttribute(entry.email)}">${escapeHtml(entry.email)}</a>`,
        );
      }
      if (entry.phone) details.push(escapeHtml(entry.phone));
      if (entry.url) {
        const href = entry.url.startsWith("http") ? entry.url : `https://${entry.url}`;
        details.push(`<a href="${escapeAttribute(href)}">${escapeHtml(entry.url)}</a>`);
      }
      return `<div class="nl-contact-row"><dt class="nl-contact-name">${name}${role}</dt><dd class="nl-contact-detail">${details.join(" · ")}</dd></div>`;
    })
    .join("");
  return `<div class="nl-contact"${blockAttrs(block, options)}><p class="nl-block-label">${escapeHtml(block.title ?? labels.contact)}</p><dl class="nl-contact-list">${rows}</dl></div>`;
}

function renderClosing(block: ClosingBlock, options: RenderOptions): string {
  const signature = (block.signature ?? [])
    .map((line) => `<span class="nl-signature-line">${escapeHtml(line)}</span>`)
    .join("");
  const signatureBlock = signature ? `<p class="nl-signature">${signature}</p>` : "";
  return `<div class="nl-closing"${blockAttrs(block, options)}><p class="nl-closing-body">${renderInline(block.content)}</p>${signatureBlock}</div>`;
}

export function renderBlock(
  block: Block,
  labels: DocumentLabels,
  lang: DocLang,
  options: RenderOptions = {},
): string {
  switch (block.type) {
    case "heading":
      return `<h3 class="nl-h3"${blockAttrs(block, options)}>${escapeHtml(block.text)}</h3>`;
    case "paragraph":
      return `<p class="nl-p"${blockAttrs(block, options)}>${renderInline(block.content)}</p>`;
    case "list": {
      const items = block.items.map((item) => `<li>${renderInline(item)}</li>`).join("");
      return block.ordered
        ? `<ol class="nl-ol"${blockAttrs(block, options)}>${items}</ol>`
        : `<ul class="nl-ul"${blockAttrs(block, options)}>${items}</ul>`;
    }
    case "agenda":
      return renderAgenda(block, labels, options);
    case "decisions":
      return renderDecisions(block, labels, options);
    case "actions":
      return renderActions(block, labels, lang, options);
    case "notice":
      return renderNotice(block, labels, options);
    case "quote":
      return renderQuote(block, options);
    case "contact":
      return renderContact(block, labels, options);
    case "closing":
      return renderClosing(block, options);
  }
}

export function renderSection(
  section: Section,
  labels: DocumentLabels,
  lang: DocLang,
  options: RenderOptions = {},
): string {
  const heading = section.heading
    ? section.heading.level === 3
      ? `<h3 class="nl-h3">${escapeHtml(section.heading.text)}</h3>`
      : `<h2 class="nl-h2">${escapeHtml(section.heading.text)}</h2>`
    : "";
  const blocks = section.blocks.map((block) => renderBlock(block, labels, lang, options)).join("");
  const id = options.interactive ? ` data-section-id="${escapeAttribute(section.id)}"` : "";
  return `<section class="nl-section"${id}>${heading}${blocks}</section>`;
}

/* ---------- document ---------- */

export function renderMastheadHtml(doc: NewsletterDoc, options: RenderOptions): string {
  const organisation = doc.meta.organisation?.trim();
  const logo = options.logoSrc
    ? `<img class="nl-logo" src="${escapeAttribute(options.logoSrc)}" alt="" />`
    : "";
  const name = organisation ? `<span class="nl-org">${escapeHtml(organisation)}</span>` : "";
  if (!logo && !name) return "";
  return `<header class="nl-masthead">${logo}${name}</header>`;
}

export function renderDocumentBody(
  doc: NewsletterDoc,
  labels: DocumentLabels,
  options: RenderOptions = {},
): string {
  const lang = doc.docLang;
  const parts: string[] = [];

  parts.push(renderMastheadHtml(doc, options));

  const title = doc.meta.title.trim();
  if (title) parts.push(`<h1 class="nl-title">${escapeHtml(title)}</h1>`);

  const subtitle = doc.meta.subtitle?.trim();
  if (subtitle) parts.push(`<p class="nl-subtitle">${escapeHtml(subtitle)}</p>`);

  const meta = metaLineParts(doc, lang);
  if (meta.length > 0) {
    parts.push(`<p class="nl-meta">${meta.map(escapeHtml).join(" · ")}</p>`);
  }

  if (doc.intro && doc.intro.length > 0) {
    parts.push(`<p class="nl-intro">${renderInline(doc.intro)}</p>`);
  }

  for (const section of doc.sections) {
    parts.push(renderSection(section, labels, lang, options));
  }

  return parts.filter((part) => part.length > 0).join("");
}

export function metaLineParts(doc: NewsletterDoc, lang: DocLang): string[] {
  return [
    formatDate(doc.meta.date, lang, "full"),
    formatTimeRange(doc.meta.timeStart, doc.meta.timeEnd, lang),
    doc.meta.location?.trim() ?? "",
  ].filter((part) => part.length > 0);
}

export function renderFooterHtml(doc: NewsletterDoc): string {
  const parts = [doc.meta.organisation?.trim(), doc.meta.footerNote?.trim()].filter(
    (part): part is string => Boolean(part && part.length > 0),
  );
  if (parts.length === 0) return "";
  return `<footer class="nl-footer"><span class="nl-footer-org">${parts.map(escapeHtml).join(" · ")}</span></footer>`;
}

/** The full document element, ready to drop into the preview or the print root. */
export function renderDocumentHtml(
  doc: NewsletterDoc,
  labels: DocumentLabels,
  options: RenderOptions = {},
): string {
  return `<article class="nl-doc" lang="${doc.docLang}">${renderDocumentBody(doc, labels, options)}${renderFooterHtml(doc)}</article>`;
}
