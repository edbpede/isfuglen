import type { Rule } from "../types";
import { lexiconRule, triggers } from "./shared";

/**
 * The English rule pack — a mirror of `da.ts` (§11.3). It is deliberately the
 * secondary pack: on a tie the Danish rule wins, because the tool's primary
 * input is Danish meeting notes.
 */

const META_LABELS = [
  "time and place",
  "time",
  "date",
  "place",
  "location",
  "venue",
  "room",
  "minutes taken by",
  "chair",
  "present",
  "attendees",
  "apologies",
  "next meeting",
];

export const enRules: Rule[] = [
  lexiconRule({
    id: "en.heading.agenda",
    lang: "en",
    kind: "agendaHeading",
    score: 90,
    triggers: triggers(["Agenda", "Items", "Meeting items", "For discussion"]),
  }),
  lexiconRule({
    id: "en.heading.decisions",
    lang: "en",
    kind: "decisionsHeading",
    score: 90,
    triggers: triggers([
      "Decision",
      "Decisions",
      "We decided",
      "The club decided",
      "For decision",
      "Conclusion",
    ]),
  }),
  lexiconRule({
    id: "en.heading.actions",
    lang: "en",
    kind: "actionsHeading",
    score: 90,
    triggers: [
      ...triggers(["Action", "Actions", "Action items", "Tasks", "To-do", "Who does what"]),
      { word: "Responsible", mode: "exact" },
    ],
  }),
  lexiconRule({
    id: "en.heading.important",
    lang: "en",
    kind: "importantHeading",
    score: 90,
    triggers: [
      ...triggers(["Important", "Note", "NB", "Remember", "Deadline"]),
      ...triggers(["Important", "NB", "Remember", "Deadline"], "prefix"),
    ],
  }),
  lexiconRule({
    id: "en.heading.info",
    lang: "en",
    kind: "infoHeading",
    score: 90,
    triggers: triggers(["Please note", "For information", "Info", "FYI"]),
  }),
  lexiconRule({
    id: "en.heading.contact",
    lang: "en",
    kind: "contactHeading",
    score: 90,
    triggers: triggers(["Contact", "Contact details", "Questions", "Any questions"]),
  }),
  lexiconRule({
    id: "en.heading.closing",
    lang: "en",
    kind: "closingHeading",
    score: 92,
    triggers: [
      ...triggers([
        "Kind regards",
        "Best regards",
        "Regards",
        "Yours sincerely",
        "All the best",
        "On behalf of",
      ]),
      ...triggers(["Kind regards", "Best regards", "On behalf of"], "prefix"),
    ],
  }),
  lexiconRule({
    id: "en.meta.labelled",
    lang: "en",
    kind: "metaLine",
    score: 84,
    triggers: triggers(META_LABELS),
    maxLength: 90,
  }),
  lexiconRule({
    id: "en.heading.generic",
    lang: "en",
    kind: "heading",
    score: 86,
    triggers: [
      ...triggers([
        "News from the branch",
        "Any other business",
        "AOB",
        "Other",
        "Summary",
        "Background",
        "Introduction",
        "Welcome",
      ]),
      { word: "News from", mode: "prefix" },
    ],
  }),
];
