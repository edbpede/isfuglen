/**
 * The structured document model — docs/PLAN.md §10.
 *
 * This is the single source of truth. The editor, the preview, the print path,
 * the DOCX writer and the clipboard writer are all pure functions of it.
 *
 * Five constraints are encoded here and must survive every future change:
 *   1. JSON-serialisable — it goes into IndexedDB and a downloadable backup.
 *   2. Versioned — `schemaVersion` plus a migration chain (see migrate.ts).
 *   3. Editor-agnostic — no TipTap or ProseMirror type appears anywhere.
 *   4. Renderer-neutral — no colour, size, alignment or CSS field exists.
 *   5. Stable ids — preview↔editor mapping and focus restoration depend on them.
 */

export type DocLang = "da" | "en";

/** `crypto.randomUUID()` in the browser; a counter-backed id in tests. */
export type BlockId = string;

/** `"2026-08-14"`. Never a `Date`, never locale-formatted text (§10.3). */
export type IsoDate = string;

/** `"15:30"` wall-clock. A meeting at 15.30 is at 15.30 in every time zone. */
export type WallClock = string;

export type Confidence = "high" | "medium" | "low";

/* ---------- inline layer ---------- */

export type InlineMark = "bold" | "italic";

export interface InlineText {
  kind: "text";
  text: string;
  marks?: InlineMark[];
}

export interface InlineLink {
  kind: "link";
  href: string;
  text: string;
  marks?: InlineMark[];
}

export interface InlineBreak {
  kind: "break";
}

export type Inline = InlineText | InlineLink | InlineBreak;

/** A paragraph's worth of inline content. Flat by design (§10.3). */
export type RichText = Inline[];

/* ---------- block layer ---------- */

export interface BlockBase {
  id: BlockId;
  confidence?: Confidence;
  /** The id of the parser rule that produced this block, e.g. `da.heading.agenda`. */
  sourceRuleId?: string;
}

export interface HeadingBlock extends BlockBase {
  type: "heading";
  level: 2 | 3;
  text: string;
}

export interface ParagraphBlock extends BlockBase {
  type: "paragraph";
  content: RichText;
}

export interface ListBlock extends BlockBase {
  type: "list";
  ordered: boolean;
  items: RichText[];
}

export interface AgendaItem {
  id: BlockId;
  text: string;
  presenter?: string;
  minutes?: number;
}

export interface AgendaBlock extends BlockBase {
  type: "agenda";
  title?: string;
  items: AgendaItem[];
}

export interface DecisionBlock extends BlockBase {
  type: "decisions";
  title?: string;
  items: RichText[];
}

export interface ActionItem {
  id: BlockId;
  task: RichText;
  owner?: string;
  due?: IsoDate;
}

export interface ActionBlock extends BlockBase {
  type: "actions";
  title?: string;
  items: ActionItem[];
}

export type NoticeTone = "info" | "important";

export interface NoticeBlock extends BlockBase {
  type: "notice";
  tone: NoticeTone;
  title?: string;
  content: RichText;
}

export interface QuoteBlock extends BlockBase {
  type: "quote";
  content: RichText;
  attribution?: string;
}

export interface ContactEntry {
  id: BlockId;
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
  url?: string;
}

export interface ContactBlock extends BlockBase {
  type: "contact";
  title?: string;
  entries: ContactEntry[];
}

export interface ClosingBlock extends BlockBase {
  type: "closing";
  content: RichText;
  signature?: string[];
}

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | AgendaBlock
  | DecisionBlock
  | ActionBlock
  | NoticeBlock
  | QuoteBlock
  | ContactBlock
  | ClosingBlock;

export type BlockType = Block["type"];

/* ---------- section layer ---------- */

export interface SectionHeading {
  text: string;
  level: 2 | 3;
}

export interface Section {
  id: BlockId;
  /** `undefined` means an untitled lead section. `h1` is reserved for the title. */
  heading?: SectionHeading;
  blocks: Block[];
  confidence?: Confidence;
}

/* ---------- document layer ---------- */

export interface DocumentMeta {
  title: string;
  subtitle?: string;
  date?: IsoDate;
  timeStart?: WallClock;
  timeEnd?: WallClock;
  location?: string;
  organisation?: string;
  footerNote?: string;
}

export const SCHEMA_VERSION = 1 as const;

export interface NewsletterDoc {
  schemaVersion: typeof SCHEMA_VERSION;
  id: BlockId;
  docLang: DocLang;
  /** Once true, the document language no longer follows the interface language (§9.1). */
  docLangExplicit: boolean;
  meta: DocumentMeta;
  intro?: RichText;
  sections: Section[];
  /** ISO 8601 UTC. */
  createdAt: string;
  updatedAt: string;
}

/**
 * The ten section types the user can add (§5.4). This array is the menu, in
 * menu order, and it is the contract that keeps the tool from drifting into a
 * word processor: adding an eleventh entry is a design decision.
 */
export const SECTION_TYPES = [
  "heading",
  "agenda",
  "decisions",
  "actions",
  "notice",
  "quote",
  "bullets",
  "numbers",
  "contact",
  "closing",
] as const;

export type SectionTypeKey = (typeof SECTION_TYPES)[number];
