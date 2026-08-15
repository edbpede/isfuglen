/**
 * SVG path data to PDF path operators.
 *
 * PDF draws with `m`, `l`, `c`, `h` and nothing else: one move, one line, one
 * cubic Bézier, one close. SVG's grammar is larger, but only in ways that
 * reduce: horizontal and vertical lines are lines with one coordinate carried
 * over, smooth curves are curves with a reflected control point, quadratics are
 * cubics with the control points at two thirds. Arcs are the exception — they
 * are a genuinely different primitive — so they are refused rather than
 * approximated.
 *
 * The brand mark needs none of that: 60 `<path>` elements using `m l h v c s Z`,
 * no arcs, no transforms, one fill. `public/brand/README.md` states the drop-in
 * contract for replacing it, and this converter is where a replacement that
 * breaks the contract has to fail loudly instead of drawing the wrong shape.
 */

export type PathOp =
  | { op: "move"; x: number; y: number }
  | { op: "line"; x: number; y: number }
  | { op: "curve"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "close" };

export class UnsupportedSvgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedSvgError";
  }
}

/**
 * Numbers first would swallow the `e` of an exponent as a command, and commands
 * first would take the `e` out of `1e1`. Ordering the alternation with the
 * single-letter command class first is safe because a number never *starts*
 * with a letter, and it means an unknown letter is tokenised and then refused
 * rather than silently skipped.
 */
const TOKENS = /[A-Za-z]|[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g;

const CURVE_COMMANDS = new Set(["C", "c", "S", "s"]);
const QUADRATIC_COMMANDS = new Set(["Q", "q", "T", "t"]);

/**
 * Parses one `d` attribute into absolute PDF-shaped operators.
 *
 * @throws {UnsupportedSvgError} on an elliptical arc, a malformed number run,
 * or coordinates before any command.
 */
export function parsePathData(d: string): PathOp[] {
  const tokens = d.match(TOKENS) ?? [];
  const ops: PathOp[] = [];

  let index = 0;
  let command = "";
  let previous = "";
  // The current point, the start of the current subpath, and the control point
  // a smooth command reflects.
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let controlX = 0;
  let controlY = 0;

  const number = (): number => {
    const token = tokens[index];
    if (token === undefined || !Number.isFinite(Number(token))) {
      throw new UnsupportedSvgError(`path data ends mid-command after "${command}"`);
    }
    index += 1;
    return Number(token);
  };

  while (index < tokens.length) {
    const token = tokens[index] as string;

    if (/^[A-Za-z]$/.test(token)) {
      command = token;
      index += 1;
      if (command === "Z" || command === "z") {
        ops.push({ op: "close" });
        x = startX;
        y = startY;
        previous = command;
        continue;
      }
    } else if (command === "") {
      throw new UnsupportedSvgError("path data starts with a coordinate, not a command");
    } else if (command === "M") {
      // A repeated argument set after a moveto is a lineto, per the grammar.
      command = "L";
    } else if (command === "m") {
      command = "l";
    }

    const relative = command === command.toLowerCase();
    const originX = relative ? x : 0;
    const originY = relative ? y : 0;

    switch (command.toUpperCase()) {
      case "M": {
        x = originX + number();
        y = originY + number();
        startX = x;
        startY = y;
        ops.push({ op: "move", x, y });
        break;
      }
      case "L": {
        x = originX + number();
        y = originY + number();
        ops.push({ op: "line", x, y });
        break;
      }
      case "H": {
        x = originX + number();
        ops.push({ op: "line", x, y });
        break;
      }
      case "V": {
        y = originY + number();
        ops.push({ op: "line", x, y });
        break;
      }
      case "C": {
        const x1 = originX + number();
        const y1 = originY + number();
        const x2 = originX + number();
        const y2 = originY + number();
        x = originX + number();
        y = originY + number();
        controlX = x2;
        controlY = y2;
        ops.push({ op: "curve", x1, y1, x2, y2, x, y });
        break;
      }
      case "S": {
        // The first control point mirrors the previous one about the current
        // point; with no previous curve it coincides with the current point.
        const x1 = CURVE_COMMANDS.has(previous) ? 2 * x - controlX : x;
        const y1 = CURVE_COMMANDS.has(previous) ? 2 * y - controlY : y;
        const x2 = originX + number();
        const y2 = originY + number();
        x = originX + number();
        y = originY + number();
        controlX = x2;
        controlY = y2;
        ops.push({ op: "curve", x1, y1, x2, y2, x, y });
        break;
      }
      case "Q":
      case "T": {
        const isSmooth = command.toUpperCase() === "T";
        const qx = isSmooth
          ? QUADRATIC_COMMANDS.has(previous)
            ? 2 * x - controlX
            : x
          : originX + number();
        const qy = isSmooth
          ? QUADRATIC_COMMANDS.has(previous)
            ? 2 * y - controlY
            : y
          : originY + number();
        const endX = originX + number();
        const endY = originY + number();
        // Degree elevation: a quadratic is the cubic whose control points sit
        // two thirds of the way from each endpoint to the quadratic's control.
        ops.push({
          op: "curve",
          x1: x + (2 / 3) * (qx - x),
          y1: y + (2 / 3) * (qy - y),
          x2: endX + (2 / 3) * (qx - endX),
          y2: endY + (2 / 3) * (qy - endY),
          x: endX,
          y: endY,
        });
        controlX = qx;
        controlY = qy;
        x = endX;
        y = endY;
        break;
      }
      case "A": {
        throw new UnsupportedSvgError(
          "elliptical arc: this converter draws lines and cubic Béziers only. " +
            "See public/brand/README.md for the drop-in contract.",
        );
      }
      default: {
        throw new UnsupportedSvgError(`unknown path command "${command}"`);
      }
    }

    previous = command;
  }

  return ops;
}

/** Maps a path from SVG user units into PDF points, flipping the y axis. */
export interface PathPlacement {
  /** Where the SVG's viewBox origin lands, in PDF points from the page's left. */
  x: number;
  /** Where the viewBox origin lands, in PDF points from the page's *bottom*. */
  y: number;
  scaleX: number;
  scaleY: number;
  /** The viewBox, so a non-zero min-x/min-y is honoured. */
  minX: number;
  minY: number;
}

/**
 * SVG's y axis grows downwards and PDF's grows upwards, so every y is mirrored
 * about the placement's top edge. Doing it here rather than in the writer keeps
 * the writer free of coordinate-system knowledge.
 */
export function placePath(ops: readonly PathOp[], placement: PathPlacement): PathOp[] {
  const mapX = (value: number) => placement.x + (value - placement.minX) * placement.scaleX;
  const mapY = (value: number) => placement.y - (value - placement.minY) * placement.scaleY;

  return ops.map((op): PathOp => {
    if (op.op === "close") return op;
    if (op.op === "curve") {
      return {
        op: "curve",
        x1: mapX(op.x1),
        y1: mapY(op.y1),
        x2: mapX(op.x2),
        y2: mapY(op.y2),
        x: mapX(op.x),
        y: mapY(op.y),
      };
    }
    return { op: op.op, x: mapX(op.x), y: mapY(op.y) };
  });
}

/** The viewBox, or a loud failure: without it nothing can be scaled. */
export function readViewBox(svg: Element): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  const raw = svg.getAttribute("viewBox");
  if (!raw) throw new UnsupportedSvgError("the SVG declares no viewBox");
  const parts = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new UnsupportedSvgError(`unreadable viewBox "${raw}"`);
  }
  const [minX, minY, width, height] = parts as [number, number, number, number];
  if (width <= 0 || height <= 0) throw new UnsupportedSvgError(`empty viewBox "${raw}"`);
  return { minX, minY, width, height };
}

/** Elements that carry no geometry and can be walked past. */
const TRANSPARENT_TAGS = new Set(["svg", "g", "defs", "style", "title", "desc", "metadata"]);

/**
 * Every `<path>` in the subtree, refused if anything else draws.
 *
 * A `<rect>`, `<circle>` or `<use>` is not hard to support, and a `transform` is
 * not hard to compose — but silently mis-drawing a replaced logo is much worse
 * than refusing to export one, and the contract in `public/brand/README.md` says
 * paths without transforms. So this reads what the contract promises and throws
 * on anything else.
 */
export function collectPaths(root: Element): Element[] {
  const paths: Element[] = [];

  const walk = (element: Element): void => {
    const tag = element.tagName.toLowerCase();

    if (element.getAttribute("transform")) {
      throw new UnsupportedSvgError(
        `<${tag}> carries a transform. See public/brand/README.md for the drop-in contract.`,
      );
    }

    if (tag === "path") {
      paths.push(element);
      return;
    }

    if (!TRANSPARENT_TAGS.has(tag)) {
      throw new UnsupportedSvgError(
        `<${tag}> is not a path. See public/brand/README.md for the drop-in contract.`,
      );
    }

    for (const child of [...element.children]) walk(child);
  };

  walk(root);
  return paths;
}
