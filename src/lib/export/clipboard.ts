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
import { escapeAttribute, escapeHtml, safeHref } from "../render/html";
import { renderPlainText } from "../render/plaintext";

/**
 * Clipboard — docs/PLAN.md §15.
 *
 * A separate renderer from the preview, and necessarily so. Gmail and Outlook
 * strip `<style>` blocks and class attributes, so every declaration here is
 * inline; Google Docs drops paragraph background colours but keeps table cell
 * shading, so the semantic blocks are tables — the same substitution the DOCX
 * writer makes, which keeps the two outputs consistent.
 *
 * The logo is deliberately absent. An `<img>` needs either an absolute URL,
 * which many mail clients block, or a base64 data URI, which Outlook strips and
 * Gmail truncates. The copy dialog tells the user so before they paste, which is
 * the difference between a tool they trust and one they do not.
 */

const FONT = "font-family:'Source Sans 3',Calibri,Arial,sans-serif;";
const SERIF = "font-family:Georgia,'Times New Roman',serif;";
const INK = "#1A2340";
const BRAND = "#253154";
const BRAND_MID = "#3C4E7A";
const MUTED = "#4A5262";

/** Points, not pixels: Word interprets `pt` predictably and `px` less so. */
const BODY = `${FONT}font-size:10.5pt;line-height:1.5;color:${INK};`;

export interface ClipboardPayload {
  html: string;
  text: string;
}

export function renderClipboard(doc: NewsletterDoc, labels: DocumentLabels): ClipboardPayload {
  return {
    html: renderClipboardHtml(doc, labels),
    text: renderPlainText(doc, labels),
  };
}

export function renderClipboardHtml(doc: NewsletterDoc, labels: DocumentLabels): string {
  const lang = doc.docLang;
  const parts: string[] = [];

  if (doc.meta.title.trim()) {
    parts.push(
      `<h1 style="${SERIF}font-size:22pt;font-weight:600;color:${INK};margin:0 0 4pt;">${escapeHtml(doc.meta.title.trim())}</h1>`,
    );
  }
  if (doc.meta.subtitle?.trim()) {
    parts.push(
      `<p style="${FONT}font-size:12pt;color:${MUTED};margin:0 0 4pt;">${escapeHtml(doc.meta.subtitle.trim())}</p>`,
    );
  }

  const meta = [
    formatDate(doc.meta.date, lang, "full"),
    formatTimeRange(doc.meta.timeStart, doc.meta.timeEnd, lang),
    doc.meta.location?.trim() ?? "",
  ].filter((part) => part.length > 0);
  if (meta.length > 0) {
    parts.push(
      `<p style="${FONT}font-size:9.5pt;color:${MUTED};margin:0 0 12pt;">${escapeHtml(meta.join(" · "))}</p>`,
    );
  }

  if (doc.intro && doc.intro.length > 0) {
    parts.push(`<p style="${BODY}margin:0 0 10pt;">${inline(doc.intro)}</p>`);
  }

  for (const section of doc.sections) parts.push(renderSection(section, labels, lang));

  const footer = [doc.meta.organisation?.trim(), doc.meta.footerNote?.trim()].filter(
    (part): part is string => Boolean(part && part.length > 0),
  );
  if (footer.length > 0) {
    parts.push(
      `<p style="${FONT}font-size:8.5pt;color:${MUTED};margin:16pt 0 0;border-top:1px solid #DFE3EB;padding-top:6pt;">${escapeHtml(footer.join(" · "))}</p>`,
    );
  }

  return [
    '<meta charset="utf-8">',
    `<div lang="${lang}" style="${BODY}">`,
    parts.join(""),
    "</div>",
  ].join("");
}

function inline(content: RichText): string {
  return content
    .map((node) => {
      if (node.kind === "break") return "<br>";
      let value = escapeHtml(node.text);
      if (node.marks?.includes("italic")) value = `<em>${value}</em>`;
      if (node.marks?.includes("bold")) value = `<strong>${value}</strong>`;
      if (node.kind === "link") {
        const href = safeHref(node.href);
        if (href === undefined) return value;
        return `<a href="${escapeAttribute(href)}" style="color:${BRAND_MID};">${value}</a>`;
      }
      return value;
    })
    .join("");
}

function renderSection(section: Section, labels: DocumentLabels, lang: DocLang): string {
  const heading = section.heading
    ? section.heading.level === 3
      ? `<h3 style="${FONT}font-size:10pt;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;margin:14pt 0 4pt;">${escapeHtml(section.heading.text)}</h3>`
      : `<h2 style="${SERIF}font-size:14pt;font-weight:600;color:${BRAND};margin:18pt 0 6pt;">${escapeHtml(section.heading.text)}</h2>`
    : "";
  return heading + section.blocks.map((block) => renderBlock(block, labels, lang)).join("");
}

/**
 * A 1×1 table with cell shading and a thick coloured left border. Paragraph
 * background colours are dropped by Google Docs; cell shading survives nearly
 * everywhere, which is the whole reason for the shape.
 */
function panel(fill: string, bar: string, body: string): string {
  return [
    `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 10pt;">`,
    `<tr><td style="background-color:${fill};border-left:4px solid ${bar};padding:8pt 10pt;">`,
    body,
    "</td></tr></table>",
  ].join("");
}

function blockLabel(text: string, colour: string, lang: DocLang): string {
  const upper = text.toLocaleUpperCase(lang === "da" ? "da-DK" : "en-GB");
  return `<p style="${FONT}font-size:8.5pt;font-weight:700;letter-spacing:0.08em;color:${colour};margin:0 0 4pt;">${escapeHtml(upper)}</p>`;
}

function renderAgenda(block: AgendaBlock, labels: DocumentLabels, lang: DocLang): string {
  const items = block.items
    .map((item) => {
      const extras = [
        item.presenter ? `${labels.presenter}: ${item.presenter}` : "",
        typeof item.minutes === "number" ? `${item.minutes} ${labels.minutes}` : "",
      ].filter((part) => part.length > 0);
      const suffix =
        extras.length > 0
          ? ` <span style="color:${MUTED};font-size:9pt;">${escapeHtml(extras.join(" · "))}</span>`
          : "";
      return `<li style="margin:0 0 4pt;">${escapeHtml(item.text)}${suffix}</li>`;
    })
    .join("");
  return (
    blockLabel(block.title ?? labels.agenda, BRAND, lang) +
    `<ol style="${BODY}margin:0 0 10pt;padding-left:18pt;">${items}</ol>`
  );
}

function renderDecisions(block: DecisionBlock, labels: DocumentLabels, lang: DocLang): string {
  const items = block.items
    .map((item) => `<li style="margin:0 0 4pt;">${inline(item)}</li>`)
    .join("");
  return panel(
    "#EAF0E9",
    "#0F5132",
    blockLabel(block.title ?? labels.decisions, "#0F5132", lang) +
      `<ul style="${BODY}margin:0;padding-left:16pt;">${items}</ul>`,
  );
}

function renderActions(block: ActionBlock, labels: DocumentLabels, lang: DocLang): string {
  const items = block.items
    .map((item) => {
      const meta = [
        item.owner ?? "",
        item.due ? `${labels.due} ${formatDate(item.due, lang, "short")}` : "",
      ].filter((part) => part.length > 0);
      const suffix =
        meta.length > 0
          ? ` <span style="color:${MUTED};font-weight:600;">— ${escapeHtml(meta.join(" · "))}</span>`
          : "";
      return `<li style="margin:0 0 4pt;">${inline(item.task)}${suffix}</li>`;
    })
    .join("");
  return panel(
    "#FBEAE8",
    "#B02A1E",
    blockLabel(block.title ?? labels.actions, "#B02A1E", lang) +
      `<ul style="${BODY}margin:0;padding-left:16pt;">${items}</ul>`,
  );
}

function renderNotice(block: NoticeBlock, labels: DocumentLabels, lang: DocLang): string {
  const important = block.tone === "important";
  const label = blockLabel(
    block.title ?? (important ? labels.important : labels.info),
    important ? INK : BRAND_MID,
    lang,
  );
  const body = `<p style="${BODY}margin:0;">${inline(block.content)}</p>`;
  return panel(
    important ? "#FDF3DD" : "#E7EDF7",
    important ? "#F2B233" : "#3C4E7A",
    `${label}${body}`,
  );
}

function renderQuote(block: QuoteBlock): string {
  const attribution = block.attribution
    ? `<p style="${FONT}font-size:8.5pt;color:${MUTED};letter-spacing:0.06em;margin:4pt 0 0;">${escapeHtml(block.attribution)}</p>`
    : "";
  return `<blockquote style="${BODY}font-style:italic;margin:0 0 10pt;padding-left:12pt;border-left:2px solid #DFE3EB;"><p style="margin:0;">${inline(block.content)}</p>${attribution}</blockquote>`;
}

function renderContact(block: ContactBlock, labels: DocumentLabels, lang: DocLang): string {
  const rows = block.entries
    .map((entry) => {
      const name = [entry.name, entry.role]
        .filter((part): part is string => Boolean(part))
        .map(escapeHtml)
        .join("<br>");
      const details: string[] = [];
      if (entry.email) {
        details.push(
          `<a href="mailto:${escapeAttribute(entry.email)}" style="color:${BRAND_MID};">${escapeHtml(entry.email)}</a>`,
        );
      }
      if (entry.phone) details.push(escapeHtml(entry.phone));
      if (entry.url) {
        const href = entry.url.startsWith("http") ? entry.url : `https://${entry.url}`;
        details.push(
          `<a href="${escapeAttribute(href)}" style="color:${BRAND_MID};">${escapeHtml(entry.url)}</a>`,
        );
      }
      return `<tr><td style="padding:0 10pt 4pt 0;font-weight:600;vertical-align:top;">${name}</td><td style="padding:0 0 4pt;vertical-align:top;">${details.join(" · ")}</td></tr>`;
    })
    .join("");
  return (
    blockLabel(block.title ?? labels.contact, BRAND, lang) +
    `<table cellpadding="0" cellspacing="0" border="0" style="${BODY}border-collapse:collapse;margin:0 0 10pt;">${rows}</table>`
  );
}

function renderClosing(block: ClosingBlock): string {
  const signature = (block.signature ?? []).map((line) => escapeHtml(line)).join("<br>");
  const signatureBlock = signature
    ? `<p style="${BODY}margin:4pt 0 0;line-height:1.3;">${signature}</p>`
    : "";
  return `<p style="${BODY}margin:14pt 0 0;">${inline(block.content)}</p>${signatureBlock}`;
}

function renderBlock(block: Block, labels: DocumentLabels, lang: DocLang): string {
  switch (block.type) {
    case "heading":
      return `<h3 style="${FONT}font-size:10pt;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;margin:14pt 0 4pt;">${escapeHtml(block.text)}</h3>`;
    case "paragraph":
      return `<p style="${BODY}margin:0 0 8pt;">${inline(block.content)}</p>`;
    case "list": {
      const items = block.items
        .map((item) => `<li style="margin:0 0 4pt;">${inline(item)}</li>`)
        .join("");
      return block.ordered
        ? `<ol style="${BODY}margin:0 0 10pt;padding-left:18pt;">${items}</ol>`
        : `<ul style="${BODY}margin:0 0 10pt;padding-left:16pt;">${items}</ul>`;
    }
    case "agenda":
      return renderAgenda(block, labels, lang);
    case "decisions":
      return renderDecisions(block, labels, lang);
    case "actions":
      return renderActions(block, labels, lang);
    case "notice":
      return renderNotice(block, labels, lang);
    case "quote":
      return renderQuote(block);
    case "contact":
      return renderContact(block, labels, lang);
    case "closing":
      return renderClosing(block);
  }
}

/* ---------- writing to the clipboard ---------- */

export type CopyTier = "clipboard-item" | "exec-command" | "manual";

export type CopyOutcome =
  | { ok: true; tier: CopyTier }
  | { ok: false; tier: "manual"; detail: string };

/**
 * Three tiers, in order (§15.1). Tier 3 matters more than it looks: it is the
 * path for an insecure context on a school LAN, a locked-down managed browser,
 * and anyone whose clipboard permission is denied. A copy button that simply
 * fails is worse than no copy button.
 */
export async function writeToClipboard(payload: ClipboardPayload): Promise<CopyOutcome> {
  // Blobs are constructed synchronously: Safari rejects ClipboardItem contents
  // produced by an await that resolves after the user gesture.
  const html = new Blob([payload.html], { type: "text/html;charset=utf-8" });
  const text = new Blob([payload.text], { type: "text/plain;charset=utf-8" });

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": html, "text/plain": text }),
      ]);
      return { ok: true, tier: "clipboard-item" };
    } catch {
      /* Falls through to tier 2. */
    }
  }

  if (typeof document !== "undefined" && "execCommand" in document) {
    try {
      const staging = document.createElement("div");
      staging.setAttribute("contenteditable", "true");
      staging.setAttribute("aria-hidden", "true");
      staging.style.cssText = "position:fixed;left:-20000px;top:0;white-space:pre-wrap;";
      staging.innerHTML = payload.html;
      document.body.appendChild(staging);

      const range = document.createRange();
      range.selectNodeContents(staging);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const copied = document.execCommand("copy");
      selection?.removeAllRanges();
      staging.remove();

      if (copied) return { ok: true, tier: "exec-command" };
    } catch {
      /* Falls through to tier 3. */
    }
  }

  return { ok: false, tier: "manual", detail: "Clipboard write was refused" };
}
