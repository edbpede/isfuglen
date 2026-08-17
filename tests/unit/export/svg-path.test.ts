import { describe, expect, test } from "bun:test";
import {
  type PathOp,
  parsePathData,
  placePath,
  UnsupportedSvgError,
} from "../../../src/lib/export/svg-path";

/**
 * The brand mark is 60 paths of `m l h v c s Z` and the decision tick is six
 * straight segments, so this converter is the whole vector story of the export.
 * Getting a relative command or an `s` reflection wrong does not throw — it
 * draws a subtly wrong logo — which is why every command is pinned here.
 */

const rounded = (value: number) => Math.round(value * 1000) / 1000;

const round = (ops: PathOp[]): PathOp[] =>
  ops.map((op): PathOp => {
    if (op.op === "close") return op;
    if (op.op === "curve") {
      return {
        ...op,
        x1: rounded(op.x1),
        y1: rounded(op.y1),
        x2: rounded(op.x2),
        y2: rounded(op.y2),
        x: rounded(op.x),
        y: rounded(op.y),
      };
    }
    return { ...op, x: rounded(op.x), y: rounded(op.y) };
  });

describe("parsePathData", () => {
  test("absolute moves and lines", () => {
    expect(parsePathData("M 1 2 L 3 4 Z")).toEqual([
      { op: "move", x: 1, y: 2 },
      { op: "line", x: 3, y: 4 },
      { op: "close" },
    ]);
  });

  test("relative commands accumulate from the current point", () => {
    expect(parsePathData("m 1 2 l 3 4 l 1 1")).toEqual([
      { op: "move", x: 1, y: 2 },
      { op: "line", x: 4, y: 6 },
      { op: "line", x: 5, y: 7 },
    ]);
  });

  test("a repeated argument set after a moveto is a lineto", () => {
    // The one grammar rule that silently produces a wrong shape when missed.
    expect(parsePathData("M 1 1 2 2 3 3")).toEqual([
      { op: "move", x: 1, y: 1 },
      { op: "line", x: 2, y: 2 },
      { op: "line", x: 3, y: 3 },
    ]);
    expect(parsePathData("m 1 1 2 2")).toEqual([
      { op: "move", x: 1, y: 1 },
      { op: "line", x: 3, y: 3 },
    ]);
  });

  test("h and v carry the other coordinate over", () => {
    expect(parsePathData("M 5 5 H 10 V 20 h -2 v -5")).toEqual([
      { op: "move", x: 5, y: 5 },
      { op: "line", x: 10, y: 5 },
      { op: "line", x: 10, y: 20 },
      { op: "line", x: 8, y: 20 },
      { op: "line", x: 8, y: 15 },
    ]);
  });

  test("close returns the current point to the start of the subpath", () => {
    expect(parsePathData("M 1 1 L 5 5 Z l 1 1")).toEqual([
      { op: "move", x: 1, y: 1 },
      { op: "line", x: 5, y: 5 },
      { op: "close" },
      { op: "line", x: 2, y: 2 },
    ]);
  });

  test("cubic curves, absolute and relative", () => {
    expect(parsePathData("M 0 0 C 1 2 3 4 5 6")).toEqual([
      { op: "move", x: 0, y: 0 },
      { op: "curve", x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 },
    ]);
    expect(parsePathData("M 10 10 c 1 2 3 4 5 6")).toEqual([
      { op: "move", x: 10, y: 10 },
      { op: "curve", x1: 11, y1: 12, x2: 13, y2: 14, x: 15, y: 16 },
    ]);
  });

  test("s reflects the previous control point about the current point", () => {
    // Previous control (3,4), current point (5,6) → reflected (7,8).
    expect(parsePathData("M 0 0 C 1 2 3 4 5 6 S 9 10 11 12")).toEqual([
      { op: "move", x: 0, y: 0 },
      { op: "curve", x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 },
      { op: "curve", x1: 7, y1: 8, x2: 9, y2: 10, x: 11, y: 12 },
    ]);
  });

  test("s with no preceding curve puts the control on the current point", () => {
    expect(parsePathData("M 5 6 S 9 10 11 12")).toEqual([
      { op: "move", x: 5, y: 6 },
      { op: "curve", x1: 5, y1: 6, x2: 9, y2: 10, x: 11, y: 12 },
    ]);
  });

  test("quadratics are elevated to cubics", () => {
    // Control two thirds of the way from each endpoint towards (6,0).
    expect(round(parsePathData("M 0 0 Q 6 0 6 6"))).toEqual([
      { op: "move", x: 0, y: 0 },
      { op: "curve", x1: 4, y1: 0, x2: 6, y2: 2, x: 6, y: 6 },
    ]);
  });

  test("t reflects the previous quadratic control", () => {
    const ops = round(parsePathData("M 0 0 Q 2 4 4 0 T 8 0"));
    expect(ops[2]).toEqual({
      op: "curve",
      x1: 5.333,
      y1: -2.667,
      x2: 6.667,
      y2: -2.667,
      x: 8,
      y: 0,
    });
  });

  test("numbers may run together, signed or fractional", () => {
    expect(parsePathData("M.5.5L-1.5-2.5")).toEqual([
      { op: "move", x: 0.5, y: 0.5 },
      { op: "line", x: -1.5, y: -2.5 },
    ]);
    expect(parsePathData("M 1e1 2E-1 L 3 4")[0]).toEqual({ op: "move", x: 10, y: 0.2 });
  });

  test("an elliptical arc is refused rather than approximated", () => {
    expect(() => parsePathData("M 0 0 A 5 5 0 0 1 10 10")).toThrow(UnsupportedSvgError);
    expect(() => parsePathData("M 0 0 a 5 5 0 0 1 10 10")).toThrow(/public\/brand\/README\.md/);
  });

  test("malformed data fails loudly", () => {
    expect(() => parsePathData("1 2 3")).toThrow(UnsupportedSvgError);
    expect(() => parsePathData("M 1 2 L 3")).toThrow(UnsupportedSvgError);
    expect(() => parsePathData("M 1 2 K 3 4")).toThrow(UnsupportedSvgError);
  });

  test("the decision tick converts to six straight segments and a close", () => {
    const ops = parsePathData("M4.6 9.9 L1 6.3 L2.4 4.9 L4.6 7.1 L9.6 2.1 L11 3.5 Z");
    expect(ops.filter((op) => op.op === "line")).toHaveLength(5);
    expect(ops.at(-1)).toEqual({ op: "close" });
    expect(ops.some((op) => op.op === "curve")).toBe(false);
  });
});

describe("placePath", () => {
  test("flips the y axis and scales into points", () => {
    // A 100-unit box placed 10 pt wide with its top at y = 700.
    const placement = { x: 20, y: 700, scaleX: 0.1, scaleY: 0.1, minX: 0, minY: 0 };
    expect(placePath(parsePathData("M 0 0 L 100 100"), placement)).toEqual([
      { op: "move", x: 20, y: 700 },
      { op: "line", x: 30, y: 690 },
    ]);
  });

  test("honours a non-zero viewBox origin", () => {
    const placement = { x: 0, y: 100, scaleX: 1, scaleY: 1, minX: 10, minY: 20 };
    expect(placePath(parsePathData("M 10 20"), placement)).toEqual([{ op: "move", x: 0, y: 100 }]);
  });

  test("maps every control point of a curve", () => {
    const placement = { x: 0, y: 10, scaleX: 1, scaleY: 1, minX: 0, minY: 0 };
    expect(placePath(parsePathData("M 0 0 C 1 1 2 2 3 3"), placement)[1]).toEqual({
      op: "curve",
      x1: 1,
      y1: 9,
      x2: 2,
      y2: 8,
      x: 3,
      y: 7,
    });
  });
});
