import { ops, PDF, type PDFPage, PdfString } from "@libpdf/core";
import { type FaceKey, faceId } from "./fonts";
import type { CornerRadii, PaintedPage, Primitive, RGB } from "./paint";
import type { PathOp } from "./svg-path";

/**
 * The painter's other half: primitives to PDF operators.
 *
 * Everything positional was decided by the browser and settled in
 * `src/lib/export/paint.ts`, so nothing here measures, wraps, breaks or
 * paginates. It sets a colour, moves to a point, and shows a string.
 *
 * The typed drawing API is bypassed for text because `DrawTextOptions` has no
 * character spacing, and eight rules in `document.css` set `letter-spacing`.
 * A letter-spaced label drawn without `Tc` is drawn too narrow, and the error
 * compounds across the line.
 */

/** Bézier circle constant: where a quarter-arc's control points sit. */
const KAPPA = 0.5523;

export interface EmbeddedFace {
  face: FaceKey;
  bytes: Uint8Array;
}

export class UnembeddableTextError extends Error {
  constructor(readonly characters: string[]) {
    super(
      `No embedded face has a glyph for ${characters
        .map(
          (char) =>
            `"${char}" (U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")})`,
        )
        .join(", ")}. ` +
        "The browser drew it from a system fallback, which the export cannot embed.",
    );
    this.name = "UnembeddableTextError";
  }
}

export interface WriteOptions {
  pages: readonly PaintedPage[];
  faces: readonly EmbeddedFace[];
  title: string;
  author?: string;
  /** ISO-639 code for `/Lang`, so a reader announces the document correctly. */
  language: string;
}

export async function writePdf(options: WriteOptions): Promise<Blob> {
  const pdf = PDF.create();

  pdf.setTitle(options.title);
  if (options.author) pdf.setAuthor(options.author);
  pdf.setCreator("Nyhedsbrevsgenerator");
  pdf.setProducer("Nyhedsbrevsgenerator");
  pdf.setLanguage(options.language);

  const fonts = new Map(
    options.faces.map((entry) => [faceId(entry.face), pdf.embedFont(entry.bytes)] as const),
  );

  const missing = new Set<string>();

  for (const painted of options.pages) {
    const page = pdf.addPage({ width: painted.width, height: painted.height });
    const names = new Map<string, string>();

    for (const primitive of painted.primitives) {
      if (primitive.kind === "rect") {
        drawRect(page, primitive);
        continue;
      }
      if (primitive.kind === "path") {
        drawPath(page, primitive.ops, primitive.fill);
        continue;
      }
      if (primitive.kind === "link") {
        page.addLinkAnnotation({
          rect: {
            x: primitive.x,
            y: primitive.y,
            width: primitive.width,
            height: primitive.height,
          },
          uri: primitive.uri,
          borderWidth: 0,
        });
        continue;
      }

      const id = faceId(primitive.face);
      const font = fonts.get(id);
      if (!font) throw new Error(`The painter asked for face ${id}, which was never loaded`);

      const unencodable = [...primitive.text].filter((char) => !font.canEncode(char));
      if (unencodable.length > 0) {
        for (const char of unencodable) missing.add(char);
        continue;
      }

      let name = names.get(id);
      if (name === undefined) {
        name = page.registerFont(font);
        names.set(id, name);
      }
      drawText(page, primitive, font.encodeTextToGids(primitive.text), name);
    }
  }

  if (missing.size > 0) throw new UnembeddableTextError([...missing]);

  // Subsetting is why 14 faces of 37 KB each do not become a 500 KB download:
  // only the glyphs actually shown are written out.
  const bytes = await pdf.save({ subsetFonts: true });
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

/** Identity-H: the content stream carries two bytes of glyph id per character. */
function encodeGids(gids: readonly number[]): PdfString {
  const bytes = new Uint8Array(gids.length * 2);
  for (let index = 0; index < gids.length; index += 1) {
    const gid = gids[index] as number;
    bytes[index * 2] = (gid >> 8) & 0xff;
    bytes[index * 2 + 1] = gid & 0xff;
  }
  return PdfString.fromBytes(bytes);
}

function drawText(
  page: PDFPage,
  primitive: Extract<Primitive, { kind: "text" }>,
  gids: number[],
  name: string,
): void {
  const operators = [
    ops.pushGraphicsState(),
    ops.setNonStrokingRGB(primitive.color.r, primitive.color.g, primitive.color.b),
    ops.beginText(),
    ops.setFont(`/${name}`, primitive.size),
  ];
  // `Tc` persists in the text object, so it is only emitted when it is not zero
  // and the object is closed immediately after.
  if (primitive.charSpacing !== 0) operators.push(ops.setCharSpacing(primitive.charSpacing));
  operators.push(
    ops.setTextMatrix(1, 0, 0, 1, primitive.x, primitive.y),
    ops.showText(encodeGids(gids)),
    ops.endText(),
    ops.popGraphicsState(),
  );
  page.drawOperators(operators);
}

function drawRect(page: PDFPage, primitive: Extract<Primitive, { kind: "rect" }>): void {
  if (primitive.width <= 0 || primitive.height <= 0) return;

  const operators = [
    ops.pushGraphicsState(),
    ops.setNonStrokingRGB(primitive.fill.r, primitive.fill.g, primitive.fill.b),
  ];

  const [tl, tr, br, bl] = primitive.radii;
  if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
    operators.push(ops.rectangle(primitive.x, primitive.y, primitive.width, primitive.height));
  } else {
    operators.push(
      ...roundedRect(primitive.x, primitive.y, primitive.width, primitive.height, primitive.radii),
    );
  }

  operators.push(ops.fill(), ops.popGraphicsState());
  page.drawOperators(operators);
}

/**
 * A rounded rectangle as four quarter-arcs.
 *
 * Radii are clamped the way CSS clamps them, so a `border-radius: 50%` chip
 * becomes a circle rather than a shape whose corners overlap.
 */
function roundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radii: CornerRadii,
): ReturnType<typeof ops.moveTo>[] {
  const limit = Math.min(width, height) / 2;
  const [tl, tr, br, bl] = radii.map((radius) => Math.min(radius, limit)) as CornerRadii;
  const right = x + width;
  const top = y + height;

  return [
    ops.moveTo(x + tl, top),
    ops.lineTo(right - tr, top),
    ops.curveTo(right - tr + tr * KAPPA, top, right, top - tr + tr * KAPPA, right, top - tr),
    ops.lineTo(right, y + br),
    ops.curveTo(right, y + br - br * KAPPA, right - br + br * KAPPA, y, right - br, y),
    ops.lineTo(x + bl, y),
    ops.curveTo(x + bl - bl * KAPPA, y, x, y + bl - bl * KAPPA, x, y + bl),
    ops.lineTo(x, top - tl),
    ops.curveTo(x, top - tl + tl * KAPPA, x + tl - tl * KAPPA, top, x + tl, top),
    ops.closePath(),
  ];
}

function drawPath(page: PDFPage, path: readonly PathOp[], fill: RGB): void {
  if (path.length === 0) return;
  const operators = [ops.pushGraphicsState(), ops.setNonStrokingRGB(fill.r, fill.g, fill.b)];
  for (const op of path) {
    if (op.op === "move") operators.push(ops.moveTo(op.x, op.y));
    else if (op.op === "line") operators.push(ops.lineTo(op.x, op.y));
    else if (op.op === "curve") operators.push(ops.curveTo(op.x1, op.y1, op.x2, op.y2, op.x, op.y));
    else operators.push(ops.closePath());
  }
  // Non-zero winding, which is SVG's default fill rule and what the brand mark's
  // counters — the holes in the roundel — are drawn for.
  operators.push(ops.fill(), ops.popGraphicsState());
  page.drawOperators(operators);
}
