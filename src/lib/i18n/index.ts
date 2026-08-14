import { da, type Messages } from "./da";
import { en } from "./en";
import {
  isPluralForms,
  LANGS,
  type Lang,
  type MessageNode,
  type MessagePath,
  type MessageTree,
  type Vars,
} from "./types";

export type { Messages } from "./da";
export { da } from "./da";
export { en } from "./en";
export type { Lang, Vars } from "./types";
export { LANGS } from "./types";

export type MessageKey = MessagePath<Messages>;

export const catalogs: Record<Lang, Messages> = { da, en };

export function isLang(value: unknown): value is Lang {
  return value === "da" || value === "en";
}

export const OTHER_LANG: Record<Lang, Lang> = { da: "en", en: "da" };

function resolve(tree: MessageTree, key: string): MessageNode | undefined {
  let node: MessageNode | undefined = tree;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as MessageTree)[part];
    if (node === undefined) return undefined;
  }
  return node;
}

const pluralRules = new Map<Lang, Intl.PluralRules>();
function pluralRuleFor(lang: Lang): Intl.PluralRules {
  let rules = pluralRules.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(lang === "da" ? "da-DK" : "en-GB");
    pluralRules.set(lang, rules);
  }
  return rules;
}

/** `{name}` only. No expressions, no HTML — the value is inserted as text. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

function selectPlural(node: MessageNode, lang: Lang, vars?: Vars): string | undefined {
  if (typeof node === "string") return node;
  if (!isPluralForms(node)) return undefined;
  const n = vars?.n;
  const count = typeof n === "number" ? n : Number(n ?? 0);
  return pluralRuleFor(lang).select(count) === "one" ? node.one : node.other;
}

/**
 * Look up a message. Dev throws on a missing key so it is loud during
 * development; production returns the key so the user never sees a blank (§8.3).
 *
 * The Danish fallback is defence in depth: `en: Messages` already makes a
 * missing key a compile error, and `tests/unit/i18n/catalog.test.ts` asserts the
 * fallback never actually fires.
 */
export function t(lang: Lang, key: MessageKey, vars?: Vars): string {
  const direct = resolve(catalogs[lang], key);
  const node = direct ?? resolve(catalogs.da, key);
  if (node === undefined) {
    if (import.meta.env?.DEV) throw new Error(`Missing message: ${key}`);
    return key;
  }
  const value = selectPlural(node, lang, vars);
  if (value === undefined) {
    if (import.meta.env?.DEV) throw new Error(`Message is not a string: ${key}`);
    return key;
  }
  return interpolate(value, vars);
}

export type Translator = (key: MessageKey, vars?: Vars) => string;

export function createTranslator(lang: Lang): Translator {
  return (key, vars) => t(lang, key, vars);
}

/** True when `lang`'s catalog resolves the key without falling back to Danish. */
export function hasOwnMessage(lang: Lang, key: MessageKey): boolean {
  return resolve(catalogs[lang], key) !== undefined;
}

/** Every dot path in the Danish catalog, used by the parity tests. */
export function messageKeys(tree: MessageTree = da, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [name, node] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (typeof node === "string" || isPluralForms(node)) keys.push(path);
    else keys.push(...messageKeys(node as MessageTree, path));
  }
  return keys;
}

export function allLangs(): readonly Lang[] {
  return LANGS;
}
