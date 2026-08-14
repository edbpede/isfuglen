import { persistentAtom } from "@nanostores/persistent";
import type { Lang } from "../i18n/types";
import type { DocLang } from "../model/types";

/**
 * Preferences — docs/PLAN.md §16.2, §16.3.
 *
 * localStorage, not IndexedDB, and for exactly one reason: `uiLang` decides what
 * the first paint says. An asynchronous read means a flash of the wrong language
 * on every load, which is precisely the failure the language-switch design
 * (§9.3) is engineered to avoid. localStorage is the only synchronous option.
 *
 * Note the names at the point of use: in a Svelte component these are read as
 * `$uiLang`, `$docLangDefault` and `$settings` through the store contract.
 */

/**
 * Danish, always — `navigator.language` is never consulted (§9.2). A Danish
 * teachers' union tool opening in English because the laptop's OS is English
 * would be wrong, so browser-language sniffing is forbidden here and has its own
 * test.
 */
export const uiLang = persistentAtom<Lang>("nl.uiLang", "da");

/** The default document language for *new* documents only. */
export const docLangDefault = persistentAtom<DocLang>("nl.docLang", "da");

export interface Settings {
  organisation: string;
  footerNote: string;
  previewZoom: number;
  dismissedEvictionNotice: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  organisation: "Ishøj Lærerkreds",
  footerNote: "Kreds 18 · DLF",
  previewZoom: 0,
  dismissedEvictionNotice: false,
};

export const settings = persistentAtom<Settings>("nl.settings", DEFAULT_SETTINGS, {
  encode: JSON.stringify,
  decode: (value) => {
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(value) as Partial<Settings>) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },
});

export function updateSettings(patch: Partial<Settings>): void {
  settings.set({ ...settings.get(), ...patch });
}

/** Used by "Slet alle gemte data" (§16.4.4). */
export function clearPreferences(): void {
  try {
    localStorage.removeItem("nl.uiLang");
    localStorage.removeItem("nl.docLang");
    localStorage.removeItem("nl.settings");
  } catch {
    /* Storage disabled: there is nothing to clear. */
  }
}
