/**
 * Document labels — docs/PLAN.md §8.5.
 *
 * These are the words the *template* generates inside the newsletter. They are a
 * different type from `Messages` and are resolved by `$docLang`, never by
 * `$uiLang`. Keeping the two in separate modules with separate types makes the
 * wrong wiring a compile error instead of a subtle bug: `export/` imports this
 * module and never `i18n/`, so a DOCX can never pick up an interface string.
 */
export interface DocumentLabels {
  /** Block headings rendered in the document itself. */
  agenda: string;
  decisions: string;
  actions: string;
  important: string;
  info: string;
  contact: string;
  closing: string;
  quote: string;

  /** Item-level labels. */
  presenter: string;
  minutes: string;
  owner: string;
  due: string;
  email: string;
  phone: string;
  web: string;

  /** Footer and running heads. */
  pageOf: string;
  page: string;

  /** Plain-text serialisation markers (§15.4). */
  plainImportant: string;
  plainInfo: string;
}

export type LabelKey = keyof DocumentLabels;
