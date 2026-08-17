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
  });

  test("a quote in a destination cannot open a second attribute", () => {
    // Unescaped, Chromium parses `href="…" onmouseover="…"` as two attributes,
    // the second of which is an event handler. Both of these are valid https
    // destinations, so the protocol check passes them and escaping is what
    // stops them.
    expect(
      renderInline([{ kind: "link", href: 'https://x.dk/a" onmouseover="alert(1)', text: "a" }]),
    ).toBe('<a href="https://x.dk/a&quot; onmouseover=&quot;alert(1)">a</a>');
    expect(renderInline([{ kind: "link", href: 'x" onmouseover="alert(1)', text: "a" }])).toBe(
      '<a href="x&quot; onmouseover=&quot;alert(1)">a</a>',
    );
  });

  test("only the editor schema's protocols become links", () => {
    for (const href of ["https://x.dk", "http://x.dk", "mailto:a@x.dk", "tel:+4512345678"]) {
      expect(renderInline([{ kind: "link", href, text: "a" }])).toBe(`<a href="${href}">a</a>`);
    }
    for (const href of [
      'javascript:"x',
      "JaVaScRiPt:alert(1)",
      "  javascript:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
    ]) {
      // The mark is dropped, exactly as TipTap drops it — the words stay.
      expect(renderInline([{ kind: "link", href, text: "a", marks: ["bold"] }])).toBe(
        "<strong>a</strong>",
      );
    }
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

  test("markers are real elements, not CSS generated content", () => {
    // A CSS counter, a `::marker` box and a `content` string are all unreadable
    // from the DOM, so the PDF export cannot transcribe them. Emitting them as
    // elements is what lets one renderer keep serving preview, print and export.
    expect(html).toContain('<span class="nl-agenda-number">1</span>');
    expect(html).toContain('<span class="nl-list-number">1.</span>');
    expect(html).toContain('class="nl-decision-mark"');
  });

  test("the decision tick is geometry rather than a glyph nothing embeds", () => {
    // U+2713 sits outside every `unicode-range` in fonts.css, so it came from a
    // system fallback that differs by platform.
    expect(html).not.toContain("\u2713");
    expect(html).not.toContain("\u25a0");
    expect(html).toMatch(/<svg class="nl-decision-mark" viewBox="0 0 12 12"/);
    expect(html).toContain('aria-hidden="true"');
  });

  test("ordered lists number themselves so a page split cannot restart them", () => {
    const numbers = [...html.matchAll(/<span class="nl-list-number">(\d+)\.<\/span>/g)].map(
      (match) => match[1],
    );
    expect(numbers.length).toBeGreaterThan(1);
    expect(numbers.slice(0, 2)).toEqual(["1", "2"]);
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
    // Punctuation-tolerant for the reason given in tests/unit/i18n/format.test.ts:
    // ICU has moved the comma in `Friday, 14 August 2026` between releases.
    expect(english).toMatch(/Friday,? 14 August 2026/);
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
