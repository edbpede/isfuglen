import type { BlockId, Confidence, DocLang, NewsletterDoc } from "../model/types";

/** One line of normalised input. Stage 2 output — docs/PLAN.md §11.1. */
export interface Line {
  /** Trimmed text. Indentation is recorded separately so it can be matched on. */
  text: string;
  /** Zero-based index in the normalised source. */
  index: number;
  /** Leading whitespace columns, tabs counted as four. */
  indent: number;
  blankBefore: boolean;
  blankAfter: boolean;
  /**
   * Set when the line opened with a Markdown heading marker, which the marker
   * has already been stripped from. This is what makes the raw-text view round
   * trip: the serialisation writes `## DAGSORDEN`, and the lexicon then sees
   * `DAGSORDEN` and classifies it as an agenda heading rather than as prose
   * beginning with two hash marks (§7.5).
   */
  headingLevel?: 2 | 3;
}

/**
 * What a single line is. Heading kinds carry the section type they open, so
 * stage 5 never has to re-inspect the text.
 */
export type LineKind =
  | "heading"
  | "subheading"
  | "agendaHeading"
  | "decisionsHeading"
  | "actionsHeading"
  | "importantHeading"
  | "infoHeading"
  | "contactHeading"
  | "closingHeading"
  | "listItem"
  | "orderedItem"
  | "quote"
  | "contactLine"
  | "signatureLine"
  | "metaLine"
  | "paragraph";

/** Kinds that open a new section. `metaLine` deliberately does not. */
export const HEADING_KINDS: readonly LineKind[] = [
  "heading",
  "subheading",
  "agendaHeading",
  "decisionsHeading",
  "actionsHeading",
  "importantHeading",
  "infoHeading",
  "contactHeading",
  "closingHeading",
];

export function isHeadingKind(kind: LineKind): boolean {
  return HEADING_KINDS.includes(kind);
}

export interface ParseContext {
  lang: DocLang;
  lines: Line[];
}

/**
 * How a lexicon trigger matched:
 *  - `whole`    the line is exactly the trigger (`Dagsorden`)
 *  - `labelled` the trigger labels the rest of the line (`Beslutning: vi gør X`)
 *  - `prefix`   the trigger opens a full sentence (`Frist for tilmelding er …`)
 */
export type MatchShape = "whole" | "labelled" | "prefix";

/** What a rule contributes beyond the kind itself. */
export interface RuleExtraction {
  /** The heading text, with numbering and trailing colon removed. */
  label?: string;
  /** Content that followed a label on the same line: `Beslutning: vi gør X`. */
  rest?: string;
  /** The list marker that opened the line, for ordered/unordered detection. */
  marker?: string;
  /** True when the label is the pack's own word for this kind, so it is droppable. */
  labelIsGeneric?: boolean;
  shape?: MatchShape;
  /** Heading depth, when the source stated one explicitly. */
  level?: 2 | 3;
  /** The notice tone, for the `[VIGTIGT] …` serialisation form. */
  tone?: "info" | "important";
  attribution?: string;
}

export interface Rule {
  /** `da.heading.agenda` — surfaces in ParseReport so a misfire is reportable. */
  id: string;
  lang: DocLang;
  kind: LineKind;
  /** 0–100. Highest wins; ties break toward the earlier rule, Danish before English. */
  score: number;
  /**
   * The catch-all that matches every line. It never counts as evidence of an
   * ambiguous classification, because it agrees with everything.
   */
  fallback?: boolean;
  test: (line: Line, ctx: ParseContext) => boolean;
  extract?: (line: Line, ctx: ParseContext) => RuleExtraction;
}

export interface Classified {
  line: Line;
  kind: LineKind;
  score: number;
  confidence: Confidence;
  ruleId: string;
  extraction: RuleExtraction;
}

/** Consecutive lines that share a kind. Stage 4 output. */
export interface Chunk {
  kind: LineKind;
  entries: Classified[];
  confidence: Confidence;
  ruleId: string;
}

export interface LowConfidenceEntry {
  blockId: BlockId;
  ruleId: string;
  preview: string;
}

export interface ParseReport {
  sectionCount: number;
  agendaCount: number;
  decisionCount: number;
  actionCount: number;
  noticeCount: number;
  lowConfidence: LowConfidenceEntry[];
  /** Rule id → how many lines it classified. */
  rulesFired: Record<string, number>;
  lineCount: number;
  durationMs: number;
}

export interface ParseResult {
  doc: NewsletterDoc;
  report: ParseReport;
}

/**
 * The extension point a future AI path would implement (§11.8). v1 registers
 * exactly one implementation, and nothing in the app depends on more.
 */
export interface Restructurer {
  id: string;
  restructure(raw: string, ctx: { lang: DocLang }): Promise<ParseResult>;
}
