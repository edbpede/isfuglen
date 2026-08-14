import type { Rule } from "../types";
import { lexiconRule, triggers } from "./shared";

/**
 * The Danish rule pack — docs/PLAN.md §11.3. Danish is first class: this file is
 * the reference implementation and `en.ts` mirrors it.
 *
 * Scores: an explicit lexical heading is 90, a labelled meta line is 84,
 * structural heuristics sit between 46 and 78, the paragraph fallback is 10.
 */

const META_LABELS = [
  "tid og sted",
  "tidspunkt",
  "tid",
  "dato",
  "sted",
  "mødested",
  "lokale",
  "referent",
  "ordstyrer",
  "dirigent",
  "fremmødte",
  "deltagere",
  "afbud",
  "næste møde",
];

export const daRules: Rule[] = [
  lexiconRule({
    id: "da.heading.agenda",
    lang: "da",
    kind: "agendaHeading",
    score: 90,
    triggers: triggers(["Dagsorden", "Dagsordenen", "Punkter", "Mødets punkter", "Til behandling"]),
  }),
  lexiconRule({
    id: "da.heading.decisions",
    lang: "da",
    kind: "decisionsHeading",
    score: 90,
    triggers: triggers([
      "Beslutning",
      "Beslutninger",
      "Vi besluttede",
      "Klubben besluttede",
      "Til beslutning",
      "Konklusion",
    ]),
  }),
  lexiconRule({
    id: "da.heading.actions",
    lang: "da",
    kind: "actionsHeading",
    score: 90,
    triggers: [
      ...triggers(["Handling", "Handlinger", "Opgaver", "To-do", "Aftaler", "Hvem gør hvad"]),
      // `Ansvarlig` alone is a heading; `Ansvarlig: Mette` is an action item's
      // owner field and must not swallow the line.
      { word: "Ansvarlig", mode: "exact" },
    ],
  }),
  lexiconRule({
    id: "da.heading.important",
    lang: "da",
    kind: "importantHeading",
    score: 90,
    triggers: [
      ...triggers(["Vigtigt", "Vigtig", "OBS", "NB", "Bemærk", "Husk", "Frist", "Deadline"]),
      // `Frist for tilmelding er 20. august.` is a notice, not a paragraph. The
      // prefix form is what turns a whole sentence into an important block.
      ...triggers(["Vigtigt", "OBS", "NB", "Husk", "Frist", "Deadline", "Bemærk"], "prefix"),
    ],
  }),
  lexiconRule({
    id: "da.heading.info",
    lang: "da",
    kind: "infoHeading",
    score: 90,
    triggers: triggers(["Til orientering", "Orientering", "Info", "Bemærk venligst"]),
  }),
  lexiconRule({
    id: "da.heading.contact",
    lang: "da",
    kind: "contactHeading",
    score: 90,
    triggers: triggers(["Kontakt", "Kontaktoplysninger", "Spørgsmål", "Har du spørgsmål"]),
  }),
  lexiconRule({
    id: "da.heading.closing",
    lang: "da",
    kind: "closingHeading",
    score: 92,
    triggers: [
      ...triggers([
        "Med venlig hilsen",
        "Venlig hilsen",
        "Mvh",
        "M.v.h.",
        "De bedste hilsner",
        "Bedste hilsner",
        "På vegne af",
      ]),
      // `På vegne af klubben` and `Mvh Anne` are sign-offs with the name on the
      // same line, which is how most people actually write them.
      ...triggers(["Med venlig hilsen", "Venlig hilsen", "Mvh", "På vegne af"], "prefix"),
    ],
  }),
  lexiconRule({
    id: "da.meta.labelled",
    lang: "da",
    kind: "metaLine",
    score: 84,
    triggers: triggers(META_LABELS),
    maxLength: 90,
  }),
  lexiconRule({
    id: "da.heading.generic",
    lang: "da",
    kind: "heading",
    score: 86,
    triggers: [
      // Structural words only. Subject words such as `Arbejdstid` or `Økonomi`
      // are deliberately absent: they are as likely to be an agenda item as a
      // heading, and the structural heuristics already catch the heading case.
      ...triggers([
        "Nyt fra kredsen",
        "Eventuelt",
        "Evt.",
        "Andet",
        "Opsamling",
        "Baggrund",
        "Indledning",
        "Velkomst",
      ]),
      { word: "Nyt fra", mode: "prefix" },
    ],
  }),
];
