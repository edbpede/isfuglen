import { describe, expect, test } from "bun:test";
import { renderClipboard, renderClipboardHtml } from "../../../src/lib/export/clipboard";
import { labelsFor } from "../../../src/lib/labels/index";
import { everyBlockDoc } from "../helpers/document";

/** docs/PLAN.md §15.2 — what the clipboard HTML must look like, asserted. */

const html = renderClipboardHtml(everyBlockDoc("da"), labelsFor("da"));

describe("clipboard HTML", () => {
  test("carries a charset declaration so æøå survive", () => {
    expect(html.startsWith('<meta charset="utf-8">')).toBe(true);
    expect(html).toContain("Klubmøde august");
    expect(html).toContain("Lærerværelset");
  });

  test("has no style block and no class attributes — both are stripped by mail clients", () => {
    expect(html).not.toContain("<style");
    expect(html).not.toContain("class=");
  });

  test("every declaration is inline", () => {
    expect(html).toContain('style="');
    // Every element that carries visual meaning carries its own style attribute.
    const styled = html.match(/style="/g) ?? [];
    expect(styled.length).toBeGreaterThan(10);
  });

  test("font sizes are in points, which Word interprets predictably", () => {
    expect(html).toContain("font-size:10.5pt");
    expect(html).not.toMatch(/font-size:\s*\d+px/);
  });

  test("semantic blocks are tables with cell shading, not styled paragraphs", () => {
    // Google Docs drops paragraph background colours but keeps cell shading.
    expect(html).toContain("<table");
    expect(html).toContain("background-color:#FDF3DD");
    expect(html).toContain("background-color:#EAF0E9");
    expect(html).toContain("background-color:#FBEAE8");
    expect(html).toContain("border-left:4px solid");
  });

  test("uses the semantic elements every target maps onto its own styles", () => {
    for (const tag of ["<h1", "<h2", "<h3", "<p", "<ul", "<ol", "<li", "<a ", "<strong", "<em"]) {
      expect(html, `missing ${tag}`).toContain(tag);
    }
  });

  test("carries no logo — an img is either blocked or truncated by mail clients", () => {
    expect(html).not.toContain("<img");
  });

  test("labels follow the document language", () => {
    const english = renderClipboardHtml(everyBlockDoc("en"), labelsFor("en"));
    expect(english).toContain("AGENDA");
    expect(english).toContain("ACTION ITEMS");
    expect(english).toContain("Friday 14 August 2026");
    expect(html).toContain("DAGSORDEN");
  });

  test("escapes user content rather than trusting it", () => {
    const doc = everyBlockDoc("da");
    doc.meta.title = '<img src=x onerror="alert(1)">';
    const escaped = renderClipboardHtml(doc, labelsFor("da"));
    expect(escaped).not.toContain("<img src=x");
    expect(escaped).toContain("&lt;img src=x");
  });
});

describe("payload", () => {
  test("both flavours are produced from the same document", () => {
    const payload = renderClipboard(everyBlockDoc("da"), labelsFor("da"));
    expect(payload.html).toContain("<table");
    expect(payload.text).toContain("## DAGSORDEN");
    expect(payload.text).not.toContain("<");
  });
});
