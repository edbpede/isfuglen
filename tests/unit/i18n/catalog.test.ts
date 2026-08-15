import { describe, expect, test } from "bun:test";
import { da } from "../../../src/lib/i18n/da";
import { en } from "../../../src/lib/i18n/en";
import {
  catalogs,
  hasOwnMessage,
  type MessageKey,
  messageKeys,
  t,
} from "../../../src/lib/i18n/index";
import {
  isPluralForms,
  LANGS,
  type MessageNode,
  type MessageTree,
} from "../../../src/lib/i18n/types";

/**
 * docs/PLAN.md §20.1 (i18n) and §24.2.9–11.
 *
 * The `en: Messages` annotation already makes a missing key a compile error.
 * These tests cover what the type system cannot see: empty strings, mismatched
 * interpolation variables, and the claim in §8.2 that the Danish runtime
 * fallback never actually fires.
 */

function flatten(tree: MessageTree, prefix = ""): Map<string, MessageNode> {
  const out = new Map<string, MessageNode>();
  for (const [key, node] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof node === "string" || isPluralForms(node)) out.set(path, node);
    else for (const [k, v] of flatten(node as MessageTree, path)) out.set(k, v);
  }
  return out;
}

const daFlat = flatten(da);
const enFlat = flatten(en);

function variablesOf(node: MessageNode): Set<string> {
  const values =
    typeof node === "string" ? [node] : isPluralForms(node) ? [node.one, node.other] : [];
  const found = new Set<string>();
  for (const value of values) {
    for (const match of value.matchAll(/\{(\w+)\}/g)) found.add(match[1] ?? "");
  }
  return found;
}

describe("message catalogs", () => {
  test("Danish and English have exactly the same keys", () => {
    expect([...enFlat.keys()].sort()).toEqual([...daFlat.keys()].sort());
  });

  test("no message is empty or whitespace-only", () => {
    for (const [key, node] of [...daFlat, ...enFlat]) {
      const values =
        typeof node === "string" ? [node] : isPluralForms(node) ? [node.one, node.other] : [];
      for (const value of values) {
        expect(value.trim().length, `empty message: ${key}`).toBeGreaterThan(0);
      }
    }
  });

  test("every {var} in a Danish string exists in its English counterpart", () => {
    for (const [key, node] of daFlat) {
      const target = enFlat.get(key);
      expect(target, `missing English key: ${key}`).toBeDefined();
      if (!target) continue;
      expect([...variablesOf(target)].sort(), `variable mismatch on ${key}`).toEqual(
        [...variablesOf(node)].sort(),
      );
    }
  });

  test("plural keys are plural in every language", () => {
    for (const [key, node] of daFlat) {
      const target = enFlat.get(key);
      expect(isPluralForms(node), key).toBe(isPluralForms(target as MessageNode));
    }
  });

  test("the Danish fallback never fires — every key resolves in its own catalog", () => {
    for (const lang of LANGS) {
      for (const key of messageKeys()) {
        expect(hasOwnMessage(lang, key as MessageKey), `${lang} falls back on ${key}`).toBe(true);
      }
    }
  });

  test("English is not accidentally a copy of Danish", () => {
    const identical = [...daFlat].filter(([key, node]) => {
      const target = enFlat.get(key);
      return typeof node === "string" && node === target;
    });
    // `Sprog / Language`, `Dansk`, `English`, `Info` and `NB`-style tokens are
    // legitimately identical; anything beyond a handful is a missed translation.
    expect(identical.length).toBeLessThan(8);
  });
});

describe("t()", () => {
  test("resolves a key in the requested language", () => {
    expect(t("da", "export.pdf")).toBe("Udskriv eller gem som PDF");
    expect(t("en", "export.pdf")).toBe("Print or save as PDF");
  });

  test("interpolates {vars} as text", () => {
    expect(t("da", "save.saved", { time: "14.32" })).toBe("Gemt kl. 14.32");
    expect(t("en", "save.saved", { time: "14:32" })).toBe("Saved at 14:32");
  });

  test("leaves an unknown placeholder untouched rather than blanking it", () => {
    expect(t("da", "save.saved")).toBe("Gemt kl. {time}");
  });

  test("the review strip stays grammatical at a count of one", () => {
    // §3.4: one count per sentence, because the plural machinery selects on a
    // single `n`. `1 punkter er usikre` is what the single-sentence form gave.
    expect(t("da", "review.doubts", { n: 1 })).toBe("Ét af dem er vi i tvivl om.");
    expect(t("da", "review.doubts", { n: 3 })).toBe("3 af dem er vi i tvivl om.");
    expect(t("en", "review.found", { n: 1 })).toBe("We laid out 1 section.");
    expect(t("en", "review.found", { n: 6 })).toBe("We laid out 6 sections.");
  });

  test("selects the plural form via Intl.PluralRules", () => {
    expect(t("en", "entry.charCount", { n: 1 })).toBe("1 character");
    expect(t("en", "entry.charCount", { n: 2 })).toBe("2 characters");
    expect(t("da", "entry.charCount", { n: 1 })).toBe("1 tegn");
  });

  test("falls back to Danish when a catalog is missing a key", () => {
    // Defence in depth: simulate a hand-edited bundle by deleting a key.
    const key = "export.copied";
    const original = catalogs.en.export.copied;
    // @ts-expect-error — deliberately breaking the catalog to exercise §8.3.
    catalogs.en.export.copied = undefined;
    try {
      expect(t("en", key)).toBe(catalogs.da.export.copied);
    } finally {
      catalogs.en.export.copied = original;
    }
  });
});
