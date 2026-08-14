import type { DocLang } from "../model/types";
import { daLabels } from "./da";
import { enLabels } from "./en";
import type { DocumentLabels } from "./types";

export { daLabels } from "./da";
export { enLabels } from "./en";
export type { DocumentLabels, LabelKey } from "./types";

export const labelPacks: Record<DocLang, DocumentLabels> = { da: daLabels, en: enLabels };

export function labelsFor(lang: DocLang): DocumentLabels {
  return labelPacks[lang];
}
