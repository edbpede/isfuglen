import {
  actionItem,
  agendaItem,
  blocksForSectionType,
  contactEntry,
  createBlankDoc,
  section as makeSection,
  newId,
  rich,
} from "../model/factory";
import type {
  Block,
  DocLang,
  DocumentMeta,
  NewsletterDoc,
  Section,
  SectionTypeKey,
} from "../model/types";
import type { ParseReport } from "../parser/types";

/**
 * The workspace's document state — docs/PLAN.md §6.1.
 *
 * A runes class in a `.svelte.ts` module. `$state` proxies deeply, so a text
 * field can `bind:value` straight to `store.doc.meta.title` or to an item inside
 * a block, and only structural operations — add, remove, reorder — need a method
 * here. That keeps the surface small without giving up a single source of truth.
 */
export class DocumentStore {
  doc = $state<NewsletterDoc>(createBlankDoc());
  report = $state<ParseReport | null>(null);
  /** Set once the user dismisses the review strip; permanent for that draft. */
  reviewDismissed = $state(false);

  get sectionCount(): number {
    return this.doc.sections.length;
  }

  get lowConfidenceCount(): number {
    return this.report?.lowConfidence.length ?? 0;
  }

  get isEmpty(): boolean {
    const hasContent = this.doc.sections.some((section) => section.blocks.length > 0);
    return !hasContent && this.doc.meta.title.trim().length === 0 && !this.doc.intro;
  }

  /** Replaces the whole document, e.g. after a parse or a draft load. */
  load(doc: NewsletterDoc, report: ParseReport | null = null): void {
    this.doc = doc;
    this.report = report;
    this.reviewDismissed = report === null;
  }

  reset(docLang: DocLang, organisation: string, footerNote: string): void {
    this.load(createBlankDoc({ docLang, organisation, footerNote }));
  }

  touch(): void {
    this.doc.updatedAt = new Date().toISOString();
  }

  updateMeta(patch: Partial<DocumentMeta>): void {
    this.doc.meta = { ...this.doc.meta, ...patch };
    this.touch();
  }

  /**
   * Setting the document language explicitly severs its link to the interface
   * language permanently, for this document (§9.1). A Danish newsletter written
   * in an English interface is fully supported, and so is the reverse.
   *
   * There is deliberately no counterpart that re-syncs the two: the coupling
   * exists at document creation and nowhere else. Switching the interface
   * language must never relabel a document the user is already working on.
   */
  setDocLang(lang: DocLang, explicit = true): void {
    this.doc.docLang = lang;
    if (explicit) this.doc.docLangExplicit = true;
    this.touch();
  }

  /* ---------- sections ---------- */

  addSection(type: SectionTypeKey, headingText = ""): Section {
    const created = makeSection(
      type === "heading" ? headingText : undefined,
      blocksForSectionType(type),
    );
    this.doc.sections.push(created);
    this.touch();
    return created;
  }

  removeSection(id: string): void {
    this.doc.sections = this.doc.sections.filter((section) => section.id !== id);
    this.touch();
  }

  moveSection(id: string, delta: number): boolean {
    const from = this.doc.sections.findIndex((section) => section.id === id);
    if (from < 0) return false;
    const to = from + delta;
    if (to < 0 || to >= this.doc.sections.length) return false;
    const [moved] = this.doc.sections.splice(from, 1);
    if (!moved) return false;
    this.doc.sections.splice(to, 0, moved);
    this.touch();
    return true;
  }

  setSectionHeading(id: string, text: string): void {
    const section = this.doc.sections.find((candidate) => candidate.id === id);
    if (!section) return;
    if (text.trim().length === 0) {
      section.heading = undefined;
    } else if (section.heading) {
      section.heading.text = text;
    } else {
      section.heading = { text, level: 2 };
    }
    this.touch();
  }

  sectionOf(blockId: string): Section | undefined {
    return this.doc.sections.find((section) =>
      section.blocks.some((block) => block.id === blockId),
    );
  }

  findBlock(blockId: string): Block | undefined {
    for (const section of this.doc.sections) {
      const block = section.blocks.find((candidate) => candidate.id === blockId);
      if (block) return block;
    }
    return undefined;
  }

  /** Clearing the marker is how a user says "I checked this one". */
  clearConfidence(blockId: string): void {
    const block = this.findBlock(blockId);
    if (!block) return;
    block.confidence = undefined;
    this.touch();
  }

  /* ---------- items inside blocks ---------- */

  addAgendaItem(block: { items: ReturnType<typeof agendaItem>[] }): void {
    block.items.push(agendaItem(""));
    this.touch();
  }

  addActionItem(block: { items: ReturnType<typeof actionItem>[] }): void {
    block.items.push(actionItem(""));
    this.touch();
  }

  addContactEntry(block: { entries: ReturnType<typeof contactEntry>[] }): void {
    block.entries.push(contactEntry({}));
    this.touch();
  }

  addTextItem(block: { items: ReturnType<typeof rich>[] }): void {
    block.items.push(rich(""));
    this.touch();
  }

  removeItem(list: { id?: string }[], index: number): void {
    list.splice(index, 1);
    this.touch();
  }

  addSignatureLine(block: { signature?: string[] }): void {
    block.signature = [...(block.signature ?? []), ""];
    this.touch();
  }

  /** Blocks created after the initial parse carry no parser provenance. */
  newBlockId(): string {
    return newId();
  }
}
