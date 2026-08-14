import { formatDate, formatTimeRange, OOXML_LANG } from "../i18n/format";
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
 * DOCX — docs/PLAN.md §14.
 *
 * Real OOXML through `docx` v9, dynamically imported so its ~180 KB never enters
 * the initial bundle. This module imports `labels/` and never `i18n/`: an export
 * is a pure function of `NewsletterDoc` plus a `DocLang`, so it can be unit
 * tested by unzipping the blob with no DOM, no editor and no Word install.
 *
 * Two mappings are deliberate and worth stating:
 *
 * Fonts are Georgia and Calibri, not the screen pair. A DOCX names a font, it
 * does not carry one, and Word's substitution for an absent font is metric-driven
 * and unpredictable — line counts shift and page breaks move. A file that renders
 * correctly on every recipient's machine beats one that matches the brand font on
 * a minority of them.
 *
 * Info boxes are 1×1 tables, not shaded paragraphs. Word supports paragraph
 * shading, but a table cell reproduces the coloured-bar-plus-tinted-panel look
 * far more reliably, survives a round trip through LibreOffice and Google Docs,
 * and holds together across a page break.
 */

const MM = (value: number) => Math.round((value / 25.4) * 1440);

const COLOURS = {
  ink: "1A2340",
  brand: "253154",
  brandMid: "3C4E7A",
  muted: "4A5262",
  accent: "F2B233",
  hairline: "DFE3EB",
  infoFill: "E7EDF7",
  infoBar: "3C4E7A",
  importantFill: "FDF3DD",
  importantBar: "F2B233",
  decisionFill: "EAF0E9",
  decisionBar: "0F5132",
  actionFill: "FBEAE8",
  actionBar: "B02A1E",
} as const;

const HEADING_FONT = "Georgia";
const BODY_FONT = "Calibri";

const BULLET_REF = "nl-bullet";
const NUMBER_REF = "nl-number";
const AGENDA_REF = "nl-agenda";

export interface DocxLogo {
  data: ArrayBuffer;
  /** Intrinsic pixel size of the rendered PNG, used to preserve the ratio. */
  pixelWidth: number;
  pixelHeight: number;
}

export interface BuildDocxOptions {
  logo?: DocxLogo;
}

/** 32 mm placed width, in the points `docx` transformations expect. */
const LOGO_PLACED_WIDTH_PT = Math.round((32 / 25.4) * 72);

export async function buildDocx(
  doc: NewsletterDoc,
  labels: DocumentLabels,
  options: BuildDocxOptions = {},
): Promise<Blob> {
  const d = await import("docx");
  const lang = doc.docLang;
  const language = { value: OOXML_LANG[lang] };

  /* ---------- inline ---------- */

  const runs = (content: RichText, overrides: Record<string, unknown> = {}) => {
    const out: InstanceType<typeof d.TextRun | typeof d.ExternalHyperlink>[] = [];
    for (const node of content) {
      if (node.kind === "break") {
        out.push(new d.TextRun({ break: 1, language }));
        continue;
      }
      const base = {
        text: node.text,
        font: BODY_FONT,
        color: COLOURS.ink,
        // Run-level language is what actually drives Word's proofing tools.
        // Without it a Danish document is red-underlined by an English
        // dictionary, which looks broken to the recipient.
        language,
        bold: node.marks?.includes("bold") ?? false,
        italics: node.marks?.includes("italic") ?? false,
        ...overrides,
      };
      if (node.kind === "link") {
        out.push(
          new d.ExternalHyperlink({
            link: node.href,
            children: [
              new d.TextRun({ ...base, color: COLOURS.brandMid, underline: { type: "single" } }),
            ],
          }),
        );
        continue;
      }
      out.push(new d.TextRun(base));
    }
    return out;
  };

  const plainRun = (text: string, overrides: Record<string, unknown> = {}) =>
    new d.TextRun({ text, font: BODY_FONT, color: COLOURS.ink, language, ...overrides });

  /* ---------- shared block furniture ---------- */

  const labelParagraph = (text: string, colour: string) =>
    new d.Paragraph({
      spacing: { after: 80 },
      children: [
        plainRun(text.toLocaleUpperCase(lang === "da" ? "da-DK" : "en-GB"), {
          bold: true,
          size: 17,
          color: colour,
          characterSpacing: 20,
        }),
      ],
    });

  const panel = (fill: string, bar: string, children: InstanceType<typeof d.Paragraph>[]) =>
    new d.Table({
      width: { size: 100, type: d.WidthType.PERCENTAGE },
      borders: {
        top: { style: d.BorderStyle.NONE, size: 0, color: "auto" },
        bottom: { style: d.BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: d.BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: d.BorderStyle.SINGLE, size: 18, color: bar },
        insideHorizontal: { style: d.BorderStyle.NONE, size: 0, color: "auto" },
        insideVertical: { style: d.BorderStyle.NONE, size: 0, color: "auto" },
      },
      rows: [
        new d.TableRow({
          // Keeps the block whole across a page break.
          cantSplit: true,
          children: [
            new d.TableCell({
              shading: { type: d.ShadingType.CLEAR, fill, color: "auto" },
              margins: { top: MM(3), bottom: MM(3), left: MM(4), right: MM(4) },
              children,
            }),
          ],
        }),
      ],
    });

  const spacer = () => new d.Paragraph({ spacing: { after: 120 }, children: [] });

  /* ---------- blocks ---------- */

  const renderAgenda = (block: AgendaBlock) => [
    labelParagraph(block.title ?? labels.agenda, COLOURS.brand),
    ...block.items.map((item) => {
      const extras = [
        item.presenter ? `${labels.presenter}: ${item.presenter}` : "",
        typeof item.minutes === "number" ? `${item.minutes} ${labels.minutes}` : "",
      ].filter((part) => part.length > 0);
      return new d.Paragraph({
        numbering: { reference: AGENDA_REF, level: 0 },
        spacing: { after: 60 },
        children: [
          plainRun(item.text),
          ...(extras.length > 0
            ? [plainRun(`  ${extras.join(" · ")}`, { color: COLOURS.muted, size: 18 })]
            : []),
        ],
      });
    }),
    spacer(),
  ];

  const renderDecisions = (block: DecisionBlock) => [
    panel(COLOURS.decisionFill, COLOURS.decisionBar, [
      labelParagraph(block.title ?? labels.decisions, COLOURS.decisionBar),
      ...block.items.map(
        (item) =>
          new d.Paragraph({
            spacing: { after: 60 },
            children: [
              plainRun("\u2713  ", { color: COLOURS.decisionBar, bold: true }),
              ...runs(item),
            ],
          }),
      ),
    ]),
    spacer(),
  ];

  const renderActions = (block: ActionBlock) => [
    panel(COLOURS.actionFill, COLOURS.actionBar, [
      labelParagraph(block.title ?? labels.actions, COLOURS.actionBar),
      ...block.items.map((item) => {
        const meta = [
          item.owner ?? "",
          item.due ? `${labels.due} ${formatDate(item.due, lang, "short")}` : "",
        ].filter((part) => part.length > 0);
        return new d.Paragraph({
          spacing: { after: 60 },
          children: [
            plainRun("\u25A0  ", { color: COLOURS.actionBar }),
            ...runs(item.task),
            ...(meta.length > 0
              ? [plainRun(`  —  ${meta.join(" · ")}`, { color: COLOURS.muted, bold: true })]
              : []),
          ],
        });
      }),
    ]),
    spacer(),
  ];

  const renderNotice = (block: NoticeBlock) => {
    const important = block.tone === "important";
    const fill = important ? COLOURS.importantFill : COLOURS.infoFill;
    const bar = important ? COLOURS.importantBar : COLOURS.infoBar;
    const fallback = important ? labels.important : labels.info;
    return [
      panel(fill, bar, [
        labelParagraph(block.title ?? fallback, important ? COLOURS.ink : COLOURS.brandMid),
        new d.Paragraph({ children: runs(block.content) }),
      ]),
      spacer(),
    ];
  };

  const renderQuote = (block: QuoteBlock) => [
    new d.Paragraph({
      indent: { left: MM(6) },
      border: { left: { style: d.BorderStyle.SINGLE, size: 8, color: COLOURS.hairline, space: 8 } },
      spacing: { after: 60 },
      children: runs(block.content, { italics: true }),
    }),
    ...(block.attribution
      ? [
          new d.Paragraph({
            indent: { left: MM(6) },
            spacing: { after: 120 },
            children: [
              plainRun(block.attribution, {
                color: COLOURS.muted,
                size: 17,
                characterSpacing: 20,
              }),
            ],
          }),
        ]
      : [spacer()]),
  ];

  const renderContact = (block: ContactBlock) => [
    labelParagraph(block.title ?? labels.contact, COLOURS.brand),
    new d.Table({
      width: { size: 100, type: d.WidthType.PERCENTAGE },
      borders: {
        top: { style: d.BorderStyle.NONE, size: 0, color: "auto" },
        bottom: { style: d.BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: d.BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: d.BorderStyle.NONE, size: 0, color: "auto" },
        insideHorizontal: { style: d.BorderStyle.NONE, size: 0, color: "auto" },
        insideVertical: { style: d.BorderStyle.NONE, size: 0, color: "auto" },
      },
      rows: block.entries.map(
        (entry) =>
          new d.TableRow({
            cantSplit: true,
            children: [
              new d.TableCell({
                width: { size: 35, type: d.WidthType.PERCENTAGE },
                margins: { bottom: 60 },
                children: [
                  new d.Paragraph({
                    children: [
                      plainRun(entry.name ?? "", { bold: true }),
                      ...(entry.role
                        ? [plainRun(`\n${entry.role}`, { color: COLOURS.muted, size: 18 })]
                        : []),
                    ],
                  }),
                ],
              }),
              new d.TableCell({
                width: { size: 65, type: d.WidthType.PERCENTAGE },
                margins: { bottom: 60 },
                children: [
                  new d.Paragraph({
                    children: contactDetailRuns(entry),
                  }),
                ],
              }),
            ],
          }),
      ),
    }),
    spacer(),
  ];

  function contactDetailRuns(entry: ContactBlock["entries"][number]) {
    const parts: InstanceType<typeof d.TextRun | typeof d.ExternalHyperlink>[] = [];
    if (entry.email) {
      parts.push(
        new d.ExternalHyperlink({
          link: `mailto:${entry.email}`,
          children: [
            plainRun(entry.email, { color: COLOURS.brandMid, underline: { type: "single" } }),
          ],
        }),
      );
    }
    if (entry.phone) {
      if (parts.length > 0) parts.push(plainRun(" · "));
      parts.push(plainRun(entry.phone));
    }
    if (entry.url) {
      if (parts.length > 0) parts.push(plainRun(" · "));
      const href = entry.url.startsWith("http") ? entry.url : `https://${entry.url}`;
      parts.push(
        new d.ExternalHyperlink({
          link: href,
          children: [
            plainRun(entry.url, { color: COLOURS.brandMid, underline: { type: "single" } }),
          ],
        }),
      );
    }
    return parts;
  }

  const renderClosing = (block: ClosingBlock) => [
    new d.Paragraph({ spacing: { before: 240, after: 60 }, children: runs(block.content) }),
    ...(block.signature ?? []).map(
      (line) => new d.Paragraph({ spacing: { after: 0, line: 260 }, children: [plainRun(line)] }),
    ),
  ];

  const renderBlock = (block: Block): unknown[] => {
    switch (block.type) {
      case "heading":
        return [
          new d.Paragraph({
            heading: d.HeadingLevel.HEADING_2,
            keepNext: true,
            spacing: { before: 200, after: 80 },
            children: [
              plainRun(block.text.toLocaleUpperCase(lang === "da" ? "da-DK" : "en-GB"), {
                bold: true,
                size: 20,
                color: COLOURS.muted,
                characterSpacing: 20,
              }),
            ],
          }),
        ];
      case "paragraph":
        return [new d.Paragraph({ spacing: { after: 120 }, children: runs(block.content) })];
      case "list":
        return block.items.map(
          (item) =>
            new d.Paragraph({
              numbering: { reference: block.ordered ? NUMBER_REF : BULLET_REF, level: 0 },
              spacing: { after: 60 },
              children: runs(item),
            }),
        );
      case "agenda":
        return renderAgenda(block);
      case "decisions":
        return renderDecisions(block);
      case "actions":
        return renderActions(block);
      case "notice":
        return renderNotice(block);
      case "quote":
        return renderQuote(block);
      case "contact":
        return renderContact(block);
      case "closing":
        return renderClosing(block);
    }
  };

  const renderSection = (section: Section): unknown[] => {
    const out: unknown[] = [];
    if (section.heading) {
      out.push(
        new d.Paragraph({
          heading:
            section.heading.level === 3 ? d.HeadingLevel.HEADING_2 : d.HeadingLevel.HEADING_1,
          keepNext: true,
          spacing: { before: 320, after: 120 },
          children: [
            plainRun(section.heading.text, {
              font: HEADING_FONT,
              size: 26,
              bold: true,
              color: COLOURS.brand,
            }),
          ],
        }),
      );
    }
    for (const block of section.blocks) out.push(...renderBlock(block));
    return out;
  };

  /* ---------- document header block ---------- */

  const body: unknown[] = [];

  if (doc.meta.title.trim()) {
    body.push(
      new d.Paragraph({
        spacing: { after: 60 },
        children: [
          plainRun(doc.meta.title.trim(), {
            font: HEADING_FONT,
            size: 44,
            bold: true,
            color: COLOURS.ink,
          }),
        ],
      }),
    );
  }

  if (doc.meta.subtitle?.trim()) {
    body.push(
      new d.Paragraph({
        spacing: { after: 60 },
        children: [plainRun(doc.meta.subtitle.trim(), { size: 22, color: COLOURS.muted })],
      }),
    );
  }

  const metaParts = [
    formatDate(doc.meta.date, lang, "full"),
    formatTimeRange(doc.meta.timeStart, doc.meta.timeEnd, lang),
    doc.meta.location?.trim() ?? "",
  ].filter((part) => part.length > 0);

  if (metaParts.length > 0) {
    body.push(
      new d.Paragraph({
        spacing: { after: 240 },
        children: [plainRun(metaParts.join(" · "), { size: 19, color: COLOURS.muted })],
      }),
    );
  }

  if (doc.intro && doc.intro.length > 0) {
    body.push(new d.Paragraph({ spacing: { after: 160 }, children: runs(doc.intro) }));
  }

  for (const section of doc.sections) body.push(...renderSection(section));

  /* ---------- header and footer ---------- */

  const headerChildren: unknown[] = [];
  if (options.logo) {
    const ratio = options.logo.pixelHeight / options.logo.pixelWidth;
    headerChildren.push(
      new d.Paragraph({
        spacing: { after: 60 },
        children: [
          new d.ImageRun({
            type: "png",
            data: options.logo.data,
            // Derived from the source ratio, so distortion is impossible.
            transformation: {
              width: LOGO_PLACED_WIDTH_PT,
              height: Math.round(LOGO_PLACED_WIDTH_PT * ratio),
            },
            altText: { name: "logo", description: "Kredsens logo", title: "logo" },
          }),
        ],
      }),
    );
  }

  headerChildren.push(
    new d.Paragraph({
      alignment: d.AlignmentType.RIGHT,
      border: {
        bottom: { style: d.BorderStyle.SINGLE, size: 8, color: COLOURS.brand, space: 4 },
      },
      children: [
        plainRun(doc.meta.organisation?.trim() ?? "", {
          bold: true,
          size: 19,
          color: COLOURS.brand,
        }),
      ],
    }),
  );

  const footerParts = [doc.meta.organisation?.trim(), doc.meta.footerNote?.trim()].filter(
    (part): part is string => Boolean(part && part.length > 0),
  );

  const footer = new d.Footer({
    children: [
      new d.Paragraph({
        border: {
          top: { style: d.BorderStyle.SINGLE, size: 4, color: COLOURS.hairline, space: 4 },
        },
        tabStops: [{ type: d.TabStopType.RIGHT, position: MM(170) }],
        children: [
          plainRun(footerParts.join(" · "), { size: 17, color: COLOURS.muted }),
          plainRun("\t", { size: 17 }),
          plainRun("", { size: 17, color: COLOURS.muted }),
          new d.TextRun({
            children: [d.PageNumber.CURRENT, " / ", d.PageNumber.TOTAL_PAGES],
            font: BODY_FONT,
            size: 17,
            color: COLOURS.muted,
            language,
          }),
        ],
      }),
    ],
  });

  /* ---------- assemble ---------- */

  const document = new d.Document({
    title: doc.meta.title || "Nyhedsbrev",
    subject: doc.meta.subtitle ?? "",
    creator: doc.meta.organisation ?? "Nyhedsbrevsgenerator",
    description: describe(doc, lang),
    keywords: [labels.agenda, labels.decisions, labels.actions].join(", "),
    numbering: {
      config: [
        {
          reference: BULLET_REF,
          levels: [
            {
              level: 0,
              format: d.LevelFormat.BULLET,
              text: "\u25AA",
              alignment: d.AlignmentType.LEFT,
              style: {
                run: { color: COLOURS.brand },
                paragraph: { indent: { left: MM(6), hanging: MM(4) } },
              },
            },
          ],
        },
        {
          reference: NUMBER_REF,
          levels: [
            {
              level: 0,
              format: d.LevelFormat.DECIMAL,
              text: "%1.",
              alignment: d.AlignmentType.LEFT,
              style: {
                run: { color: COLOURS.brand, bold: true },
                paragraph: { indent: { left: MM(6), hanging: MM(4) } },
              },
            },
          ],
        },
        {
          reference: AGENDA_REF,
          levels: [
            {
              level: 0,
              format: d.LevelFormat.DECIMAL,
              text: "%1.",
              alignment: d.AlignmentType.LEFT,
              style: {
                run: { color: COLOURS.brand, bold: true },
                paragraph: { indent: { left: MM(7), hanging: MM(5) } },
              },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: { run: { font: BODY_FONT, size: 21, color: COLOURS.ink, language } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: MM(210), height: MM(297) },
            margin: {
              top: MM(18),
              bottom: MM(18),
              left: MM(20),
              right: MM(20),
              header: MM(10),
              footer: MM(10),
            },
          },
        },
        headers: { default: new d.Header({ children: headerChildren as never[] }) },
        footers: { default: footer },
        children: body as never[],
      },
    ],
  });

  return d.Packer.toBlob(document);
}

function describe(doc: NewsletterDoc, lang: DocLang): string {
  const what = lang === "da" ? "Nyhedsbrev til faglig klub" : "Newsletter for a local union club";
  return doc.meta.subtitle ? `${what} — ${doc.meta.subtitle}` : what;
}

/**
 * Loads the build-time raster. The PNG is generated from the SVG by
 * `scripts/build-logo-png.ts`, so it is deterministic, costs nothing at runtime,
 * and renders correctly in Word, LibreOffice and Google Docs — all of which
 * handle a DOCX-embedded SVG poorly (§14.4).
 */
export async function loadLogo(
  url = "/brand/ishoej-kreds18@300.png",
): Promise<DocxLogo | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const data = await response.arrayBuffer();
    const size = readPngSize(new Uint8Array(data));
    if (!size) return undefined;
    return { data, pixelWidth: size.width, pixelHeight: size.height };
  } catch {
    return undefined;
  }
}

/** The PNG IHDR chunk carries the intrinsic size in bytes 16–23. */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 24) return undefined;
  const signature = [0x89, 0x50, 0x4e, 0x47];
  if (signature.some((value, index) => bytes[index] !== value)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
