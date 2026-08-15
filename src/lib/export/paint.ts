import {
  type FaceKey,
  type FontFamilyKey,
  type FontStyleKey,
  type FontSubsetKey,
  faceId,
  resolveFace,
  subsetForCodePoint,
} from "./fonts";
import {
  collectPaths,
  type PathOp,
  parsePathData,
  placePath,
  readViewBox,
  UnsupportedSvgError,
} from "./svg-path";

/**
 * The painter — the half of the export that reads.
 *
 * The document has already been typeset by the browser and paginated by
 * Paged.js by the time anyone can click Export. Every line break, every
 * hyphenation decision, every page break and every box position exists as real
 * geometry on the stage. So this file solves none of those problems; it
 * transcribes their answers into a flat, ordered list of primitives that
 * `src/lib/export/pdf.ts` hands to the writer.
 *
 * Keeping reading and writing apart is what makes the reading testable against
 * a DOM without producing a PDF, and it is what keeps "the export matches the
 * preview" a property of the design rather than a suite of tolerances.
 *
 * A general HTML-to-PDF converter has to handle all of CSS. This one handles
 * exactly what `document.css`, `paged.css` and `src/lib/render/html.ts` can
 * produce, which is a closed list this repository controls.
 */

/** 96 CSS pixels to the inch, 72 PDF points to the inch. */
export const PX_TO_PT = 0.75;

/**
 * Parks a scratch element out of the way.
 *
 * Property by property rather than through `cssText`: the Content Security
 * Policy carries style hashes, which makes browsers ignore `'unsafe-inline'`
 * in the same directive, and Chromium reports a violation for a bulk
 * `cssText` assignment. Individual property assignments are not inline styles
 * and pass silently.
 */
function hide(element: HTMLElement): void {
  element.style.position = "absolute";
  element.style.left = "0";
  element.style.top = "0";
  element.style.width = "0";
  element.style.height = "0";
  element.style.overflow = "hidden";
  element.style.opacity = "0";
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Top-left, top-right, bottom-right, bottom-left, in points. */
export type CornerRadii = [number, number, number, number];

export type Primitive =
  | {
      kind: "text";
      /** Left edge of the run, in points from the page's left. */
      x: number;
      /** Baseline, in points from the page's bottom. */
      y: number;
      text: string;
      face: FaceKey;
      size: number;
      color: RGB;
      /** PDF `Tc`, in points. Matches CSS `letter-spacing`, last glyph included. */
      charSpacing: number;
    }
  | {
      kind: "rect";
      /** Lower-left corner, in points from the page's left and bottom. */
      x: number;
      y: number;
      width: number;
      height: number;
      radii: CornerRadii;
      fill: RGB;
    }
  | { kind: "path"; ops: PathOp[]; fill: RGB }
  | { kind: "link"; x: number; y: number; width: number; height: number; uri: string };

export interface PaintedPage {
  /** Points. A4 portrait is 595.28 × 841.89. */
  width: number;
  height: number;
  primitives: Primitive[];
}

export interface PaintResult {
  pages: PaintedPage[];
  /** Every face the pages actually use, so only those are fetched. */
  faces: FaceKey[];
  /**
   * Characters no declared `@font-face` covers, which therefore came from a
   * system fallback on screen and cannot be embedded. Reported rather than
   * silently drawn as `.notdef`.
   */
  uncovered: string[];
}

export interface PaintOptions {
  /**
   * Fetches an SVG referenced by an `<img>`. Injected so the painter never
   * reaches the network on its own and can be exercised without one.
   */
  loadSvg: (src: string) => Promise<string>;
  /** Validates a link destination. `safeHref` from the renderer is the caller. */
  safeHref: (href: string) => string | undefined;
}

/* ---------- colour ---------- */

const TRANSPARENT: RGB & { a: number } = { r: 0, g: 0, b: 0, a: 0 };

/**
 * Parses the `rgb()` / `rgba()` form every engine returns from
 * `getComputedStyle`. Colour keywords and hex never appear in computed values.
 */
export function parseColor(value: string): RGB & { a: number } {
  const match = /^rgba?\(([^)]+)\)$/.exec(value.trim());
  if (!match) return TRANSPARENT;
  const parts = (match[1] as string).split(/[\s,/]+/).filter((part) => part.length > 0);
  const [r, g, b, a] = parts.map(Number);
  if (r === undefined || g === undefined || b === undefined) return TRANSPARENT;
  return { r: r / 255, g: g / 255, b: b / 255, a: a === undefined ? 1 : a };
}

function opaque(colour: RGB & { a: number }): boolean {
  return colour.a > 0.01;
}

function rgb(colour: RGB & { a: number }): RGB {
  return { r: colour.r, g: colour.g, b: colour.b };
}

/* ---------- geometry ---------- */

const px = (value: string): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * A resolved `border-radius` corner in points.
 *
 * Percentages stay percentages in the computed value, so `50%` on the agenda
 * chip has to be resolved against the box it rounds.
 */
function corner(value: string, extent: number): number {
  // Only the first component is read: no rule in this document uses elliptical
  // corners, and one that did would need a second radius in the primitive.
  const first = value.trim().split(/\s+/)[0] ?? "0";
  const size = first.endsWith("%") ? (Number.parseFloat(first) / 100) * extent : px(first);
  return Math.max(0, size * PX_TO_PT);
}

/* ---------- per-page bookkeeping ---------- */

interface PageContext {
  /** 1-based, so `counter(page)` resolves without arithmetic at the call site. */
  number: number;
  total: number;
  left: number;
  top: number;
  heightPt: number;
  primitives: Primitive[];
  faces: Map<string, FaceKey>;
  uncovered: Set<string>;
  vectors: Map<string, LoadedVector>;
  measure: Measurer;
  options: PaintOptions;
}

const toX = (ctx: PageContext, clientX: number): number => (clientX - ctx.left) * PX_TO_PT;
const toY = (ctx: PageContext, clientY: number): number =>
  ctx.heightPt - (clientY - ctx.top) * PX_TO_PT;

/* ---------- font metrics measured in the browser ---------- */

interface TextStyle {
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
}

/**
 * Baseline placement and text widths, measured rather than derived.
 *
 * The obvious formula — half-leading from the font's ascender and descender —
 * is engine-dependent in practice. For the same 14 px line at line-height 1.55,
 * the distance from a `Range` rect's top to the baseline measures 14.000 in
 * Chromium, 15.000 in Firefox and 14.327 in WebKit, because each engine derives
 * the rect from a different metric. Every one of those is "correct"; none of
 * them is a constant this file could hard-code.
 *
 * So the distance is measured once per distinct text style, using a zero-sized
 * inline-block aligned to the baseline — which sits exactly on it, by
 * definition — and then applied to every line drawn in that style.
 */
class Measurer {
  private readonly host: HTMLElement;
  private readonly baselines = new Map<string, number>();

  constructor(stage: HTMLElement) {
    this.host = stage.ownerDocument.createElement("div");
    this.host.setAttribute("aria-hidden", "true");
    // Out of flow and unpainted, but laid out: `visibility: hidden` would empty
    // the client rects this exists to read.
    hide(this.host);
    stage.appendChild(this.host);
  }

  dispose(): void {
    this.host.remove();
  }

  private probe(style: TextStyle): HTMLElement {
    const element = this.host.ownerDocument.createElement("div");
    element.style.position = "absolute";
    element.style.whiteSpace = "pre";
    element.style.margin = "0";
    element.style.padding = "0";
    element.style.fontFamily = style.fontFamily;
    element.style.fontWeight = style.fontWeight;
    element.style.fontStyle = style.fontStyle;
    element.style.fontSize = style.fontSize;
    element.style.lineHeight = style.lineHeight;
    element.style.letterSpacing = style.letterSpacing;
    element.style.fontKerning = "none";
    element.style.fontVariantLigatures = "none";
    return element;
  }

  /** Distance in CSS pixels from a line's `Range` rect top down to its baseline. */
  baselineOffset(style: TextStyle): number {
    const key = styleKey(style);
    const cached = this.baselines.get(key);
    if (cached !== undefined) return cached;

    const element = this.probe(style);
    const marker = element.ownerDocument.createElement("span");
    // A zero-sized inline-block aligned to the baseline sits exactly on it.
    marker.style.display = "inline-block";
    marker.style.width = "0";
    marker.style.height = "0";
    marker.style.verticalAlign = "baseline";
    element.appendChild(marker);
    const text = element.ownerDocument.createTextNode("Hxgq");
    element.appendChild(text);
    this.host.appendChild(element);

    const range = element.ownerDocument.createRange();
    range.selectNodeContents(text);
    const rect = range.getClientRects()[0];
    const offset = rect ? marker.getBoundingClientRect().top - rect.top : 0;

    element.remove();
    this.baselines.set(key, offset);
    return offset;
  }

  /** Rendered width in CSS pixels, for placing text that has no node to range. */
  width(style: TextStyle, text: string): number {
    if (text.length === 0) return 0;
    const element = this.probe(style);
    element.textContent = text;
    this.host.appendChild(element);
    const width = element.getBoundingClientRect().width;
    element.remove();
    return width;
  }
}

function styleKey(style: TextStyle): string {
  return [
    style.fontFamily,
    style.fontWeight,
    style.fontStyle,
    style.fontSize,
    style.lineHeight,
    style.letterSpacing,
  ].join("|");
}

function textStyleOf(style: CSSStyleDeclaration): TextStyle {
  return {
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
  };
}

/* ---------- vector images ---------- */

interface LoadedVector {
  minX: number;
  minY: number;
  width: number;
  height: number;
  paths: { ops: PathOp[]; fill: RGB }[];
}

/**
 * Parses an SVG and reads a fill for each path.
 *
 * Two constraints shape this. The fills have to come from `getComputedStyle`,
 * because the brand mark carries its colour in a `<style>` rule on a class
 * rather than in a `fill` attribute, and only the cascade resolves that — which
 * means the subtree has to be attached and laid out. And the `<style>` element
 * itself cannot simply be attached: Astro emits one inline `<style>` of its own
 * for island hydration, so the generated Content Security Policy always carries
 * a style hash, which makes browsers ignore the `'unsafe-inline'` beside it.
 * An injected `<style>` is refused and every path reads back as black.
 *
 * So the rules are lifted out of the markup before it is ever parsed — parsing
 * alone is enough to trip the report — and applied as a constructable
 * stylesheet, which the CSSOM applies without CSP involvement. Both go into a
 * shadow root, which scopes a `fill` rule on a generic class name to the
 * subtree that needs it rather than adopting it document-wide. This is the same
 * CSSOM route `paginate` already takes for the Paged.js polisher.
 */
const STYLE_ELEMENT = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;

async function loadVector(
  stage: HTMLElement,
  source: string,
  load: (src: string) => Promise<string>,
): Promise<LoadedVector> {
  const markup = await load(source);

  const rules: string[] = [];
  const stripped = markup.replace(STYLE_ELEMENT, (_, body: string) => {
    rules.push(body);
    return "";
  });

  const parsed = new DOMParser().parseFromString(stripped, "image/svg+xml");
  if (parsed.querySelector("parsererror")) {
    throw new UnsupportedSvgError(`${source} is not parseable SVG`);
  }

  const root = stage.ownerDocument.importNode(parsed.documentElement, true) as unknown as Element;
  // Anything the text pass missed — a CDATA-wrapped rule, say — is lifted from
  // the tree instead, so a fill is never lost to the strip.
  for (const style of [...root.querySelectorAll("style")]) {
    rules.push(style.textContent ?? "");
    style.remove();
  }

  const host = stage.ownerDocument.createElement("div");
  host.setAttribute("aria-hidden", "true");
  hide(host);
  stage.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.adoptedStyleSheets = rules.map((text) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    return sheet;
  });
  shadow.appendChild(root);

  try {
    const box = readViewBox(root);
    const paths = collectPaths(root).map((path) => {
      const data = path.getAttribute("d");
      if (!data) throw new UnsupportedSvgError(`${source} has a <path> with no d attribute`);
      const fill = parseColor(getComputedStyle(path).fill);
      return { ops: parsePathData(data), fill: rgb(fill) };
    });
    return { ...box, paths };
  } finally {
    host.remove();
  }
}

/* ---------- generated content ---------- */

/**
 * Resolves a computed `content` value to the string the browser drew.
 *
 * `var()` is already substituted by the time the value is computed, so the
 * running footer's text arrives as a quoted string. Counters are not: the
 * computed value still says `counter(page)`, and the resolved number is
 * unreachable from the CSSOM. Both counters in play are facts the caller
 * already knows, so they are supplied rather than read.
 */
export function resolveContent(value: string, page: number, total: number): string {
  if (value === "none" || value === "normal" || value === "") return "";

  let out = "";
  let index = 0;
  while (index < value.length) {
    const char = value[index] as string;

    if (char === '"' || char === "'") {
      const quote = char;
      index += 1;
      while (index < value.length && value[index] !== quote) {
        if (value[index] === "\\") {
          // A CSS escape in a content string is either a literal or a hex
          // code point; both appear in Paged.js output for punctuation.
          const hex = /^\\([0-9a-fA-F]{1,6})\s?/.exec(value.slice(index));
          if (hex) {
            out += String.fromCodePoint(Number.parseInt(hex[1] as string, 16));
            index += (hex[0] as string).length;
            continue;
          }
          out += value[index + 1] ?? "";
          index += 2;
          continue;
        }
        out += value[index];
        index += 1;
      }
      index += 1;
      continue;
    }

    const counter = /^counters?\(\s*([a-zA-Z-]+)[^)]*\)/.exec(value.slice(index));
    if (counter) {
      const name = counter[1] as string;
      if (name === "page") out += String(page);
      else if (name === "pages") out += String(total);
      index += (counter[0] as string).length;
      continue;
    }

    // Anything else — `attr()`, `open-quote`, an image — draws nothing here.
    const other = /^[a-zA-Z-]+\([^)]*\)|^[a-zA-Z-]+/.exec(value.slice(index));
    index += other ? (other[0] as string).length : 1;
  }
  return out;
}

/* ---------- line splitting ---------- */

interface RenderedLine {
  start: number;
  end: number;
  rect: DOMRect;
}

/** Rects on the same line, within half a pixel, are one line box. */
function groupLines(rects: DOMRect[]): DOMRect[] {
  const lines: DOMRect[] = [];
  for (const rect of rects) {
    if (rect.width === 0 && rect.height === 0) continue;
    const previous = lines.at(-1);
    if (previous && Math.abs(previous.top - rect.top) < 0.5) {
      // One line, reported in fragments: widen the first rather than add a line.
      const left = Math.min(previous.left, rect.left);
      const right = Math.max(previous.right, rect.right);
      lines[lines.length - 1] = new DOMRect(left, previous.top, right - left, previous.height);
      continue;
    }
    lines.push(rect);
  }
  return lines;
}

/**
 * Splits a text node into the lines the browser actually laid out.
 *
 * The offsets come from a binary search over the range length rather than a
 * per-character walk: each probe is one `getClientRects()` call, so a paragraph
 * costs a few dozen measurements instead of one per character.
 */
export function splitIntoLines(node: Text): RenderedLine[] {
  const document = node.ownerDocument;
  const range = document.createRange();
  range.selectNodeContents(node);
  const lines = groupLines([...range.getClientRects()]);
  if (lines.length === 0) return [];

  const length = node.data.length;
  const countTo = (offset: number): number => {
    range.setStart(node, 0);
    range.setEnd(node, offset);
    return groupLines([...range.getClientRects()]).length;
  };

  const starts = [0];
  for (let line = 1; line < lines.length; line += 1) {
    // The smallest offset whose range already spans `line + 1` line boxes has
    // just taken in the first character of this line.
    let low = starts[line - 1] as number;
    let high = length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (countTo(middle) >= line + 1) high = middle;
      else low = middle + 1;
    }
    starts.push(Math.max(0, low - 1));
  }

  return lines.map((rect, index) => ({
    start: starts[index] as number,
    end: index + 1 < starts.length ? (starts[index + 1] as number) : length,
    rect,
  }));
}

/* ---------- text ---------- */

function familyOf(fontFamily: string): FontFamilyKey {
  return /source serif/i.test(fontFamily) ? "serif" : "sans";
}

function styleOf(fontStyle: string): FontStyleKey {
  return fontStyle === "normal" ? "normal" : "italic";
}

/**
 * `text-transform`, applied after the line has been sliced.
 *
 * Four rules in `document.css` uppercase their text, so the line rects are
 * uppercase-sized while `textNode.data` still holds the original case. Drawing
 * the raw string puts the right box around the wrong glyphs. The locale matters
 * less in Danish than in Turkish, but the browser used one and so does this.
 */
export function applyTextTransform(text: string, mode: string, lang: string): string {
  if (mode === "uppercase") return text.toLocaleUpperCase(lang);
  if (mode === "lowercase") return text.toLocaleLowerCase(lang);
  if (mode === "capitalize") {
    return text.replace(
      /(^|\s)(\S)/gu,
      (_, space: string, first: string) => space + first.toLocaleUpperCase(lang),
    );
  }
  return text;
}

/**
 * Whether the browser drew a hyphen the DOM does not contain.
 *
 * `.nl-doc` sets `hyphens: auto` and every engine ships Danish patterns, so
 * `arbejdstidsaftale` breaks mid-word and the rendered line ends in a hyphen
 * that appears in no text node. `.nl-doc a` also breaks mid-token, through
 * `overflow-wrap: anywhere`, and gets no hyphen — which is the case this has to
 * tell apart.
 */
/**
 * The character a hyphenation break draws, read from the cascade.
 *
 * `document.css` sets it to U+002D because U+2010, the CSS default, is missing
 * from the Latin subsets these families ship. Reading it back rather than
 * repeating it means the stylesheet stays the single source of truth.
 */
function hyphenCharacter(style: CSSStyleDeclaration): string {
  const declared = style.getPropertyValue("hyphenate-character");
  if (!declared || declared === "auto") return "\u2010";
  const resolved = resolveContent(declared, 0, 0);
  return resolved.length > 0 ? resolved : "\u2010";
}

export interface BreakBehaviour {
  hyphens: string;
  overflowWrap: string;
  wordBreak: string;
}

export function hyphenatesAt(data: string, breakAt: number, style: BreakBehaviour): boolean {
  if (style.hyphens !== "auto") return false;
  const before = data[breakAt - 1];
  const after = data[breakAt];
  if (!before || !after) return false;
  if (!/\p{L}/u.test(before) || !/\p{L}/u.test(after)) return false;
  const anywhere =
    /anywhere|break-word/.test(style.overflowWrap) || /break-all|break-word/.test(style.wordBreak);
  return !anywhere;
}

/** Splits a drawn line into runs, one per `@font-face` subset the browser used. */
export function subsetRuns(text: string): { text: string; subset: FontSubsetKey | undefined }[] {
  const runs: { text: string; subset: FontSubsetKey | undefined }[] = [];
  for (const char of text) {
    const subset = subsetForCodePoint(char.codePointAt(0) as number);
    const last = runs.at(-1);
    if (last && last.subset === subset) last.text += char;
    else runs.push({ text: char, subset });
  }
  return runs;
}

function recordFace(ctx: PageContext, face: FaceKey): FaceKey {
  const id = faceId(face);
  const known = ctx.faces.get(id);
  if (known) return known;
  ctx.faces.set(id, face);
  return face;
}

function paintTextNode(node: Text, parent: Element, style: CSSStyleDeclaration, ctx: PageContext) {
  if (node.data.trim().length === 0) return;

  const lines = splitIntoLines(node);
  if (lines.length === 0) return;

  const size = px(style.fontSize) * PX_TO_PT;
  const colour = parseColor(style.color);
  if (!opaque(colour) || size <= 0) return;

  const family = familyOf(style.fontFamily);
  const weight = Number.parseInt(style.fontWeight, 10) || 400;
  const slant = styleOf(style.fontStyle);
  const letterSpacing = style.letterSpacing === "normal" ? 0 : px(style.letterSpacing) * PX_TO_PT;
  const baselineOffset = ctx.measure.baselineOffset(textStyleOf(style));
  const language = (parent.closest("[lang]") as HTMLElement | null)?.lang || "da";

  const document = node.ownerDocument;
  const range = document.createRange();

  lines.forEach((line, index) => {
    const raw = node.data.slice(line.start, line.end);
    const trimmed = raw.replace(/\s+$/, "");
    if (trimmed.length === 0) return;

    const isLast = index === lines.length - 1;
    const suffix =
      !isLast && hyphenatesAt(node.data, line.end, style) ? hyphenCharacter(style) : "";
    const drawn =
      applyTextTransform(trimmed.replace(/\s+/g, " "), style.textTransform, language) + suffix;
    if (drawn.trim().length === 0) return;

    const baseline = toY(ctx, line.rect.top + baselineOffset);
    const runs = subsetRuns(drawn);

    // The common case: one line, one subset, one operator, positioned at the
    // left edge the browser measured.
    if (runs.length === 1 || drawn.length !== trimmed.length + suffix.length) {
      pushRun(ctx, {
        text: drawn,
        subset: runs[0]?.subset,
        x: toX(ctx, line.rect.left),
        y: baseline,
        family,
        weight,
        slant,
        size,
        colour: rgb(colour),
        charSpacing: letterSpacing,
      });
      return;
    }

    // Mixed subsets: each run is placed where the browser put it, measured
    // through a range over its own offsets rather than computed from widths.
    let offset = line.start;
    for (const run of runs) {
      const from = offset;
      const to = offset + run.text.length;
      offset = to;
      if (run.text.trim().length === 0) continue;
      range.setStart(node, Math.min(from, node.data.length));
      range.setEnd(node, Math.min(to, node.data.length));
      const rect = range.getClientRects()[0];
      pushRun(ctx, {
        text: run.text,
        subset: run.subset,
        x: toX(ctx, rect ? rect.left : line.rect.left),
        y: baseline,
        family,
        weight,
        slant,
        size,
        colour: rgb(colour),
        charSpacing: letterSpacing,
      });
    }
  });

  paintUnderline(style, lines, baselineOffset, ctx);
}

interface Run {
  text: string;
  subset: FontSubsetKey | undefined;
  x: number;
  y: number;
  family: FontFamilyKey;
  weight: number;
  slant: FontStyleKey;
  size: number;
  colour: RGB;
  charSpacing: number;
}

function pushRun(ctx: PageContext, run: Run): void {
  if (run.subset === undefined) {
    for (const char of run.text) {
      if (subsetForCodePoint(char.codePointAt(0) as number) === undefined) ctx.uncovered.add(char);
    }
    return;
  }
  const face = recordFace(ctx, resolveFace(run.family, run.weight, run.slant, run.subset));
  ctx.primitives.push({
    kind: "text",
    x: run.x,
    y: run.y,
    text: run.text,
    face,
    size: run.size,
    color: run.colour,
    charSpacing: run.charSpacing,
  });
}

/**
 * The link underline.
 *
 * Approximated deliberately: `text-underline-offset` positions the line
 * relative to the font's own underline position, which no DOM API exposes, and
 * a rule drawn a tenth of a point off is invisible where a baseline a point off
 * is not. The offset and thickness both come from the stylesheet's computed
 * values, so a change there moves both the preview and the export.
 */
function paintUnderline(
  style: CSSStyleDeclaration,
  lines: RenderedLine[],
  baselineOffset: number,
  ctx: PageContext,
): void {
  if (!style.textDecorationLine.includes("underline")) return;

  const size = px(style.fontSize) * PX_TO_PT;
  const colour = parseColor(style.textDecorationColor || style.color);
  if (!opaque(colour)) return;

  const thickness = Math.max(
    0.4,
    style.textDecorationThickness.endsWith("px")
      ? px(style.textDecorationThickness) * PX_TO_PT
      : size * 0.06,
  );
  const offset = style.textUnderlineOffset.endsWith("px")
    ? px(style.textUnderlineOffset) * PX_TO_PT
    : size * 0.14;

  for (const line of lines) {
    const baseline = toY(ctx, line.rect.top + baselineOffset);
    ctx.primitives.push({
      kind: "rect",
      x: toX(ctx, line.rect.left),
      y: baseline - offset - thickness,
      width: line.rect.width * PX_TO_PT,
      height: thickness,
      radii: [0, 0, 0, 0],
      fill: rgb(colour),
    });
  }
}

/* ---------- boxes ---------- */

function paintBackground(style: CSSStyleDeclaration, rect: DOMRect, ctx: PageContext): void {
  const fill = parseColor(style.backgroundColor);
  if (!opaque(fill)) return;
  ctx.primitives.push({
    kind: "rect",
    x: toX(ctx, rect.left),
    y: toY(ctx, rect.bottom),
    width: rect.width * PX_TO_PT,
    height: rect.height * PX_TO_PT,
    radii: radiiOf(style, rect),
    fill: rgb(fill),
  });
}

function radiiOf(style: CSSStyleDeclaration, rect: DOMRect): CornerRadii {
  return [
    corner(style.borderTopLeftRadius, Math.min(rect.width, rect.height)),
    corner(style.borderTopRightRadius, Math.min(rect.width, rect.height)),
    corner(style.borderBottomRightRadius, Math.min(rect.width, rect.height)),
    corner(style.borderBottomLeftRadius, Math.min(rect.width, rect.height)),
  ];
}

type Side = "Top" | "Right" | "Bottom" | "Left";

/**
 * Borders, one side at a time.
 *
 * No box in this document has two adjacent borders, so there are no mitres to
 * cut. The three styles that do appear each get their own treatment: `solid` is
 * one band, `double` is the three equal bands CSS specifies, and `dotted` is a
 * row of round dots one border-width across. The dotted spacing is a visual
 * decision rather than a specified one — engines differ — and at 0.5 mm it is
 * indistinguishable at 100 %.
 */
function paintBorders(style: CSSStyleDeclaration, rect: DOMRect, ctx: PageContext): void {
  for (const side of ["Top", "Right", "Bottom", "Left"] as Side[]) {
    const width = px(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) * PX_TO_PT;
    const kind = style.getPropertyValue(`border-${side.toLowerCase()}-style`);
    const colour = parseColor(style.getPropertyValue(`border-${side.toLowerCase()}-color`));
    if (width <= 0 || kind === "none" || kind === "hidden" || !opaque(colour)) continue;

    const vertical = side === "Left" || side === "Right";
    const x = side === "Right" ? toX(ctx, rect.right) - width : toX(ctx, rect.left);
    const y = side === "Top" ? toY(ctx, rect.top) - width : toY(ctx, rect.bottom);
    const length = (vertical ? rect.height : rect.width) * PX_TO_PT;

    const band = (from: number, thickness: number) => {
      ctx.primitives.push({
        kind: "rect",
        x: vertical ? x + from : x,
        y: vertical ? y : y + from,
        width: vertical ? thickness : length,
        height: vertical ? length : thickness,
        radii: [0, 0, 0, 0],
        fill: rgb(colour),
      });
    };

    if (kind === "double") {
      const third = width / 3;
      band(0, third);
      band(width - third, third);
      continue;
    }

    if (kind === "dotted") {
      const step = width * 2;
      const radius = width / 2;
      for (let along = 0; along + width <= length + 0.01; along += step) {
        ctx.primitives.push({
          kind: "rect",
          x: vertical ? x : x + along,
          y: vertical ? y + length - along - width : y,
          width,
          height: width,
          radii: [radius, radius, radius, radius],
          fill: rgb(colour),
        });
      }
      continue;
    }

    band(0, width);
  }
}

/* ---------- pseudo-elements ---------- */

function paintPseudo(element: Element, which: "::before" | "::after", ctx: PageContext): void {
  const style = getComputedStyle(element, which);
  if (style.display === "none" || style.content === "none" || style.content === "") return;

  const text = resolveContent(style.content, ctx.number, ctx.total);
  const background = parseColor(style.backgroundColor);
  const box = element.getBoundingClientRect();
  const parentStyle = getComputedStyle(element);

  if (style.position === "absolute") {
    // Placed against the padding box, which is what `left`/`top` resolve
    // against for an absolutely positioned child.
    const left =
      box.left + px(parentStyle.borderLeftWidth) + px(style.left === "auto" ? "0" : style.left);
    const top =
      box.top + px(parentStyle.borderTopWidth) + px(style.top === "auto" ? "0" : style.top);
    const width = px(style.width);
    const height = px(style.height);

    if (opaque(background) && width > 0 && height > 0) {
      const rect = new DOMRect(left, top, width, height);
      ctx.primitives.push({
        kind: "rect",
        x: toX(ctx, left),
        y: toY(ctx, top + height),
        width: width * PX_TO_PT,
        height: height * PX_TO_PT,
        radii: radiiOf(style, rect),
        fill: rgb(background),
      });
    }
    if (text.length > 0) paintPseudoText(style, new DOMRect(left, top, width, height), text, ctx);
    return;
  }

  if (text.length === 0) return;

  /**
   * A static pseudo-element with text: the Paged.js margin boxes, whose
   * `::after` is a block filling the content box of `.pagedjs_margin-content`.
   * There is no node to range, so the line is placed from the container's own
   * box and the text's measured width.
   */
  const content = new DOMRect(
    box.left + px(parentStyle.borderLeftWidth) + px(parentStyle.paddingLeft),
    box.top + px(parentStyle.borderTopWidth) + px(parentStyle.paddingTop),
    box.width -
      px(parentStyle.borderLeftWidth) -
      px(parentStyle.borderRightWidth) -
      px(parentStyle.paddingLeft) -
      px(parentStyle.paddingRight),
    box.height,
  );
  paintPseudoText(style, content, text, ctx);
}

function paintPseudoText(
  style: CSSStyleDeclaration,
  box: DOMRect,
  text: string,
  ctx: PageContext,
): void {
  const size = px(style.fontSize) * PX_TO_PT;
  const colour = parseColor(style.color);
  if (size <= 0 || !opaque(colour)) return;

  const textStyle = textStyleOf(style);
  const width = ctx.measure.width(textStyle, text);
  const align = style.textAlign;
  const alignCentre = align === "center" || style.justifyContent === "center";
  const alignRight = align === "right" || align === "end";
  const left = alignRight
    ? box.right - width
    : alignCentre
      ? box.left + (box.width - width) / 2
      : box.left;

  // A pseudo-element's line box starts at the top of its own box; the baseline
  // sits the measured distance below it, exactly as for a real line.
  const baseline = toY(ctx, box.top + ctx.measure.baselineOffset(textStyle));

  pushRun(ctx, {
    text,
    subset: subsetRuns(text)[0]?.subset,
    x: toX(ctx, left),
    y: baseline,
    family: familyOf(style.fontFamily),
    weight: Number.parseInt(style.fontWeight, 10) || 400,
    slant: styleOf(style.fontStyle),
    size,
    colour: rgb(colour),
    charSpacing: style.letterSpacing === "normal" ? 0 : px(style.letterSpacing) * PX_TO_PT,
  });
}

/* ---------- images and links ---------- */

function paintVector(rect: DOMRect, vector: LoadedVector, ctx: PageContext): void {
  const placement = {
    x: toX(ctx, rect.left),
    y: toY(ctx, rect.top),
    scaleX: (rect.width * PX_TO_PT) / vector.width,
    scaleY: (rect.height * PX_TO_PT) / vector.height,
    minX: vector.minX,
    minY: vector.minY,
  };
  for (const path of vector.paths) {
    ctx.primitives.push({ kind: "path", ops: placePath(path.ops, placement), fill: path.fill });
  }
}

function paintInlineSvg(element: Element, rect: DOMRect, ctx: PageContext): void {
  const box = readViewBox(element);
  const placement = {
    x: toX(ctx, rect.left),
    y: toY(ctx, rect.top),
    scaleX: (rect.width * PX_TO_PT) / box.width,
    scaleY: (rect.height * PX_TO_PT) / box.height,
    minX: box.minX,
    minY: box.minY,
  };
  for (const path of collectPaths(element)) {
    const data = path.getAttribute("d");
    if (!data) continue;
    const fill = parseColor(getComputedStyle(path).fill);
    if (!opaque(fill)) continue;
    ctx.primitives.push({
      kind: "path",
      ops: placePath(parsePathData(data), placement),
      fill: rgb(fill),
    });
  }
}

function paintLink(element: HTMLAnchorElement, ctx: PageContext): void {
  const uri = ctx.options.safeHref(element.getAttribute("href") ?? "");
  if (!uri) return;
  for (const rect of element.getClientRects()) {
    ctx.primitives.push({
      kind: "link",
      x: toX(ctx, rect.left),
      y: toY(ctx, rect.bottom),
      width: rect.width * PX_TO_PT,
      height: rect.height * PX_TO_PT,
      uri,
    });
  }
}

/* ---------- the walk ---------- */

function walk(element: Element, ctx: PageContext): void {
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;

  const rect = element.getBoundingClientRect();
  const tag = element.tagName.toLowerCase();

  if (rect.width > 0 && rect.height > 0) {
    paintBackground(style, rect, ctx);
    paintBorders(style, rect, ctx);
  }

  if (tag === "svg") {
    if (rect.width > 0 && rect.height > 0) paintInlineSvg(element, rect, ctx);
    return;
  }

  if (tag === "img") {
    const source = (element as HTMLImageElement).getAttribute("src") ?? "";
    const vector = ctx.vectors.get(source);
    if (vector && rect.width > 0 && rect.height > 0) paintVector(rect, vector, ctx);
    return;
  }

  paintPseudo(element, "::before", ctx);

  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) paintTextNode(child as Text, element, style, ctx);
    else if (child.nodeType === Node.ELEMENT_NODE) walk(child as Element, ctx);
  }

  paintPseudo(element, "::after", ctx);

  if (tag === "a") paintLink(element as HTMLAnchorElement, ctx);
}

/* ---------- entry point ---------- */

/**
 * Reads every `.pagedjs_page` on the stage into primitives.
 *
 * The stage must be attached and unscaled. `src/lib/export/pdf.ts` runs this
 * from `paginate`'s visitor for exactly that reason.
 */
export async function paintStage(stage: HTMLElement, options: PaintOptions): Promise<PaintResult> {
  const pageElements = [...stage.querySelectorAll<HTMLElement>(".pagedjs_page")];
  if (pageElements.length === 0) throw new Error("The stage holds no paginated pages");

  const sources = new Set<string>();
  for (const image of stage.querySelectorAll("img")) {
    const source = image.getAttribute("src");
    if (source) sources.add(source);
  }
  const vectors = new Map<string, LoadedVector>();
  for (const source of sources) {
    vectors.set(source, await loadVector(stage, source, options.loadSvg));
  }

  const measure = new Measurer(stage);
  const faces = new Map<string, FaceKey>();
  const uncovered = new Set<string>();
  const pages: PaintedPage[] = [];

  try {
    pageElements.forEach((page, index) => {
      const sheet = page.querySelector<HTMLElement>(".pagedjs_sheet") ?? page;
      const rect = sheet.getBoundingClientRect();
      const ctx: PageContext = {
        number: index + 1,
        total: pageElements.length,
        left: rect.left,
        top: rect.top,
        heightPt: rect.height * PX_TO_PT,
        primitives: [],
        faces,
        uncovered,
        vectors,
        measure,
        options,
      };
      walk(sheet, ctx);
      pages.push({
        width: rect.width * PX_TO_PT,
        height: rect.height * PX_TO_PT,
        primitives: ctx.primitives,
      });
    });
  } finally {
    measure.dispose();
  }

  return { pages, faces: [...faces.values()], uncovered: [...uncovered] };
}
