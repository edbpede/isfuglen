import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import { buildDocx, readPngSize } from "../../../src/lib/export/docx";
import { docxFilename, printTitle, slugify } from "../../../src/lib/export/filename";
import { labelsFor } from "../../../src/lib/labels/index";
import { everyBlockDoc } from "../helpers/document";

/**
 * docs/PLAN.md §20.1.
 *
 * Unzipping the generated blob and asserting on `word/document.xml` turns "the
 * DOCX export works" from a manual claim into a CI gate, with no Word install
 * required. What Word *does* with the file still belongs to the manual matrix.
 */

async function unzip(docLang: "da" | "en") {
  const blob = await buildDocx(everyBlockDoc(docLang), labelsFor(docLang));
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return {
    zip,
    document: (await zip.file("word/document.xml")?.async("string")) ?? "",
    header: (await zip.file("word/header1.xml")?.async("string")) ?? "",
    footer: (await zip.file("word/footer1.xml")?.async("string")) ?? "",
    numbering: (await zip.file("word/numbering.xml")?.async("string")) ?? "",
    core: (await zip.file("docProps/core.xml")?.async("string")) ?? "",
  };
}

describe("the package", () => {
  test("is a real OOXML package with the parts Word requires", async () => {
    const { zip } = await unzip("da");
    for (const path of [
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
      "word/styles.xml",
      "word/numbering.xml",
    ]) {
      expect(zip.file(path), `missing ${path}`).not.toBeNull();
    }
  });

  test("declares UTF-8 and keeps æøå intact", async () => {
    const { document } = await unzip("da");
    expect(document).toContain('encoding="UTF-8"');
    expect(document).toContain("Klubmøde august");
    expect(document).toContain("Lærerværelset");
    expect(document).toContain("Ishøj Lærerkreds");
  });
});

describe("content mapping", () => {
  test("every block type reaches the document", async () => {
    const { document } = await unzip("da");
    expect(document).toContain("Klubmøde august");
    expect(document).toContain("Godkendelse af referat");
    expect(document).toContain("Klubben bakker op om forslaget.");
    expect(document).toContain("Indkalde til møde");
    expect(document).toContain("Frist for tilmelding er 20. august.");
    expect(document).toContain("Vi skal have en aftale.");
    expect(document).toContain("mette@ishoejlaererkreds.dk");
    expect(document).toContain("Med venlig hilsen");
  });

  test("generated labels come from the document language", async () => {
    const danish = await unzip("da");
    expect(danish.document).toContain("DAGSORDEN");
    expect(danish.document).toContain("BESLUTNINGER");
    expect(danish.document).toContain("HANDLINGER");
    expect(danish.document).toContain("VIGTIGT");

    const english = await unzip("en");
    expect(english.document).toContain("AGENDA");
    expect(english.document).toContain("DECISIONS");
    expect(english.document).toContain("ACTION ITEMS");
    expect(english.document).toContain("IMPORTANT");
  });

  test("dates are formatted in the document language", async () => {
    expect((await unzip("da")).document).toContain("fredag den 14. august 2026");
    expect((await unzip("en")).document).toContain("Friday 14 August 2026");
  });

  test("info boxes are tables with shading and a coloured left border", async () => {
    const { document } = await unzip("da");
    expect(document).toContain("<w:tbl>");
    expect(document).toContain('w:fill="FDF3DD"');
    expect(document).toContain('w:fill="EAF0E9"');
    expect(document).toContain('w:fill="FBEAE8"');
    // Keeps the block whole across a page break.
    expect(document).toContain("cantSplit");
  });

  test("links are real hyperlinks", async () => {
    const { document, zip } = await unzip("da");
    expect(document).toContain("<w:hyperlink");
    const rels = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
    expect(rels).toContain("https://kreds18.dk");
    expect(rels).toContain("mailto:mette@ishoejlaererkreds.dk");
  });

  test("headings use Word's own heading styles so the hierarchy survives", async () => {
    const { document } = await unzip("da");
    expect(document).toContain('w:val="Heading1"');
    expect(document).toContain('w:val="Heading2"');
    expect(document).toContain("<w:keepNext");
  });
});

describe("language metadata", () => {
  test("every run carries the proofing language", async () => {
    const danish = await unzip("da");
    expect(danish.document).toContain('w:val="da-DK"');
    expect(danish.document).not.toContain('w:val="en-GB"');

    const english = await unzip("en");
    expect(english.document).toContain('w:val="en-GB"');
  });

  test("core properties are set from the document", async () => {
    const { core } = await unzip("da");
    expect(core).toContain("Klubmøde august");
    expect(core).toContain("Ishøj Lærerkreds");
  });
});

describe("numbering, header and footer", () => {
  test("bullet, number and agenda definitions are all present", async () => {
    const { numbering } = await unzip("da");
    expect(numbering).toContain("<w:abstractNum");
    // Three references means three independent numbering sequences.
    expect((numbering.match(/<w:abstractNum /g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test("the header carries the organisation and the footer the page number", async () => {
    const { header, footer } = await unzip("da");
    expect(header).toContain("Ishøj Lærerkreds");
    expect(footer).toContain("PAGE");
    expect(footer).toContain("NUMPAGES");
    expect(footer).toContain("Kreds 18");
  });

  test("the page is A4 with the plan's margins", async () => {
    const { document } = await unzip("da");
    // A4 in twips, and the 18 mm / 20 mm margins converted from millimetres:
    // 18 mm is 1020.47 twips and 20 mm is exactly 1134.
    expect(document).toContain('w:w="11906"');
    expect(document).toContain('w:h="16838"');
    expect(document).toContain('w:orient="portrait"');
    expect(document).toContain('w:top="1020"');
    expect(document).toContain('w:bottom="1020"');
    expect(document).toContain('w:left="1134"');
    expect(document).toContain('w:right="1134"');
  });
});

describe("the logo raster", () => {
  test("reads the intrinsic size out of a PNG header", async () => {
    const bytes = new Uint8Array(
      await Bun.file("public/brand/ishoej-kreds18@300.png").arrayBuffer(),
    );
    const size = readPngSize(bytes);
    // 32 mm at 300 ppi.
    expect(size?.width).toBe(378);
    expect(size?.height).toBeGreaterThan(0);
  });

  test("rejects anything that is not a PNG", () => {
    expect(readPngSize(new Uint8Array([1, 2, 3]))).toBeUndefined();
    expect(readPngSize(new Uint8Array(40))).toBeUndefined();
  });
});

describe("filenames", () => {
  test("transliterates æøå so the name survives every filesystem", () => {
    expect(slugify("Klubmøde august")).toBe("klubmoede-august");
    expect(slugify("Ærlig Øst Å")).toBe("aerlig-oest-aa");
  });

  test("falls back rather than producing an empty name", () => {
    const doc = everyBlockDoc("da");
    doc.meta.title = "";
    doc.meta.date = undefined;
    expect(docxFilename(doc)).toBe("nyhedsbrev.docx");
  });

  test("the print title is what the browser suggests as the PDF filename", () => {
    expect(printTitle(everyBlockDoc("da"))).toBe("Klubmøde august — Ishøj Lærerkreds");
  });
});
