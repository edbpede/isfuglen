import Bold from "@tiptap/extension-bold";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import { BulletList, ListItem, ListKeymap, OrderedList } from "@tiptap/extension-list";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { safeHref } from "../render/html";

/**
 * The section-body schema — docs/PLAN.md §7.1, §7.4.
 *
 * This is the mechanism behind "the user cannot break the template". A
 * ProseMirror schema is a hard constraint, not a convention: because a body may
 * contain only these nodes and these marks, pasting a table from Word, a
 * `<div style="font-family:Comic Sans">` or a 40 px red heading cannot produce
 * those things. The schema coerces or drops them.
 *
 * `@tiptap/starter-kit` is deliberately not used — it bundles headings, code
 * blocks, blockquotes, horizontal rules and strike, and a deliberately smaller
 * schema is the entire point.
 *
 * Not here, each for a stated reason: font family, size and colour (there is no
 * per-instance styling anywhere in the model), alignment, underline (it looks
 * like a broken link), highlight (it breaks the palette), tables (they do not
 * survive to DOCX and print badly at A4), images (scope), code blocks
 * (irrelevant), and blockquote — which is a *section type*, so it stays under
 * app control rather than becoming an inline choice.
 *
 * Heading level is not an inline choice either. A heading is a property of the
 * section, which is why a document cannot go h2 → h4.
 */
export function sectionBodyExtensions(placeholder: string) {
  return [
    Document,
    Paragraph,
    Text,
    Bold,
    Italic,
    HardBreak,
    BulletList,
    OrderedList,
    ListItem,
    ListKeymap,
    UndoRedo,
    Placeholder.configure({ placeholder }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      /**
       * Only schemes a newsletter recipient can act on, and the renderer's own
       * predicate rather than a second copy of the list.
       *
       * `protocols` is not the option that does this: TipTap *appends* it to a
       * built-in set that already carries `ftp`, `callto`, `sms`, `cid` and
       * `xmpp`, so passing four names there narrows nothing. Only
       * `isAllowedUri` replaces the check. Sharing `safeHref` with
       * `renderInline` is what keeps a pasted link from being accepted here and
       * then silently dropped by the preview beside it — and it is the same
       * rule `EditorToolbar` already applies to a typed one.
       */
      isAllowedUri: (uri) => safeHref(uri) !== undefined,
      HTMLAttributes: { rel: "noopener noreferrer" },
    }),
  ];
}

/**
 * Paste sanitisation. The schema already drops alien nodes, but stripping the
 * attributes first keeps ProseMirror from having to reconcile a wall of Word's
 * `mso-` declarations, and removes the class of paste where a `style` attribute
 * survives on an element the schema does keep.
 */
export function stripAlienStyles(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|meta|link)[\s\S]*?<\/\1>/gi, "")
    .replace(/\s(style|class|id|face|color|bgcolor|width|height|align)="[^"]*"/gi, "")
    .replace(/\s(style|class|id|face|color|bgcolor|width|height|align)='[^']*'/gi, "");
}
