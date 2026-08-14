import {
  type ActionBlock,
  type ActionItem,
  type AgendaBlock,
  type AgendaItem,
  type Block,
  type BlockId,
  type ClosingBlock,
  type ContactBlock,
  type ContactEntry,
  type DecisionBlock,
  type DocLang,
  type HeadingBlock,
  type Inline,
  type InlineMark,
  type ListBlock,
  type NewsletterDoc,
  type NoticeBlock,
  type NoticeTone,
  type ParagraphBlock,
  type QuoteBlock,
  type RichText,
  SCHEMA_VERSION,
  type Section,
  type SectionTypeKey,
} from "./types";

/**
 * `crypto.randomUUID` requires a secure context, which this app requires anyway
 * for the clipboard API (§21). The fallback exists so unit tests and any
 * non-secure preview host still produce unique, stable ids rather than crashing.
 */
let fallbackCounter = 0;
export function newId(): BlockId {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  fallbackCounter += 1;
  return `id-${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
}

/* ---------- inline helpers ---------- */

export function text(value: string, marks?: InlineMark[]): Inline {
  return marks && marks.length > 0
    ? { kind: "text", text: value, marks }
    : { kind: "text", text: value };
}

export function link(href: string, label: string, marks?: InlineMark[]): Inline {
  return marks && marks.length > 0
    ? { kind: "link", href, text: label, marks }
    : { kind: "link", href, text: label };
}

export function lineBreak(): Inline {
  return { kind: "break" };
}

/** A one-run `RichText` from a plain string. The most common construction. */
export function rich(value: string): RichText {
  return value.length > 0 ? [text(value)] : [];
}

/** Flattens `RichText` to its readable text, ignoring marks. */
export function inlineToPlain(content: RichText): string {
  return content
    .map((node) => {
      if (node.kind === "break") return "\n";
      return node.text;
    })
    .join("");
}

export function isRichTextEmpty(content: RichText | undefined): boolean {
  if (!content) return true;
  return inlineToPlain(content).trim().length === 0;
}

/* ---------- block factories ---------- */

export function heading(value: string, level: 2 | 3 = 2): HeadingBlock {
  return { id: newId(), type: "heading", level, text: value };
}

export function paragraph(content: RichText | string): ParagraphBlock {
  return {
    id: newId(),
    type: "paragraph",
    content: typeof content === "string" ? rich(content) : content,
  };
}

export function list(items: (RichText | string)[], ordered: boolean): ListBlock {
  return {
    id: newId(),
    type: "list",
    ordered,
    items: items.map((item) => (typeof item === "string" ? rich(item) : item)),
  };
}

export function agendaItem(value: string, presenter?: string, minutes?: number): AgendaItem {
  const item: AgendaItem = { id: newId(), text: value };
  if (presenter) item.presenter = presenter;
  if (typeof minutes === "number") item.minutes = minutes;
  return item;
}

export function agenda(items: AgendaItem[], title?: string): AgendaBlock {
  return title
    ? { id: newId(), type: "agenda", title, items }
    : { id: newId(), type: "agenda", items };
}

export function decisions(items: (RichText | string)[], title?: string): DecisionBlock {
  const mapped = items.map((item) => (typeof item === "string" ? rich(item) : item));
  return title
    ? { id: newId(), type: "decisions", title, items: mapped }
    : { id: newId(), type: "decisions", items: mapped };
}

export function actionItem(task: RichText | string, owner?: string, due?: string): ActionItem {
  const item: ActionItem = {
    id: newId(),
    task: typeof task === "string" ? rich(task) : task,
  };
  if (owner) item.owner = owner;
  if (due) item.due = due;
  return item;
}

export function actions(items: ActionItem[], title?: string): ActionBlock {
  return title
    ? { id: newId(), type: "actions", title, items }
    : { id: newId(), type: "actions", items };
}

export function notice(
  content: RichText | string,
  tone: NoticeTone = "important",
  title?: string,
): NoticeBlock {
  const body = typeof content === "string" ? rich(content) : content;
  return title
    ? { id: newId(), type: "notice", tone, title, content: body }
    : { id: newId(), type: "notice", tone, content: body };
}

export function quote(content: RichText | string, attribution?: string): QuoteBlock {
  const body = typeof content === "string" ? rich(content) : content;
  return attribution
    ? { id: newId(), type: "quote", content: body, attribution }
    : { id: newId(), type: "quote", content: body };
}

export function contactEntry(entry: Omit<ContactEntry, "id">): ContactEntry {
  return { id: newId(), ...entry };
}

export function contact(entries: ContactEntry[], title?: string): ContactBlock {
  return title
    ? { id: newId(), type: "contact", title, entries }
    : { id: newId(), type: "contact", entries };
}

export function closing(content: RichText | string, signature?: string[]): ClosingBlock {
  const body = typeof content === "string" ? rich(content) : content;
  return signature && signature.length > 0
    ? { id: newId(), type: "closing", content: body, signature }
    : { id: newId(), type: "closing", content: body };
}

/* ---------- section and document ---------- */

export function section(headingText?: string, blocks: Block[] = [], level: 2 | 3 = 2): Section {
  return headingText
    ? { id: newId(), heading: { text: headingText, level }, blocks }
    : { id: newId(), blocks };
}

/** The empty block a freshly added section of each menu type starts with (§5.4). */
export function blocksForSectionType(type: SectionTypeKey): Block[] {
  switch (type) {
    case "heading":
      return [paragraph("")];
    case "agenda":
      return [agenda([agendaItem("")])];
    case "decisions":
      return [decisions([""])];
    case "actions":
      return [actions([actionItem("")])];
    case "notice":
      return [notice("", "important")];
    case "quote":
      return [quote("")];
    case "bullets":
      return [list([""], false)];
    case "numbers":
      return [list([""], true)];
    case "contact":
      return [contact([contactEntry({})])];
    case "closing":
      return [closing("")];
  }
}

export interface CreateDocOptions {
  docLang?: DocLang;
  docLangExplicit?: boolean;
  title?: string;
  organisation?: string;
  footerNote?: string;
  sections?: Section[];
}

export function createDoc(options: CreateDocOptions = {}): NewsletterDoc {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    docLang: options.docLang ?? "da",
    docLangExplicit: options.docLangExplicit ?? false,
    meta: {
      title: options.title ?? "",
      ...(options.organisation ? { organisation: options.organisation } : {}),
      ...(options.footerNote ? { footerNote: options.footerNote } : {}),
    },
    sections: options.sections ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

/** A blank document with one empty section, used by "start with a blank newsletter". */
export function createBlankDoc(options: CreateDocOptions = {}): NewsletterDoc {
  const doc = createDoc(options);
  doc.sections = [section(undefined, [paragraph("")])];
  return doc;
}
