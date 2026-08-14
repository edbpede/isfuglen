import { describe, expect, test } from "bun:test";
import { PAGE_KEYS, pathFor, resolvePath, siblingPath } from "../../../src/lib/i18n/routes";

/** docs/PLAN.md §4.1 — Danish unprefixed, English under /en/, names translated. */

describe("routes", () => {
  test("Danish is unprefixed and English is prefixed", () => {
    expect(pathFor("da", "home")).toBe("/");
    expect(pathFor("en", "home")).toBe("/en/");
    expect(pathFor("da", "privacy")).toBe("/privatliv");
    expect(pathFor("en", "privacy")).toBe("/en/privacy");
  });

  test("route names are translated, not just prefixed", () => {
    expect(pathFor("da", "help")).toBe("/hjaelp");
    expect(pathFor("da", "about")).toBe("/om");
    expect(pathFor("en", "help")).toBe("/en/help");
    expect(pathFor("en", "about")).toBe("/en/about");
  });

  test("the sibling of a page is the same page in the other language", () => {
    for (const page of PAGE_KEYS) {
      expect(siblingPath("da", page)).toBe(pathFor("en", page));
      expect(siblingPath("en", page)).toBe(pathFor("da", page));
    }
  });

  test("every path resolves back to the page and language it came from", () => {
    for (const lang of ["da", "en"] as const) {
      for (const page of PAGE_KEYS) {
        expect(resolvePath(pathFor(lang, page))).toEqual({ lang, page });
      }
    }
  });

  test("a trailing slash does not change the resolution", () => {
    expect(resolvePath("/privatliv/")).toEqual({ lang: "da", page: "privacy" });
    expect(resolvePath("/en/help/")).toEqual({ lang: "en", page: "help" });
  });

  test("an unknown path falls back to the Danish workspace", () => {
    expect(resolvePath("/whatever")).toEqual({ lang: "da", page: "home" });
  });
});
