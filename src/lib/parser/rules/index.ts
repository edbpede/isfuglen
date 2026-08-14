import type { DocLang } from "../../model/types";
import type { Rule } from "../types";
import { daRules } from "./da";
import { enRules } from "./en";
import { structuralRules } from "./shared";

export { daRules } from "./da";
export { enRules } from "./en";

/** Adding a language is adding a file and one entry here (§8.4, §11.2). */
export const lexicalPacks: Record<DocLang, Rule[]> = { da: daRules, en: enRules };

/** How much a non-active language's lexical rules are discounted on a tie. */
const SECONDARY_PENALTY = 6;

const cache = new Map<DocLang, Rule[]>();

/**
 * The active pack first, the other language's pack discounted behind it, then
 * the structural heuristics. The order matters: `resolveRules` keeps a stable
 * sort, so ties break toward the earlier rule — Danish before English (§11.5).
 */
export function rulesFor(lang: DocLang): Rule[] {
  const cached = cache.get(lang);
  if (cached) return cached;

  const other: DocLang = lang === "da" ? "en" : "da";
  const rules: Rule[] = [
    ...lexicalPacks[lang],
    ...lexicalPacks[other].map((rule) => ({ ...rule, score: rule.score - SECONDARY_PENALTY })),
    ...structuralRules(lang),
  ];

  cache.set(lang, rules);
  return rules;
}

/** Every rule id in the project, used by the "every rule has a test" check. */
export function allRuleIds(): string[] {
  return [
    ...daRules.map((rule) => rule.id),
    ...enRules.map((rule) => rule.id),
    ...structuralRules("da").map((rule) => rule.id),
    ...structuralRules("en").map((rule) => rule.id),
  ];
}
