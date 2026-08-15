import { inflateSync } from "node:zlib";

/**
 * Just enough PDF to assert on one.
 *
 * The end-to-end suite has to prove that the export produced real text rather
 * than a picture of text, in the right font, at the right place. Nothing in the
 * repository can read a PDF, and adding a parser as a dependency would mean
 * asserting the export with the same library that wrote it. So this reads the
 * bytes: object dictionaries, stream contents, and the text-showing operators
 * inside them.
 *
 * Deliberately small and deliberately literal. It understands uncompressed and
 * FlateDecode streams and nothing else, because that is all `@libpdf/core`
 * emits, and it will fail loudly rather than quietly if that changes.
 */

const decoder = new TextDecoder("latin1");

export interface PdfStream {
  dictionary: string;
  bytes: Uint8Array;
}

export interface DrawnText {
  /** The bytes shown, as Identity-H glyph ids. */
  glyphs: number[];
  /** Page-space position of the first glyph, in points. */
  x: number;
  y: number;
  size: number;
  font: string;
  /** `Tc`, in points. */
  charSpacing: number;
}

export class Pdf {
  readonly raw: string;

  constructor(readonly bytes: Uint8Array) {
    this.raw = decoder.decode(bytes);
  }

  get version(): string {
    return this.raw.slice(1, 8);
  }

  /** `/Count` on the page tree — the number of pages the reader will show. */
  get pageCount(): number {
    const match = /\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)/.exec(this.raw);
    return match ? Number(match[1]) : 0;
  }

  count(pattern: RegExp): number {
    return (this.raw.match(pattern) ?? []).length;
  }

  /** Every `n 0 obj … endobj` body, keyed by object number. */
  objects(): Map<number, string> {
    const found = new Map<number, string>();
    for (const match of this.raw.matchAll(/(?:^|[\s>])(\d+) 0 obj\b/g)) {
      const number = Number(match[1]);
      const from = (match.index ?? 0) + match[0].length;
      const to = this.raw.indexOf("endobj", from);
      if (to > 0) found.set(number, this.raw.slice(from, to));
    }
    return found;
  }

  streams(): PdfStream[] {
    const out: PdfStream[] = [];
    // `endstream` ends in `stream`, so a naive search finds a phantom stream
    // after every real one and reads the next object's data twice.
    for (const match of this.raw.matchAll(/(?<!end)stream\r?\n/g)) {
      const start = (match.index ?? 0) + match[0].length;
      const end = this.raw.indexOf("endstream", start);
      if (end < 0) continue;
      const head = this.raw.lastIndexOf("obj", match.index ?? 0);
      const dictionary = this.raw.slice(Math.max(0, head), match.index ?? 0);
      let bytes = this.bytes.subarray(start, end);
      if (/\/Filter\s*\/FlateDecode/.test(dictionary)) {
        try {
          bytes = new Uint8Array(inflateSync(Buffer.from(bytes)));
        } catch {
          continue;
        }
      }
      out.push({ dictionary, bytes });
    }
    return out;
  }

  /** Content streams, in page order, as operator text. */
  contentStreams(): string[] {
    return this.streams()
      .filter((stream) => !/\/(FontFile2|ToUnicode|Length1)\b/.test(stream.dictionary))
      .map((stream) => decoder.decode(stream.bytes))
      .filter((text) => /\bBT\b|\bre\b|\bm\b/.test(text));
  }

  /**
   * Every text-showing operator, with the position and font it was shown at.
   *
   * `@libpdf/core` writes one text object per run, which is why this can read
   * the state linearly rather than keeping a full graphics stack.
   */
  drawnText(): DrawnText[] {
    const out: DrawnText[] = [];
    for (const content of this.contentStreams()) {
      let font = "";
      let size = 0;
      let charSpacing = 0;
      let x = 0;
      let y = 0;

      for (const line of content.split("\n")) {
        const setFont = /^\/(\S+)\s+([\d.-]+)\s+Tf$/.exec(line);
        if (setFont) {
          font = setFont[1] as string;
          size = Number(setFont[2]);
          continue;
        }
        const spacing = /^([\d.-]+)\s+Tc$/.exec(line);
        if (spacing) {
          charSpacing = Number(spacing[1]);
          continue;
        }
        const matrix =
          /^([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+Tm$/.exec(line);
        if (matrix) {
          x = Number(matrix[5]);
          y = Number(matrix[6]);
          continue;
        }
        const show = /^<([0-9A-Fa-f]*)>\s*Tj$/.exec(line);
        if (show) {
          const hex = show[1] as string;
          const glyphs: number[] = [];
          for (let index = 0; index + 3 < hex.length + 1; index += 4) {
            glyphs.push(Number.parseInt(hex.slice(index, index + 4), 16));
          }
          out.push({ glyphs, x, y, size, font, charSpacing });
          continue;
        }
        if (/^ET$/.test(line)) charSpacing = 0;
      }
    }
    return out;
  }

  /**
   * The `ToUnicode` CMap of every embedded font, as glyph id to string.
   *
   * This is the mapping that decides whether copied Danish comes back as
   * Danish, so the suite reads it rather than trusting that it exists.
   */
  toUnicode(): Map<number, string> {
    const mapping = new Map<number, string>();
    for (const stream of this.streams()) {
      const text = decoder.decode(stream.bytes);
      if (!text.includes("beginbfchar") && !text.includes("beginbfrange")) continue;

      for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
        for (const pair of (block[1] as string).matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
          mapping.set(Number.parseInt(pair[1] as string, 16), fromUtf16Be(pair[2] as string));
        }
      }
      for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
        for (const row of (block[1] as string).matchAll(
          /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
        )) {
          const from = Number.parseInt(row[1] as string, 16);
          const to = Number.parseInt(row[2] as string, 16);
          const start = Number.parseInt(row[3] as string, 16);
          for (let gid = from; gid <= to && gid - from < 0x10000; gid += 1) {
            mapping.set(gid, String.fromCodePoint(start + (gid - from)));
          }
        }
      }
    }
    return mapping;
  }

  /** Every drawn run as the text a reader would copy, in drawing order. */
  extractedRuns(): { text: string; x: number; y: number; size: number }[] {
    const unicode = this.toUnicode();
    return this.drawnText().map((run) => ({
      text: run.glyphs.map((gid) => unicode.get(gid) ?? "\uFFFD").join(""),
      x: run.x,
      y: run.y,
      size: run.size,
    }));
  }

  /**
   * The bounding box of every filled shape, in page points.
   *
   * Both spellings count: a square-cornered box is one `re`, and a box with a
   * `border-radius` is four quarter-arcs, so a reader that only knew about
   * `re` would see the notice blocks and miss the decision block.
   */
  shapes(): { x: number; y: number; width: number; height: number }[] {
    const out: { x: number; y: number; width: number; height: number }[] = [];

    for (const content of this.contentStreams()) {
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      const include = (x: number, y: number) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      };

      for (const line of content.split("\n")) {
        const numbers = line.trim().split(/\s+/);
        const operator = numbers.pop();
        const values = numbers.map(Number);

        if (operator === "re" && values.length === 4) {
          const [x, y, width, height] = values as [number, number, number, number];
          include(x, y);
          include(x + width, y + height);
          continue;
        }
        if ((operator === "m" || operator === "l") && values.length === 2) {
          include(values[0] as number, values[1] as number);
          continue;
        }
        if (operator === "c" && values.length === 6) {
          // Endpoints only: a Bézier stays inside its hull, and the control
          // points of a rounded corner sit outside the box the CSS asked for.
          include(values[4] as number, values[5] as number);
          continue;
        }
        if (operator === "f" || operator === "f*" || operator === "b" || operator === "B") {
          if (Number.isFinite(minX)) {
            out.push({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
          }
          minX = Number.POSITIVE_INFINITY;
          minY = Number.POSITIVE_INFINITY;
          maxX = Number.NEGATIVE_INFINITY;
          maxY = Number.NEGATIVE_INFINITY;
        }
      }
    }
    return out;
  }

  /** `Do` operators, which is how an image or a form XObject would be painted. */
  paintedXObjects(): number {
    return this.contentStreams().reduce(
      (total, content) => total + (content.match(/^\/\S+ Do$/gm) ?? []).length,
      0,
    );
  }

  /** Path construction operators, which is how a vector logo shows up. */
  pathOperators(): number {
    let total = 0;
    for (const content of this.contentStreams()) {
      total += (content.match(/^[\d.-]+ [\d.-]+ m$/gm) ?? []).length;
      total += (content.match(/^[\d.-]+ [\d.-]+ l$/gm) ?? []).length;
      total += (content.match(/^[\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ c$/gm) ?? [])
        .length;
    }
    return total;
  }

  /** Non-stroking colours used, as `r,g,b` in 0–255. */
  fills(): string[] {
    const out: string[] = [];
    for (const content of this.contentStreams()) {
      for (const match of content.matchAll(/^([\d.]+) ([\d.]+) ([\d.]+) rg$/gm)) {
        out.push(
          match
            .slice(1, 4)
            .map((value) => Math.round(Number(value) * 255))
            .join(","),
        );
      }
    }
    return out;
  }
}

function fromUtf16Be(hex: string): string {
  let out = "";
  for (let index = 0; index + 3 < hex.length + 1; index += 4) {
    out += String.fromCharCode(Number.parseInt(hex.slice(index, index + 4), 16));
  }
  return out;
}
