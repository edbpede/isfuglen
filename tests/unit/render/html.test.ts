import { describe, expect, test } from "bun:test";
import { labelsFor } from "../../../src/lib/labels/index";
import { renderDocumentHtml, renderInline } from "../../../src/lib/render/html";
import { everyBlockDoc } from "../helpers/document";

/** docs/PLAN.md §20.1 — renderer output per block type, in both languages. */

describe("renderInline", () => {
  test("marks nest strong outside em", () => {
    expect(renderInline([{ kind: "text", text: "x", marks: ["bold", "italic"] }])).toBe(
      "<strong><em>x</em></strong>",
    );
  });

  test("escapes text and attributes", () => {
    expect(renderInline([{ kind: "text", text: '<script>&"' }])).toBe("&lt;script&gt;&amp;&quot;");
    expect(renderInline([{ kind: "link", href: 'javascript:"x', text: "a" }])).toBe(
      '<a href="javascript:&quot;x">a</a>',
    );
  });

  test("a hard break is a br", () => {
    expect(renderInline([{ kind: "break" }])).toBe("<br />");
  });
});

describe("document rendering", () => {
  const html = renderDocumentHtml(everyBlockDoc("da"), labelsFor("da"));

  test("one h1, and section headings are h2", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('<h1 class="nl-title">Klubmøde august</h1>');
    expect(html).toContain('<h2 class="nl-h2">Indledning</h2>');
    expect(html).toContain('<h3 class="nl-h3">Underoverskrift</h3>');
  });

  test("the meta line uses Danish locale conventions", () => {
    expect(html).toContain("fredag den 14. august 2026");
    expect(html).toContain("kl.\u00A015.30\u201317.00");
  });

  test("every block type renders its own treatment", () => {
    for (const marker of [
      "nl-agenda",
      "nl-decisions",
      "nl-actions",
      "nl-notice-important",
      "nl-notice-info",
      "nl-quote",
      "nl-contact",
      "nl-closing",
      "nl-ul",
      "nl-ol",
    ]) {
      expect(html, `missing ${marker}`).toContain(marker);
    }
  });

  test("generated labels come from the label pack, not the user's text", () => {
    expect(html).toContain(">Dagsorden<");
    expect(html).toContain(">Beslutninger<");
    expect(html).toContain(">Handlinger<");
    expect(html).toContain(">Vigtigt<");
    expect(html).toContain(">Til orientering<");
  });

  test("switching document language relabels without touching content", () => {
    const english = renderDocumentHtml(everyBlockDoc("en"), labelsFor("en"));
    expect(english).toContain(">Agenda<");
    expect(english).toContain(">Decisions<");
    expect(english).toContain(">Action items<");
    expect(english).toContain(">Important<");
    expect(english).toContain("Friday 14 August 2026");
    expect(english).toContain("15:30\u201317:00");
    // The user's own words are identical in both.
    expect(english).toContain("Klubmøde august");
    expect(english).toContain("Vi skal have en aftale.");
  });

  test("the root carries the document language for hyphenation and screen readers", () => {
    expect(html).toContain('<article class="nl-doc" lang="da">');
    expect(renderDocumentHtml(everyBlockDoc("en"), labelsFor("en"))).toContain('lang="en"');
  });

  test("interactive mode adds the ids the preview maps clicks through", () => {
    const interactive = renderDocumentHtml(everyBlockDoc("da"), labelsFor("da"), {
      interactive: true,
    });
    expect(interactive).toContain("data-block-id=");
    expect(interactive).toContain("data-section-id=");
    expect(html).not.toContain("data-block-id=");
  });

  test("an empty document renders no empty heading", () => {
    const doc = everyBlockDoc("da");
    doc.meta.title = "";
    doc.meta.subtitle = undefined;
    const empty = renderDocumentHtml(doc, labelsFor("da"));
    expect(empty).not.toContain("<h1");
    expect(empty).not.toContain("nl-subtitle");
  });

  test("Danish characters survive the renderer", () => {
    expect(html).toContain("Klubmøde");
    expect(html).toContain("Lærerværelset");
    expect(html).toContain("Ishøj Lærerkreds");
  });
});
