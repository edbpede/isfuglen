/**
 * Localisation types — docs/PLAN.md §8.
 *
 * No i18n framework. The Danish catalog defines the shape; the English one is
 * annotated with that shape, so a missing key is a TypeScript error rather than
 * a blank space in front of a user.
 */

export type Lang = "da" | "en";

export const LANGS: readonly Lang[] = ["da", "en"] as const;

/** Danish and English both use a simple one/other system. No ICU parser needed. */
export interface PluralForms {
  one: string;
  other: string;
}

export type MessageNode = string | PluralForms | MessageTree;

export interface MessageTree {
  [key: string]: MessageNode;
}

export function isPluralForms(value: MessageNode): value is PluralForms {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PluralForms).one === "string" &&
    typeof (value as PluralForms).other === "string"
  );
}

/**
 * Every dot path in a catalog, as a union of string literals. This is what makes
 * `t("export.pdfff")` a compile error.
 */
export type MessagePath<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends PluralForms
      ? K
      : `${K}.${MessagePath<T[K]>}`;
}[keyof T & string];

export type Vars = Record<string, string | number>;
