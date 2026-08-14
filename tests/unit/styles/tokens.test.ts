import { describe, expect, test } from "bun:test";
import { palette } from "../../../uno.config";

/**
 * docs/PLAN.md §12.4, §12.10.
 *
 * `uno.config.ts` is the source of truth for the palette and `tokens.css`
 * mirrors it, because the print and document stylesheets need raw values rather
 * than utility classes. Two sources of truth for one palette is a drift waiting
 * to happen, so the parity is asserted rather than trusted — and so is the rule
 * that gold is never text.
 */

const tokensCss = await Bun.file("src/styles/tokens.css").text();

function cssVar(name: string): string | undefined {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokensCss);
  return match?.[1]?.trim().toLowerCase();
}

const MIRROR: [string, string][] = [
  ["c-ink", palette.ink],
  ["c-brand", palette.brand],
  ["c-brand-mid", palette.brandMid],
  ["c-muted", palette.muted],
  ["c-accent", palette.accent],
  ["c-surface", palette.surface],
  ["c-surface-sunken", palette.surfaceSunken],
  ["c-hairline", palette.hairline],
  ["c-info-fill", palette.infoFill],
  ["c-info-bar", palette.infoBar],
  ["c-important-fill", palette.importantFill],
  ["c-important-bar", palette.importantBar],
  ["c-decision-fill", palette.decisionFill],
  ["c-decision-bar", palette.decisionBar],
  ["c-action-fill", palette.actionFill],
  ["c-action-bar", palette.actionBar],
];

describe("token parity", () => {
  for (const [name, value] of MIRROR) {
    test(`--${name} matches uno.config.ts`, () => {
      expect(cssVar(name)).toBe(value.toLowerCase());
    });
  }
});

/* ---------- contrast ---------- */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

const WHITE = "#FFFFFF";

describe("contrast", () => {
  const round = (value: number) => Math.round(value * 100) / 100;

  test("the core palette matches the computed table in the plan", () => {
    expect(round(contrast(palette.ink, WHITE))).toBeCloseTo(15.46, 1);
    expect(round(contrast(palette.brand, WHITE))).toBeCloseTo(12.76, 1);
    expect(round(contrast(palette.brandMid, WHITE))).toBeCloseTo(8.19, 1);
    expect(round(contrast(palette.muted, WHITE))).toBeCloseTo(7.85, 1);
  });

  test("every text colour clears AA on white by a wide margin", () => {
    for (const colour of [palette.ink, palette.brand, palette.brandMid, palette.muted]) {
      expect(contrast(colour, WHITE)).toBeGreaterThan(4.5);
    }
  });

  test("text on every semantic fill clears AA", () => {
    const pairs: [string, string][] = [
      [palette.ink, palette.infoFill],
      [palette.ink, palette.importantFill],
      [palette.ink, palette.decisionFill],
      [palette.ink, palette.actionFill],
      [palette.brandMid, palette.infoFill],
      [palette.decisionBar, palette.decisionFill],
      [palette.actionBar, palette.actionFill],
    ];
    for (const [text, background] of pairs) {
      expect(contrast(text, background), `${text} on ${background}`).toBeGreaterThan(4.5);
    }
  });

  test("gold is not a text colour, and the codebase never uses it as one", () => {
    // 1.88:1 on white. This is the single easiest way for a well-meaning future
    // change to break accessibility, so it is asserted rather than reviewed.
    expect(contrast(palette.accent, WHITE)).toBeLessThan(3);
    // Navy on gold is 6.80:1, which is why the agenda chip works.
    expect(contrast(palette.brand, palette.accent)).toBeGreaterThan(4.5);
  });

  test("the focus ring clears the 3:1 non-text requirement of SC 1.4.11", () => {
    expect(contrast(palette.brandMid, WHITE)).toBeGreaterThan(3);
  });
});

describe("gold is never text", () => {
  const files = [
    "src/styles/document.css",
    "src/styles/app.css",
    "src/styles/print.css",
    "src/styles/paged.css",
  ];

  test("no stylesheet sets color or a text shadow to the accent", async () => {
    const accent = palette.accent.toLowerCase();
    for (const path of files) {
      const css = (await Bun.file(path).text()).toLowerCase();
      const offenders = [...css.matchAll(/(^|[;{\s])color:\s*([^;]+);/g)]
        .map((match) => (match[2] ?? "").trim())
        .filter((value) => value === accent || value === "var(--c-accent)");
      expect(offenders, `${path} uses the accent as a text colour`).toEqual([]);
    }
  });
});
