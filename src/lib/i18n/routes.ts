import type { Lang } from "./types";

/**
 * Locale-prefixed routing — docs/PLAN.md §4.1.
 *
 * Danish is unprefixed and is the default; English lives under `/en/`. The path
 * *names* differ per language too, because a Danish user should not have to read
 * `/privacy` to find `/privatliv`.
 *
 * This table is the single place that knows the mapping, so the header, the
 * static-page language links and the workspace's `history.replaceState` all
 * agree by construction.
 */

export type PageKey = "home" | "help" | "privacy" | "about";

export const PAGE_KEYS: readonly PageKey[] = ["home", "help", "privacy", "about"] as const;

const PATHS: Record<Lang, Record<PageKey, string>> = {
  da: {
    home: "/",
    help: "/hjaelp",
    privacy: "/privatliv",
    about: "/om",
  },
  en: {
    home: "/en/",
    help: "/en/help",
    privacy: "/en/privacy",
    about: "/en/about",
  },
};

export function pathFor(lang: Lang, page: PageKey): string {
  return PATHS[lang][page];
}

/** The same page in the other language — what the language switch links to. */
export function siblingPath(lang: Lang, page: PageKey): string {
  return pathFor(lang === "da" ? "en" : "da", page);
}

/** Reads the page and language out of a pathname, for the client-side switch. */
export function resolvePath(pathname: string): { lang: Lang; page: PageKey } {
  const normalised = pathname.replace(/\/+$/, "") || "/";
  for (const lang of ["en", "da"] as const) {
    for (const page of PAGE_KEYS) {
      const candidate = PATHS[lang][page].replace(/\/+$/, "") || "/";
      if (candidate === normalised) return { lang, page };
    }
  }
  return { lang: "da", page: "home" };
}
