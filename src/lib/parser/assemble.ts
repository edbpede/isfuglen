import {
  actions,
  agenda,
  closing,
  contact,
  decisions,
  heading as headingBlock,
  list,
  section as makeSection,
  notice,
  paragraph,
  quote,
} from "../model/factory";
import type {
  ActionBlock,
  AgendaBlock,
  Block,
  ClosingBlock,
  ContactBlock,
  DecisionBlock,
  DocLang,
  DocumentMeta,
  NoticeBlock,
  RichText,
  Section,
} from "../model/types";
import { extractActionItem, extractAgendaItem, extractContactEntry } from "./enrich";
import { parseInline } from "./inline";
import type { Chunk } from "./types";

/**
 * Stage 5 — provisional blocks become sections (docs/PLAN.md §11.1). The
 * document header has already been promoted out of the body by `header.ts`.
 *
 * One decision is load-bearing for §24.2.6: when a heading's text is the rule
 * pack's own word for that block type — `Dagsorden`, `Beslutninger` — it is
 * *dropped*, and the block renders the label from `labels/[docLang]` instead.
 * That is what makes switching document language re-label a parsed document
 * rather than leaving the original Danish word frozen in place.
 */

export interface Assembly {
  meta: DocumentMeta;
  intro?: RichText;
  sections: Section[];
}

export interface AssembleInput {
  chunks: Chunk[];
  meta: DocumentMeta;
  lang: DocLang;
  today: Date;
}

type Container =
  | { kind: "none" }
  | { kind: "agenda"; block: AgendaBlock }
  | { kind: "decisions"; block: DecisionBlock }
  | { kind: "actions"; block: ActionBlock }
  | { kind: "notice"; block: NoticeBlock }
  | { kind: "contact"; block: ContactBlock }
  | { kind: "closing"; block: ClosingBlock };

export function assemble(input: AssembleInput): Assembly {
  const { chunks, lang, today } = input;
  const meta: DocumentMeta = { ...input.meta };
  const sections: Section[] = [];
  let intro: RichText | undefined;
  let container: Container = { kind: "none" };
  let cursor = 0;

  // The first paragraph before any heading is the greeting, and it belongs in
  // the document header card rather than in a section of its own.
  const lead = chunks[cursor];
  if (lead && lead.kind === "paragraph") {
    intro = parseInline(text(lead));
    cursor += 1;
  }

  /* ---- body ---- */

  const openSection = (blocks: Block[], chunk: Chunk, title?: string): Section => {
    const created = makeSection(title, blocks);
    created.confidence = chunk.confidence;
    for (const block of blocks) {
      block.confidence = chunk.confidence;
      block.sourceRuleId = chunk.ruleId;
    }
    sections.push(created);
    return created;
  };

  const current = (): Section => {
    const last = sections.at(-1);
    if (last) return last;
    const created = makeSection(undefined, []);
    sections.push(created);
    return created;
  };

  const push = (block: Block, chunk: Chunk): void => {
    block.confidence = chunk.confidence;
    block.sourceRuleId = chunk.ruleId;
    current().blocks.push(block);
  };

  for (let index = cursor; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!chunk) continue;

    switch (chunk.kind) {
      case "heading": {
        const label = headingText(chunk);
        const last = sections.at(-1);
        if (last?.heading && last.blocks.length === 0) {
          // Two headings back to back: the second is a sub-heading of the first.
          push(headingBlock(label, 3), chunk);
          container = { kind: "none" };
          break;
        }
        openSection([], chunk, label);
        container = { kind: "none" };
        break;
      }

      case "subheading": {
        push(headingBlock(headingText(chunk), 3), chunk);
        break;
      }

      case "agendaHeading": {
        const block = agenda([], sectionTitle(chunk));
        openSection([block], chunk);
        container = { kind: "agenda", block };
        break;
      }

      case "decisionsHeading": {
        const block = decisions([], sectionTitle(chunk));
        openSection([block], chunk);
        container = { kind: "decisions", block };
        if (chunk.entries[0]?.extraction.shape === "labelled") {
          const rest = chunk.entries[0]?.extraction.rest;
          if (rest) block.items.push(parseInline(rest));
        }
        break;
      }

      case "actionsHeading": {
        const block = actions([], sectionTitle(chunk));
        openSection([block], chunk);
        container = { kind: "actions", block };
        if (chunk.entries[0]?.extraction.shape === "labelled") {
          const rest = chunk.entries[0]?.extraction.rest;
          if (rest) block.items.push(extractActionItem(rest, lang, today));
        }
        break;
      }

      case "importantHeading":
      case "infoHeading": {
        const tone = chunk.kind === "importantHeading" ? "important" : "info";
        const entry = chunk.entries[0];
        const shape = entry?.extraction.shape ?? "whole";
        const content = shape === "whole" ? [] : parseInline(entry?.extraction.rest ?? "");
        const block = notice(content, tone, sectionTitle(chunk));
        openSection([block], chunk);
        container = { kind: "notice", block };
        break;
      }

      case "contactHeading": {
        const block = contact([], sectionTitle(chunk));
        openSection([block], chunk);
        container = { kind: "contact", block };
        break;
      }

      case "closingHeading": {
        const entry = chunk.entries[0];
        const line = entry?.line.text ?? "";
        const block = closing(parseInline(line));
        openSection([block], chunk);
        container = { kind: "closing", block };
        break;
      }

      case "listItem":
      case "orderedItem": {
        const items = chunk.entries.map((entry) => entry.extraction.rest ?? entry.line.text);
        if (container.kind === "agenda") {
          for (const item of items) container.block.items.push(extractAgendaItem(item, lang));
          break;
        }
        if (container.kind === "decisions") {
          for (const item of items) container.block.items.push(parseInline(item));
          break;
        }
        if (container.kind === "actions") {
          for (const item of items)
            container.block.items.push(extractActionItem(item, lang, today));
          break;
        }
        if (container.kind === "contact") {
          for (const item of items) container.block.entries.push(extractContactEntry(item));
          break;
        }
        push(
          list(
            items.map((item) => parseInline(item)),
            chunk.kind === "orderedItem",
          ),
          chunk,
        );
        break;
      }

      case "contactLine": {
        if (container.kind === "contact") {
          for (const entry of chunk.entries) {
            container.block.entries.push(extractContactEntry(entry.line.text));
          }
          break;
        }
        const block = contact(chunk.entries.map((entry) => extractContactEntry(entry.line.text)));
        push(block, chunk);
        container = { kind: "contact", block };
        break;
      }

      case "quote": {
        // The rule strips the surrounding quotation marks; the template draws
        // the quote's own treatment, so keeping them would double the signal.
        const body = chunk.entries
          .map((entry) => entry.extraction.rest ?? entry.line.text)
          .join(" ");
        push(quote(parseInline(body)), chunk);
        break;
      }

      case "metaLine":
      case "paragraph": {
        if (container.kind === "notice") {
          if (container.block.content.length === 0) {
            container.block.content = parseInline(text(chunk));
          } else {
            push(paragraph(parseInline(text(chunk))), chunk);
          }
          break;
        }
        if (container.kind === "closing") {
          const signature = container.block.signature ?? [];
          for (const entry of chunk.entries) signature.push(entry.line.text);
          container.block.signature = signature;
          break;
        }
        if (container.kind === "contact") {
          for (const entry of chunk.entries) {
            container.block.entries.push(extractContactEntry(entry.line.text));
          }
          break;
        }
        if (container.kind === "agenda") {
          for (const entry of chunk.entries) {
            container.block.items.push(extractAgendaItem(entry.line.text, lang));
          }
          break;
        }
        if (container.kind === "decisions") {
          for (const entry of chunk.entries)
            container.block.items.push(parseInline(entry.line.text));
          break;
        }
        if (container.kind === "actions") {
          for (const entry of chunk.entries) {
            container.block.items.push(extractActionItem(entry.line.text, lang, today));
          }
          break;
        }
        push(paragraph(parseInline(text(chunk))), chunk);
        break;
      }

      case "signatureLine": {
        if (container.kind === "closing") {
          const signature = container.block.signature ?? [];
          for (const entry of chunk.entries) signature.push(entry.line.text);
          container.block.signature = signature;
          break;
        }
        push(paragraph(parseInline(text(chunk))), chunk);
        break;
      }
    }
  }

  return intro ? { meta, intro, sections } : { meta, sections };
}

/* ---------- helpers ---------- */

function text(chunk: Chunk): string {
  return chunk.entries.map((entry) => entry.line.text).join(" ");
}

function headingText(chunk: Chunk): string {
  const entry = chunk.entries[0];
  if (!entry) return "";
  if (entry.extraction.shape === "prefix") return entry.line.text;
  return entry.extraction.label ?? entry.line.text;
}

/**
 * `undefined` when the heading is the pack's own word for the block type, so the
 * block renders the label of the current document language instead.
 */
function sectionTitle(chunk: Chunk): string | undefined {
  const entry = chunk.entries[0];
  if (!entry) return undefined;
  if (entry.extraction.labelIsGeneric) return undefined;
  return entry.extraction.label ?? entry.line.text;
}
