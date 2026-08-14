# Nyhedsbrevsgenerator til faglig klub — Implementation Plan

**Status:** Proposal, awaiting review. No application code written.
**Target stack:** Bun 1.3 · Astro 7.2 · Svelte 5 (runes) · UnoCSS 66 (`presetWind4`) · TypeScript strict
**Binding conventions:** `.augment/rules/bun-unocss-dev-pro.md`
**Plan language:** English. All interface-copy examples are Danish first, English second.

---

## 0. Preconditions and blockers

Two items must be resolved before Milestone 5 (visual identity). Neither blocks Milestones 1–4.

| Item | Status | Impact |
| --- | --- | --- |
| `018-ishoej.svg` | **Not present in the repository or workspace** | Blocks exact palette extraction and logo geometry |
| `018-ishoej.png` | **Not present in the repository or workspace** | Blocks DOCX/clipboard logo embedding |

The brief describes both files as attached; neither exists on disk. This plan therefore specifies a **drop-in contract** (§11.3) so that adding the two files completes the visual layer without refactoring, and anchors the provisional palette on Danmarks Lærerforening's own published identity — `#253154` navy, verified from the `theme-color` and `msapplication-TileColor` meta tags on `dlf.org`, plus the gold/yellow the DLF mark uses in its footer treatment. **Every colour marked `provisional` in §11.4 must be re-derived from the actual SVG before the design is signed off.**

Also noted: the `frontend-design` skill referenced in the brief is not available in this runtime (runtime skill discovery is disabled). This plan proceeds without it.

---

## 1. Feasibility conclusion

**Feasible, and comfortably so.** Every hard requirement has an established, backend-free browser solution, and none of them pull against each other:

- Deterministic Danish text parsing is ordinary string work; it needs a disciplined rule registry, not machine learning.
- A restricted WYSIWYG surface over a schema we control is exactly what ProseMirror/TipTap is for.
- A faithful A4 preview and multi-page PDF are the same problem, solved once by CSS Paged Media (Paged.js) and printed by the browser.
- Real DOCX generation in the browser is a solved problem (`docx` v9, `Packer.toBlob()`).
- Dual-format clipboard is a stable, if permission-sensitive, browser API in all four target browsers as of 2026.
- Two independent language axes are a small amount of typed data plus two persistent stores — no i18n framework required.

**The one honest caveat, stated up front:** a true one-click *"Hent PDF"* download is **not** achievable in v1 without either rasterising the document (unacceptable — kills selectable text and logo sharpness) or hand-building a PDF typesetter (weeks of work, poor Danish line-breaking). Version 1 delivers **"Udskriv eller gem som PDF"** — the browser print dialog operating on an already-paginated, print-perfect document. §12 explains the trade-off in full and specifies the copy that makes this feel deliberate rather than deficient.

**Realistic effort:** 8 milestones, roughly 5–7 focused working weeks for one developer, with a usable end-to-end product from Milestone 4 onward.

**Principal risks** (detail in §21): Paged.js maintenance staleness (last npm publish 2023), Safari's 7-day eviction of script-writable storage, and parser precision on genuinely messy input.

---

## 2. Decision table

| Area | Options considered | Recommendation | Reasoning | Main trade-off |
| --- | --- | --- | --- | --- |
| **Base framework** | Astro 7 static; bare Vite + Svelte SPA; SvelteKit static adapter | **Astro 7, `output: "static"`** | Zero JS on the help/privacy pages, one island for the workspace, built-in i18n routing for the static chrome, `astro:assets` for the logo. Also the binding house stack. | Astro's routing adds little for a one-screen tool; the win is on the surrounding static pages, not the app itself. |
| **Island framework** | Svelte 5, Preact, React, Vue | **Svelte 5 (runes)** | Smallest runtime for one large stateful island; compiled fine-grained reactivity re-renders a live A4 preview on every keystroke without VDOM diffing; `.svelte.ts` classes give a clean document-model store; mandated by house rules. | Smaller ecosystem of ready-made editor wrappers than React — mitigated by using TipTap headless (§6). |
| **Editor** | TipTap 3, Lexical, raw ProseMirror, Quill, Editor.js | **TipTap 3 core, headless, no UI packages** | Framework-agnostic (mounts on a DOM node inside a Svelte island); strict ProseMirror schema is precisely the "user cannot break the template" mechanism; best-in-class paste transformation; JSON output maps cleanly to our own model. | ProseMirror is a large conceptual surface; ~90 KB gz for core + pm + our extension set. |
| **Editor architecture** | One editor over the whole document; app-owned blocks with per-section rich-text editors | **App-owned block structure, TipTap per section body** | Section reorder becomes a plain array move (trivially keyboard-accessible); metadata (deadline, owner) uses real labelled form inputs, not node views; block structure is structurally unbreakable because it lives outside the editor. | No cross-section selection; several ProseMirror instances (mitigated by lazy mount on first focus). |
| **Source of truth** | TipTap JSON; custom `NewsletterDoc` | **Custom `NewsletterDoc`; TipTap JSON is an editing detail** | One model drives editor, preview, print, DOCX, clipboard and drafts. Export code never imports TipTap. | Two bidirectional converters to write and test. |
| **Auto-formatting** | Rule engine; LLM; hybrid | **Deterministic rule registry, Danish rules first-class** | No backend, no keys, no cost, no latency, fully testable, privacy-safe by construction. | Cannot handle genuinely unstructured prose as well as an LLM; mitigated by an explicit review step (§10.5). |
| **Localisation** | `i18next`, `astro-i18next`, Paraglide, hand-rolled typed catalogs | **Hand-rolled typed catalogs + 2 nanostores** | ~60 lines of code, compile-time completeness enforcement, no runtime framework in the bundle, third language = one file. | No plural/ICU machinery — we add the two plural rules we actually need. |
| **UI language mechanism** | Route-per-locale only; client-only strings; hybrid | **Astro i18n routes for static chrome + both catalogs in the island, URL kept in sync** | Instant switching with no navigation and no editor-state loss; reload lands on the correct prefix so there is no flash. | Both catalogs ship (~3 KB gz). Accepted for instant, state-preserving switching. |
| **PDF** | Print CSS only; jsPDF + html2canvas; jsPDF/pdf-lib text API; **Paged.js** + print | **Paged.js paginates both the on-screen preview and the printed document; native print CSS is the always-present fallback** | Only browser-native route that gives real page boxes, in-content page numbers, running headers/footers, and *cross-browser-uniform* orphan/widow control (Firefox does not implement `orphans`/`widows`). Preview matches export by construction. | pagedjs 0.4.3, last npm publish 2023 — maintenance risk; ~120 KB. Fallback path is mandatory (§21.1). |
| **PDF trigger** | Direct download button; print dialog | **Print dialog, honestly labelled "Udskriv eller gem som PDF"** | A true download requires a generator library that would rasterise or reimplement typesetting. Print keeps text selectable, logo vector, fonts real. | One extra user step and a browser-owned dialog we cannot style. |
| **DOCX** | `docx` (dolanmiu); `@turbodocx/html-to-docx`; HTML-in-`.doc` | **`docx` v9.7 with `Packer.toBlob()`** | Real OOXML, first-class headers/footers, `PageNumber`, numbering, `ImageRun`, run-level `w:lang`. HTML-conversion libraries give us far less control over the exact structure we need. | We hand-map every block type; ~180 KB gz including jszip. |
| **DOCX logo** | Rasterise SVG in-browser at export; use supplied PNG; build-time high-res PNG | **Build-time high-res PNG from the SVG (`@resvg/resvg-js`), supplied PNG as fallback** | Deterministic, no canvas/CORS tainting, no runtime cost, guaranteed to render in older Word, LibreOffice and Google Docs (which handle DOCX-embedded SVG poorly). | One build step; the PNG is a build artefact that must be regenerated if the SVG changes. |
| **DOCX fonts** | Brand fonts by name; embed fonts; universally installed fonts | **Georgia (headings) + Calibri (body), documented mapping** | A DOCX that renders correctly on every machine beats one that matches the brand font on a minority of them. Word's substitution for unknown fonts is unpredictable. | DOCX typography deviates from PDF. Already expected and stated (§13.6). |
| **Clipboard** | `writeText` only; `ClipboardItem` with `text/html` + `text/plain` | **`ClipboardItem` dual-format, with `execCommand` and manual-select fallbacks** | Preserves headings, lists, links and info boxes when pasting into Word, Outlook and Gmail. | Permission and user-gesture constraints; Safari requires synchronous blob construction. |
| **Draft storage** | localStorage only; IndexedDB only; split | **Preferences → localStorage (`@nanostores/persistent`); documents → IndexedDB (`idb-keyval`)** | Preferences must resolve synchronously at boot to avoid a language flash; documents are larger and must not block the main thread on every autosave. `idb-keyval` is 4 functions and ~1.1 KB. | Two storage mechanisms — each with one clear, non-overlapping reason. |
| **Workspace shape** | Wizard; tabs; unified split view | **Guided entry screen → unified split workspace** | The first paste needs guidance; everything after it is iterative, and a wizard would force repeated navigation. | The split view needs a deliberate tablet/mobile strategy (§4.4). |
| **Fonts (screen/PDF)** | Inter; Source Sans 3 + Source Serif 4; system stack | **Source Sans 3 (body/UI) + Source Serif 4 (display), self-hosted via Fontsource** | SIL OFL, complete Danish coverage, designed to harmonise, warmer and more humane than Inter in running text. Self-hosting means no third-party request — relevant for a union's GDPR posture. | ~120 KB of variable font files (subset to Latin). |
| **Styling** | UnoCSS `presetWind4` | **UnoCSS `presetWind4` with a project theme** | House stack; atomic CSS with a token-driven theme; print styles authored as ordinary CSS in one layer. | Dynamic class strings are forbidden — semantic variants must be full literal classes or safelisted. |
| **shadcn** | `shadcn-svelte` + `unocss-preset-shadcn`; none | **None for v1** | The UI needs roughly six primitives (button, select, dialog, tabs, toast, tooltip). Pulling in bits-ui + tailwind-merge + a preset bridge to get them is disproportionate. | If the component set grows past ~12 primitives, revisit. |
| **Validation** | Zod; hand-written type guards | **Zod 4 for the persisted-draft schema only** | Drafts are versioned data read back from IndexedDB across releases; a schema with `safeParse` turns a corrupt or stale draft into a recoverable error instead of a crash. | ~14 KB gz — paid once, only on the storage boundary. |

---

## 3. Recommended product experience and user flow

### 3.1 Design premise

The user is a teacher, a `tillidsrepræsentant` or a `kredsstyrelsesmedlem`, working under time pressure, on a school laptop, probably right after a meeting. They have a wall of notes in their clipboard. They are not designers and will not learn a tool.

The product therefore makes exactly one promise: **paste your notes, get a newsletter that looks like the kreds made it.** Everything else is subordinate to that promise.

Three principles follow:

1. **The first screen is a paste target, not a dashboard.** Nothing to configure, nothing to choose. One large text area and one button.
2. **The engine commits to a result, then invites correction.** It never asks "is this a heading?" mid-parse. It decides, shows what it decided, and flags only what it was unsure about.
3. **The user cannot produce an ugly document.** Formatting choice is deliberately scarce. There is no font picker, no colour picker, no alignment control.

### 3.2 The main flow

```
  ①  Indsæt tekst          ②  Formatér          ③  Gennemse og redigér       ④  Eksportér
     Paste text                Format               Review and edit             Export
  ┌──────────────┐         ┌──────────┐        ┌──────────────────┐       ┌─────────────┐
  │ Full-screen  │  ────►  │ Runs in  │ ────►  │ Split workspace  │ ────► │ Export bar  │
  │ paste screen │         │  <150ms  │        │ Editor ‖ Preview │       │ in-workspace│
  └──────────────┘         └──────────┘        └──────────────────┘       └─────────────┘
        ▲                                              │                         │
        └──────── "Indsæt mere tekst" ─────────────────┴─────────────────────────┘
                  (appends, never replaces)
```

**Step 2 is not a screen.** Parsing 8 A4 pages of text with a rule registry takes single-digit milliseconds. Showing a spinner would invent ceremony. The transition from paste screen to workspace *is* the formatting step, and it is animated as a single settle (respecting `prefers-reduced-motion`).

**Steps 3 and 4 are one screen.** Export is a persistent bar in the workspace, not a destination. The user never navigates away from their document to export it.

### 3.3 Why not a wizard, and why not pure tabs

A wizard is correct when steps are sequential and non-repeating. Here, step 3 is a loop: edit, look at preview, edit, export, notice a typo, edit, export again. A wizard would charge navigation cost on every lap. Tabs alone are worse still on desktop — they hide the preview exactly when the reassurance of seeing it matters most.

The recommendation is therefore a **guided entry screen followed by a unified workspace**, with tabs appearing *only* below the `lg` breakpoint where a split view cannot show both panes at a usable width (§4.4).

### 3.4 The review affordance

After parsing, the workspace opens with a dismissible review strip:

> **Vi har fundet 6 afsnit, 1 dagsorden og 3 handlinger. Tjek de 2 punkter, vi var i tvivl om.**
> *We found 6 sections, 1 agenda and 3 action items. Check the 2 items we were unsure about.*

Low-confidence blocks (§10.6) carry an unobtrusive marker in the editor pane — a dotted left rule plus the word **Usikker** / *Uncertain*, never colour alone. Clicking the strip's counter walks the user through them. Dismissing the strip is permanent for that draft.

This is the mechanism that makes a deterministic parser acceptable: it is allowed to be wrong, as long as it is honest about where.

### 3.5 Editing model

- **Structure is manipulated in the editor pane** — add, delete, reorder, retype a section.
- **Text is edited inline** in that section's rich-text field.
- **The preview is read-only but interactive**: clicking any block scrolls the editor pane to the matching card and focuses it. This gives the directness of edit-in-place without putting a text caret inside a CSS-scaled container (§4.4 explains why that matters).

---

## 4. Information architecture

### 4.1 Routes

| Route (da) | Route (en) | Rendering | JS |
| --- | --- | --- | --- |
| `/` | `/en/` | Static shell + workspace island | Island only |
| `/hjaelp` | `/en/help` | Fully static | None |
| `/privatliv` | `/en/privacy` | Fully static | None |
| `/om` | `/en/about` | Fully static | None |

`astro.config.mjs` uses `i18n: { defaultLocale: "da", locales: ["da", "en"], routing: { prefixDefaultLocale: false } }`. Danish is unprefixed and is the default; English lives under `/en/`.

The three content pages ship **zero JavaScript**. That is not a micro-optimisation — the privacy page in particular should be provably inert.

### 4.2 Workspace regions

```
┌─ AppHeader ───────────────────────────────────────────────────────────┐
│  [logo]  Nyhedsbrev til faglig klub          [DA|EN]  [Kladder]  [?]  │
├─ ReviewStrip (conditional, dismissible) ──────────────────────────────┤
├─ EditorPane ──────────────────────┬─ PreviewPane ──────────────────────┤
│  DocumentHeaderCard               │   A4 page 1                        │
│    title / subtitle / date /      │   A4 page 2                        │
│    time / location                │   …                                │
│  SectionCard × n                  │   [zoom −  100%  +]  [1/3]         │
│  AddSectionMenu                   │                                    │
├─ ExportBar (sticky, spans both panes) ─────────────────────────────────┤
│  [Udskriv eller gem som PDF] [Hent Word (.docx)] [Kopiér nyhedsbrev]   │
│  Gemt kl. 14.32 · Kladden ligger i din browser                         │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Settings surfaces

Three distinct things, three distinct places, deliberately never merged:

| Setting | Location | Scope |
| --- | --- | --- |
| **Interface language** | Header, always visible | The application chrome |
| **Document language** | Document settings panel, inside the editor pane | Generated labels, dates, export metadata |
| **Document metadata** (kreds name, contact, footer line) | Same panel | Header/footer content |

Placing the document language *inside the document*, next to the title, is what makes the two-axis model legible without explanation: one control lives with the app, the other lives with the paper.

### 4.4 Responsive strategy

| Breakpoint | Layout | Preview |
| --- | --- | --- |
| `≥ 1280px` | Split, editor `minmax(420px, 1fr)` / preview `auto` | A4 at natural size or fit-to-height, whichever is smaller |
| `1024–1279px` | Split, preview scaled to fit | A4 scaled 55–80% |
| `768–1023px` | Tabs: `Redigér` / `Forhåndsvisning` | Full-width, scaled to fit |
| `< 768px` | Tabs, editor default | Full-screen sheet, pinch-zoom enabled |

**The scaling technique:** the preview root is laid out at a true `210mm` width and scaled with `transform: scale(var(--preview-scale))` on a wrapper whose height is set to `scrollHeight * scale`. `zoom` is rejected — its interaction with `getBoundingClientRect` and print is inconsistent across engines.

**This is precisely why the preview is not editable.** ProseMirror computes caret and selection coordinates from `getBoundingClientRect`; inside a `transform: scale()` ancestor, core positioning survives but drag handles, gap cursors and any floating UI drift. Keeping the editable surface at scale 1 in the editor pane sidesteps an entire class of bugs, on every browser, permanently. The click-through mapping (§3.5) recovers the directness we gave up.

---

## 5. Text wireframes

### 5.1 Entry screen — `/`

```
┌────────────────────────────────────────────────────────────────────────┐
│  [Ishøj Lærerkreds]                                    [ DA | EN ]  [?]│
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│         Nyhedsbrev til faglig klub                                     │
│         Sæt dine noter ind. Vi sætter dem op.                          │
│                                                                        │
│    ┌──────────────────────────────────────────────────────────────┐    │
│    │ Sæt din tekst ind her — referat, dagsorden eller noter.       │    │
│    │                                                              │    │
│    │                                                              │    │
│    │                                                              │    │
│    │                                                     0 tegn   │    │
│    └──────────────────────────────────────────────────────────────┘    │
│                                                                        │
│    [ Formatér nyhedsbrev ]      eller  [ Start med et tomt nyhedsbrev ]│
│                                                                        │
│    ─────────────────────────────────────────────────────────────────   │
│    Du har en gemt kladde: "Klubmøde 14. august" · Gemt i går kl. 16.02 │
│    [ Fortsæt ]  [ Slet ]                                               │
│                                                                        │
│    Alt bliver i din browser. Intet sendes til en server.               │
│    [Sådan behandler vi dine data]                                      │
└────────────────────────────────────────────────────────────────────────┘
```

English: *"Newsletter for your local union meeting" / "Paste your notes. We lay them out." / "Paste your text here — minutes, agenda or notes." / "Format newsletter" / "Start with a blank newsletter" / "You have a saved draft" / "Continue" / "Delete" / "Everything stays in your browser. Nothing is sent to a server." / "How we handle your data".*

Notes:
- The textarea is focused on load. A user who lands here and presses `Ctrl/⌘+V` then `Enter` gets a formatted newsletter with zero clicks.
- The draft-resume row is absent on a genuine first run, so the first-run screen is exactly three elements.
- The privacy line is a permanent fixture, not a dismissible banner.

### 5.2 Workspace — desktop

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ [logo] Nyhedsbrev til faglig klub              [DA|EN] [Kladder ▾] [Hjælp] [Ryd]   │
├────────────────────────────────────────────────────────────────────────────────────┤
│ ⓘ Vi fandt 6 afsnit, 1 dagsorden og 3 handlinger. 2 punkter er usikre. [Vis] [✕]  │
├───────────────────────────────────────┬────────────────────────────────────────────┤
│ REDIGÉR                               │ FORHÅNDSVISNING            [− 75% +] 1/3  │
│                                       │                                            │
│ ┌─ Dokument ──────────────── [▾] ─┐   │  ┌──────────────────────────────────────┐  │
│ │ Titel     [Klubmøde august    ] │   │  │ ┌──┐                    Ishøj        │  │
│ │ Undertit. [Referat fra mødet  ] │   │  │ │LO│  IShøj Lærerkreds   Lærerkreds  │  │
│ │ Dato      [14.08.2026        📅]│   │  │ └──┘  ─────────────────────────────  │  │
│ │ Tid       [15.30 – 17.00      ] │   │  │                                      │  │
│ │ Sted      [Lærerværelset      ] │   │  │  Klubmøde august                     │  │
│ │ Dokumentsprog  ( Dansk    ▾ )   │   │  │  Referat fra mødet                   │  │
│ └─────────────────────────────────┘   │  │                                      │  │
│                                       │  │  fredag den 14. august 2026          │  │
│ ┌─ Indledning ────── [↑][↓][⋯][✕]─┐   │  │  kl. 15.30–17.00 · Lærerværelset     │  │
│ │ [B][I][🔗] [•][1.] [H] [↺][↻]   │   │  │                                      │  │
│ │ Kære kolleger. Her er et kort   │   │  │  Kære kolleger. Her er et kort       │  │
│ │ referat fra klubmødet…          │   │  │  referat fra klubmødet…              │  │
│ └─────────────────────────────────┘   │  │                                      │  │
│                                       │  │  ▍DAGSORDEN                          │  │
│ ┌─ Dagsorden ─────── [↑][↓][⋯][✕]─┐   │  │   1. Godkendelse af referat          │  │
│ │ 1. Godkendelse af referat       │   │  │   2. Nyt fra kredsen                 │  │
│ │ 2. Nyt fra kredsen              │   │  │   3. Arbejdstid                      │  │
│ │ 3. Arbejdstid                   │   │  │                                      │  │
│ └─────────────────────────────────┘   │  │  ✔ BESLUTNINGER                      │  │
│                                       │  │  Klubben bakker op om forslaget.     │  │
│ ┌─ Beslutninger ─ ⋯ usikker ──────┐   │  │                                      │  │
│ │ ⋮ Klubben bakker op om forslaget│   │  └──────────────────────────────────────┘  │
│ └─────────────────────────────────┘   │            side 1 af 3                     │
│                                       │                                            │
│ [ + Tilføj afsnit ▾ ]                 │                                            │
├───────────────────────────────────────┴────────────────────────────────────────────┤
│ [Udskriv eller gem som PDF] [Hent Word (.docx)] [Kopiér nyhedsbrev]                │
│ Gemt kl. 14.32 · Kladden ligger kun i din browser.            [Gem som kladde…]    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

English: *"Edit" / "Preview" / "Document" / "Title" / "Subtitle" / "Date" / "Time" / "Location" / "Document language" / "Introduction" / "Agenda" / "Decisions" / "uncertain" / "Add section" / "Print or save as PDF" / "Download Word (.docx)" / "Copy newsletter" / "Saved at 14.32 · The draft stays only in your browser." / "Save as draft…" / "page 1 of 3".*

### 5.3 Section card, expanded — action items

```
┌─ Handlinger ─────────────────────────────── [↑] [↓] [⋯] [✕] ─┐
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Opgave    [Indkalde til møde om arbejdstid           ] │  │
│  │ Ansvarlig [Mette                ]  Frist [01.09.2026] │  │
│  │                                              [Fjern]   │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ Opgave    [Sende referat til alle                    ] │  │
│  │ Ansvarlig [Jens                 ]  Frist [20.08.2026] │  │
│  │                                              [Fjern]   │  │
│  └────────────────────────────────────────────────────────┘  │
│  [ + Tilføj handling ]                                       │
└──────────────────────────────────────────────────────────────┘
```

Metadata is a labelled form field, never a rich-text region. This is the concrete payoff of the hybrid editor architecture: `Ansvarlig` gets a real `<label for>`, a real `<input>`, and a real date picker with Danish formatting — none of which a ProseMirror node view would give for free.

English: *"Action items" / "Task" / "Responsible" / "Deadline" / "Remove" / "Add action item".*

### 5.4 Section type menu

```
[ + Tilføj afsnit ▾ ]
   ┌───────────────────────────────┐
   │  Overskrift og tekst          │   Heading and text
   │  Dagsorden                    │   Agenda
   │  Beslutninger                 │   Decisions
   │  Handlinger                   │   Action items
   │  Vigtig besked                │   Important notice
   │  Citat                        │   Quote
   │  Punktliste                   │   Bulleted list
   │  Nummereret liste             │   Numbered list
   │  Kontakt                      │   Contact details
   │  Afslutning og hilsen         │   Closing and signature
   └───────────────────────────────┘
```

Ten types. Not eleven, not twenty. Each maps to exactly one visual treatment in the template, so the menu *is* the design system as far as the user is concerned.

### 5.5 Copy result dialog

```
┌─ Kopiér nyhedsbrev ─────────────────────────────────┐
│                                                     │
│  ✔  Kopieret                                        │
│                                                     │
│  Sæt ind i Word, Outlook eller Gmail med Ctrl+V.    │
│                                                     │
│  Overskrifter, lister, links og farver følger med.  │
│  Logo og sidefod følger ikke med — brug PDF eller   │
│  Word, hvis du har brug for dem.                    │
│                                                     │
│                                        [ Luk ]      │
└─────────────────────────────────────────────────────┘
```

English: *"Copy newsletter" / "Copied" / "Paste into Word, Outlook or Gmail with Ctrl+V." / "Headings, lists, links and colours are included." / "The logo and footer are not included — use PDF or Word if you need them." / "Close".*

Honesty about what survives the clipboard is a feature. A user who pastes into Outlook and finds the logo missing will not trust the tool again; a user who was told beforehand will not even notice.

### 5.6 Drafts panel

```
┌─ Kladder ───────────────────────────────────────────┐
│  Kladder ligger i din browser. De bliver ikke sendt │
│  nogen steder hen, og de er ikke krypterede.        │
│                                                     │
│  ● Klubmøde august            14.08.2026 kl. 14.32  │
│    [Åbn] [Omdøb] [Slet]                             │
│  ○ Referat juni               11.06.2026 kl. 09.14  │
│    [Åbn] [Omdøb] [Slet]                             │
│                                                     │
│  [ Gem nuværende som kladde ]                       │
│  [ Hent alle kladder som fil ] [ Indlæs fra fil ]   │
│  ─────────────────────────────────────────────────  │
│  [ Slet alle gemte data ]                           │
└─────────────────────────────────────────────────────┘
```

English: *"Drafts" / "Drafts stay in your browser. They are not sent anywhere, and they are not encrypted." / "Open" / "Rename" / "Delete" / "Save current as draft" / "Download all drafts as a file" / "Load from file" / "Delete all stored data".*

The file export/import pair is not a nice-to-have. It is the mitigation for Safari's 7-day storage eviction (§15.5) and the only durable backup the user has.

---

## 6. Recommended technical architecture

### 6.1 Layer diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│  Astro static shell   ·  src/pages/**  ·  zero JS except the island   │
├───────────────────────────────────────────────────────────────────────┤
│  Workspace island (Svelte 5, client:load)                             │
│    EditorPane ── SectionCard ── TipTap instance (per section body)    │
│    PreviewPane ── PagedPreview (Paged.js in an isolated subtree)      │
│    ExportBar                                                          │
├───────────────────────────────────────────────────────────────────────┤
│  State (.svelte.ts runes classes + nanostores for cross-island prefs) │
│    DocumentStore  ·  $uiLang  ·  $docLang  ·  $saveStatus             │
├───────────────────────────────────────────────────────────────────────┤
│  ▸▸  NewsletterDoc  —  the single source of truth  ◂◂                 │
├──────────┬──────────┬───────────┬───────────┬─────────────────────────┤
│ parser/  │ render/  │ export/   │ export/   │ export/                 │
│ (text →  │ html.ts  │ pdf.ts    │ docx.ts   │ clipboard.ts            │
│  doc)    │ (preview)│ (Paged.js)│ (docx v9) │ (HTML + plain)          │
├──────────┴──────────┴───────────┴───────────┴─────────────────────────┤
│  i18n/  (ui catalogs)   ·   labels/  (document labels)   ·  storage/  │
└───────────────────────────────────────────────────────────────────────┘
```

The critical invariant, and the thing every code review should check: **`export/` never imports from `editor/`, and nothing under `export/` imports TipTap.** Exports are pure functions of `NewsletterDoc` plus a `DocLang`. This is what makes them unit-testable in `bun test` with no DOM and no editor.

### 6.2 Why Astro survives scrutiny here

An honest challenge: this is a single-screen tool. Astro's routing, content collections and partial hydration are mostly unused. Would a bare Vite + Svelte SPA be simpler?

Marginally — and it would cost:

- The privacy, help and about pages become client-rendered, so a page whose entire purpose is to state "nothing runs against you here" would arrive as an empty div plus a JS bundle. That is a substantive credibility problem, not an aesthetic one.
- Locale-prefixed URLs (`/privatliv`, `/en/privacy`) with correct server-rendered `<html lang>` would have to be hand-built.
- We would lose `astro:assets` build-time image processing for the logo and the build-time SVG→PNG step for DOCX.

Astro's cost over a bare SPA is one config file. Keep Astro.

### 6.3 Hydration

`client:load` on the workspace island. This is one of the rare legitimate uses: the island *is* the page's reason to exist, and it must be interactive above the fold on first paint. `client:visible` would introduce a hydration delay on the primary interaction target.

Everything else — header chrome on static pages, footer, help content — is plain Astro markup with no directive. The language switch on the three static pages is a plain `<a>` to the sibling locale route: no JavaScript at all.

### 6.4 Dependency budget

| Package | Purpose | Approx. gz |
| --- | --- | --- |
| `svelte` (runtime) | Island framework | ~11 KB |
| `@tiptap/core` + `@tiptap/pm` + 8 extensions | Rich text | ~90 KB |
| `pagedjs` | Pagination | ~40 KB |
| `docx` + `jszip` | DOCX | ~180 KB (lazy) |
| `nanostores` + `@nanostores/persistent` | Prefs | ~1 KB |
| `idb-keyval` | Draft storage | ~1 KB |
| `zod` | Draft schema validation | ~14 KB |
| Fonts (Latin subset, 2 variable families) | Typography | ~120 KB |

**Initial workspace payload target: under 160 KB gz excluding fonts.** `docx` is dynamically imported on first DOCX export and never enters the initial bundle. `pagedjs` is dynamically imported when the preview pane first mounts — which on mobile (tabs, preview not default) means it is not loaded until the user asks for it.

### 6.5 Explicitly not used

No adapter, no SSR, no middleware, no Astro Actions, no API routes, no content collections, no `<ClientRouter />`. `output: "static"`, `dist/` to any static host. The absence of a server is a product feature (§15) and must be visible in the config.

---

## 7. Astro integration and editor choice

### 7.1 Editor comparison

| Criterion | **TipTap 3** | Lexical | Raw ProseMirror | Quill 2 | Editor.js |
| --- | --- | --- | --- | --- | --- |
| Svelte integration | Headless core, mounts on a DOM node — clean | Vanilla core exists; ecosystem and docs are React-first | Same as TipTap, more wiring | Fine | Fine |
| Schema control | **Strict, declarative, enforced on paste** | Node registry, enforced by transforms | Strict | Delta model — inline-centric, weak block typing | JSON block blobs, no inline schema |
| Paste behaviour | `transformPastedHTML`, `clipboardTextParser`, schema coercion — best in class | Good, more manual | Best, most manual | Coerces to Delta, lossy for blocks | Weak |
| Bundle | ~90 KB gz for our set | ~70 KB gz | ~65 KB gz | ~45 KB gz | ~90 KB gz |
| Structure → our model | JSON, trivially mappable | EditorState, mappable | Node tree, mappable | Delta, awkward for blocks | Direct but too loose |
| Accessibility | ProseMirror contenteditable, mature | Mature | Mature | Mature | Known gaps |
| Maintenance | Very active (3.30.1, Aug 2026) | Very active | Very active | Active | Slower |
| Docs | Excellent | Good but React-shaped | Reference-grade, steep | Good | Adequate |

**Recommendation: TipTap 3, used headlessly.** The deciding factor is not features — it is that a ProseMirror schema is a *hard constraint*, not a convention. When we declare that a section body may contain only `paragraph`, `bulletList`, `orderedList`, `listItem`, `hardBreak` and the marks `bold`, `italic`, `link`, then pasting a table from Word, a `<div style="font-family:Comic Sans">`, or a 40 px red heading cannot produce those things. The schema coerces or drops them. "The user cannot break the template's visual consistency" stops being a discipline and becomes a property of the type system.

Lexical is a fine editor and slightly smaller, but its centre of gravity is React; on a Svelte island we would be maintaining glue against a moving target for no structural gain.

### 7.2 What we do *not* install

- `svelte-tiptap` — it declares peer dependencies on `@floating-ui/dom`, `@tiptap/extension-bubble-menu` and `@tiptap/extension-floating-menu`, none of which we want. Mounting TipTap by hand in a Svelte island is ~20 lines.
- Any `@tiptap/*` UI or Pro package.
- `@tiptap/starter-kit` — it bundles headings, code blocks, blockquotes, horizontal rules and strike. We want a deliberately smaller schema and will compose extensions individually.

### 7.3 Mounting pattern (illustrative, not final code)

```ts
// Inside a Svelte 5 island. Shown to fix the pattern, not to pre-empt implementation.
let el = $state<HTMLElement>();
let editor: Editor | undefined;

$effect(() => {
  if (!el || editor) return;
  editor = new Editor({
    element: el,
    extensions: sectionBodySchema,     // our fixed, minimal set
    content: inlineToTipTap(section.body),
    editorProps: {
      attributes: { "aria-label": t("editor.sectionBody"), lang: docLang },
      transformPastedHTML: stripAlienStyles,
    },
    onUpdate: ({ editor }) => doc.setBody(section.id, tipTapToInline(editor.getJSON())),
  });
  return () => { editor?.destroy(); editor = undefined; };
});
```

Three rules this pattern encodes:

1. **One `$effect`, with cleanup.** TipTap owns real DOM and event listeners; failing to `destroy()` on section removal leaks.
2. **Never write editor state back into the editor from a derived value.** The editor is uncontrolled; `NewsletterDoc` is updated *from* it. Feeding the model back in on every update causes cursor jumps and, with runes, an `effect_update_depth_exceeded` loop.
3. **Lazy mount on first focus.** Until focused, a section renders as static HTML from the model — identical markup to the preview. Mounting on `focusin` keeps a 15-section document at one or two live ProseMirror instances, and makes the post-parse first paint instant.

### 7.4 Editor feature set — final

Included, and nothing else:

| Feature | Rationale |
| --- | --- |
| **Bold**, *italic* | The only inline emphasis a newsletter needs |
| Link | Essential; auto-detects on paste, opens a small dialog for the label |
| Bulleted list, numbered list | Core newsletter structure |
| Undo / redo | Non-negotiable |
| Clear formatting | The escape hatch after a bad paste |
| Hard break | For addresses and signature blocks |

Deliberately excluded, with the reason: **font family, size, colour, alignment, underline** (looks like a broken link), **highlight colour** (breaks the palette), **tables** (do not survive to DOCX and print sensibly at A4), **images** (scope), **code blocks** (irrelevant), **blockquote as an inline choice** (it is a *section type*, so it stays under app control).

Heading level is not an inline mark either. A heading is a property of the section, set on the section card. This is the second structural guarantee: heading hierarchy cannot go `h2 → h4` because the user never chooses a level directly.

### 7.5 Three views of the same document

The workspace offers a small segmented control, `Redigér` / `Råtekst` / *Edit* / *Raw text*:

- **Redigér** — the structured section editor. Default.
- **Råtekst** — a plain textarea showing a canonical Markdown-ish serialisation of the document, editable, re-parsed on blur.

This earns its place for one specific and common workflow: the user pastes, the parse is 70% right, and it is faster to fix the raw text and re-run than to correct eight cards. It is also the honest escape hatch when the parser is simply wrong. Round-tripping is lossless for everything the parser can express; anything it cannot express (an action item's deadline, for instance) is serialised in a stable, human-readable form (`— Mette, frist 01.09.2026`) that the parser reads back.

Preview is not a third mode on desktop — it is always visible. On tablet and mobile it becomes a third tab.

---

## 8. Localisation architecture

### 8.1 Why not a framework

`i18next` is ~40 KB gz plus a React/Svelte binding, and gives us: interpolation, plurals, namespaces, lazy loading, formatting, and a plugin ecosystem. We need interpolation, two plural forms, and Danish-first fallback. Paraglide is compelling (compile-time, tree-shakeable) but adds a build step and a message-file format for what amounts to two TypeScript objects.

**Recommendation: typed message catalogs plus a ~60-line runtime.** The cost of this decision is one afternoon; the cost of the alternative is a permanent dependency and a build step.

### 8.2 Structure

```
src/i18n/
  types.ts        # Messages type, Lang union, helpers
  da.ts           # source of truth — the Danish catalog
  en.ts           # typed as Messages, so TS enforces completeness
  index.ts        # createTranslator, catalogs registry
  format.ts       # date, time, number, list formatting per locale
```

```ts
// src/i18n/da.ts — Danish is written first and defines the shape
export const da = {
  app: {
    title: "Nyhedsbrev til faglig klub",
    tagline: "Sæt dine noter ind. Vi sætter dem op.",
  },
  entry: {
    placeholder: "Sæt din tekst ind her — referat, dagsorden eller noter.",
    format: "Formatér nyhedsbrev",
    blank: "Start med et tomt nyhedsbrev",
    charCount: { one: "{n} tegn", other: "{n} tegn" },
  },
  export: {
    pdf: "Udskriv eller gem som PDF",
    pdfHint: "Vælg “Gem som PDF” i printdialogen.",
    docx: "Hent Word (.docx)",
    copy: "Kopiér nyhedsbrev",
    copied: "Kopieret",
    copyFailed: "Kunne ikke kopiere",
  },
  a11y: {
    langSwitch: "Skift sprog for brugerfladen",
    langChanged: "Brugerfladens sprog er skiftet til dansk.",
    previewRegion: "Forhåndsvisning af nyhedsbrevet",
    moveSectionUp: "Flyt afsnittet op",
  },
  // …
} as const;

export type Messages = typeof da;
```

```ts
// src/i18n/en.ts — the annotation is the completeness check
import type { Messages } from "./da";

export const en: Messages = {
  app: {
    title: "Newsletter for your local union meeting",
    tagline: "Paste your notes. We lay them out.",
  },
  // Omitting any key is a TypeScript error. CI fails. It cannot ship.
};
```

This is the whole trick, and it is worth stating plainly: **"no untranslated keys reach the user" is enforced by the compiler, not by a runtime check.** `Messages = typeof da` makes English structurally identical to Danish or the build fails. The runtime Danish fallback in §8.3 therefore exists only for defence in depth — against a hand-edited bundle or a future dynamic catalog — and a unit test asserts it never actually fires.

### 8.3 Runtime

```ts
// src/i18n/index.ts (shape, not final)
export type Lang = "da" | "en";

const catalogs: Record<Lang, Messages> = { da, en };

export function t(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const hit = resolve(catalogs[lang], key) ?? resolve(catalogs.da, key);
  if (hit === undefined) {
    if (import.meta.env.DEV) throw new Error(`Missing message: ${key}`);
    return key;                       // never a blank in production
  }
  return interpolate(hit, vars);
}
```

- `MessageKey` is a template-literal type of every dot path in `Messages`, so `t(lang, "export.pdf")` autocompletes and `t(lang, "export.pdfff")` fails to compile.
- Interpolation is `{name}` only. No expression evaluation, no HTML.
- Plurals: a key whose value is `{ one, other }` selects via `Intl.PluralRules(locale)`. Danish and English both have a simple one/other system, so this covers everything we need without an ICU parser.
- **Dev throws, production returns the key.** A missing key must be loud in development and never a blank space in production.

### 8.4 Adding a third language

1. Create `src/i18n/nb.ts`, annotate `: Messages`, translate until it compiles.
2. Add `"nb"` to the `Lang` union and the `catalogs` record.
3. Add a document-label pack in `src/labels/nb.ts` and a locale mapping in `format.ts`.
4. Add `"nb"` to Astro's `i18n.locales`.
5. Add a Danish rule-pack sibling in `src/parser/rules/nb.ts` *only if* automatic parsing of that language is wanted — the UI translation works without it.

No component changes. That is the test of the design, and it passes.

### 8.5 Document labels are a separate concern

```
src/labels/
  types.ts   # DocumentLabels
  da.ts      # "Dagsorden", "Beslutninger", "Handlinger", "Vigtigt", "Kontakt", …
  en.ts      # "Agenda", "Decisions", "Action items", "Important", "Contact", …
```

`DocumentLabels` is a *different type* from `Messages`, resolved by `$docLang`, never by `$uiLang`. Keeping them in separate modules with separate types makes the wrong wiring a compile error rather than a subtle bug. Export code imports `labels/`, never `i18n/`; UI code imports `i18n/`, and imports `labels/` only to render the preview.

### 8.6 Locale formatting

`src/i18n/format.ts` centralises every `Intl` call. Verified outputs for 14 August 2026, 15.30:

| Format | `da-DK` | `en-GB` |
| --- | --- | --- |
| `dateStyle: "full"` | `fredag den 14. august 2026` | `Friday 14 August 2026` |
| `dateStyle: "long"` | `14. august 2026` | `14 August 2026` |
| `dateStyle: "short"` | `14.08.2026` | `14/08/2026` |
| `timeStyle: "short"` | `15.30` | `15:30` |
| Date + time | `fredag den 14. august 2026 kl. 15.30` | `Friday 14 August 2026 at 15:30` |
| `Intl.ListFormat` | `Anne, Bo og Cecilie` | `Anne, Bo and Cecilie` |

Two things worth flagging, because both are easy to get wrong by hand:

- Danish uses a **full stop** as the time separator (`15.30`), not a colon. `Intl` gets this right; a hand-rolled formatter would not.
- Danish collation sorts `Æ Ø Å` **after** `Z`. Anywhere we sort user-visible strings (draft names), use `Intl.Collator(locale)`, never `Array.sort()`.

Time ranges are rendered with an en dash and non-breaking spaces: `kl. 15.30–17.00`.

### 8.7 Danish text integrity

- All source files are UTF-8; `<meta charset="utf-8">` on every page; the DOCX writer emits UTF-8 XML; clipboard blobs are `text/html;charset=utf-8`.
- **Unicode normalisation to NFC on every text ingress point** — paste, file import, draft load. Verified: `"a\u030A" === "\u00E5"` is `false`, but `"a\u030A".normalize("NFC") === "\u00E5"` is `true`. macOS clipboard and some PDF extractions produce decomposed `å`, which then fails naive `includes("å")` rule matching and renders inconsistently. Normalising once at the boundary removes an entire class of "it works on my machine" Danish bugs.
- Parser rules match case-insensitively using `toLocaleLowerCase("da-DK")`.

---

## 9. Interface language and document language

### 9.1 The two axes

| | Interface language (`$uiLang`) | Document language (`$docLang`) |
| --- | --- | --- |
| Controls | Buttons, labels, tooltips, dialogs, validation, status, help, empty states, ARIA labels, section-type names in the menu | Template-generated labels in the document, date/time formatting in the document, PDF and DOCX metadata, `lang` on the preview root |
| Default | `da` | Follows `$uiLang` **on first run only**, then independent |
| Stored | `localStorage["nl.uiLang"]` | Per document, in the draft; plus `localStorage["nl.docLang"]` as the default for new documents |
| Switch location | App header | Document settings panel |
| Affects user content | **Never** | **Never** |

The first-run coupling deserves a note: a brand-new user selecting English almost certainly wants an English document too, and forcing two switches would feel obtuse. But the moment `$docLang` is set explicitly — by the user or by loading a draft — the link is severed permanently for that document. A `docLangExplicit: boolean` flag on the document records this. A Danish newsletter written in an English interface is then fully supported, and so is the reverse.

### 9.2 First-run resolution order

```
1. URL locale prefix        (/en/…)  →  explicit intent from a shared link
2. localStorage["nl.uiLang"]         →  returning user
3. "da"                              →  ALWAYS. navigator.language is never consulted.
```

Step 3 is a hard requirement and must have a dedicated test. A Danish teachers' union tool opening in English on a machine with an English OS locale would be wrong; browser-language sniffing is explicitly forbidden here.

### 9.3 Switch mechanics

The switch is a two-option segmented control, not a `<select>` — with two languages, a dropdown costs an extra interaction for nothing:

```html
<div role="group" aria-label="Sprog / Language">
  <button type="button" aria-pressed="true"  lang="da" hreflang="da">Dansk</button>
  <button type="button" aria-pressed="false" lang="en" hreflang="en">English</button>
</div>
```

On activation, in this order:

1. `$uiLang.set(next)` — persisted to localStorage by `@nanostores/persistent`.
2. `document.documentElement.lang = next` — so screen readers switch voice immediately.
3. `history.replaceState(null, "", siblingPath)` — `/` ⇄ `/en/`. `replaceState`, not `pushState`: a language switch is not a navigation the Back button should undo, and `replaceState` does not reload, so **no editor state is lost and no re-parse occurs**.
4. Announce via a polite live region: **"Brugerfladens sprog er skiftet til dansk."** / *"Interface language changed to English."*
5. Return focus to the now-pressed button.

Note the announcement is rendered in the **new** language. Announcing a switch to English in Danish would be read by a Danish-voiced screen reader and be incomprehensible; the `lang` attribute is updated in step 2 before the live region text changes in step 4, so the assistive technology has already switched voice.

Because the URL is kept in sync, a reload serves the correct Astro route with the correct server-rendered `<html lang>` — no flash of the wrong language, ever.

### 9.4 Static-page switch

On `/hjaelp`, `/privatliv` and `/om` the switch is two `<a hreflang>` links to the sibling route. Zero JavaScript. The click also writes the preference — which, without JS, means the destination page writes it in a tiny inline script on load, guarded by the URL prefix. Roughly 5 lines, and it keeps the app and the static pages in agreement.

### 9.5 What the switch must never touch

`NewsletterDoc.blocks` is read-only to both switches. The regression test is explicit: seed a document containing `Beslutning: Klubben bakker op om forslaget. Ø Æ Å`, switch UI language, switch document language, switch both back, then deep-equal the document's content nodes against the original. Only `docLang` and generated labels may differ.

---

## 10. Structured document model

### 10.1 Design constraints

1. **Serialisable to JSON** — it goes into IndexedDB and a downloadable backup file.
2. **Versioned** — `schemaVersion` with a migration chain; a draft saved in v1 must open in v3.
3. **Editor-agnostic** — no TipTap or ProseMirror types anywhere in it.
4. **Renderer-neutral** — expressive enough for HTML, print, DOCX and clipboard, with no format-specific fields.
5. **Stable IDs** — every block has an id, so preview↔editor mapping, focus restoration and undo grouping all work.

### 10.2 The model

```ts
// src/model/types.ts — proposed shape, not implementation

export type DocLang = "da" | "en";
export type BlockId = string;                  // crypto.randomUUID()

/* ---------- inline layer ---------- */

export type InlineMark = "bold" | "italic";

export interface InlineText  { kind: "text";  text: string; marks?: InlineMark[] }
export interface InlineLink  { kind: "link";  href: string; text: string; marks?: InlineMark[] }
export interface InlineBreak { kind: "break" }

export type Inline = InlineText | InlineLink | InlineBreak;
export type RichText = Inline[];                // a paragraph's worth of inline content

/* ---------- block layer ---------- */

export interface BlockBase { id: BlockId; confidence?: Confidence; sourceRuleId?: string }

export interface HeadingBlock   extends BlockBase { type: "heading"; level: 2 | 3; text: string }
export interface ParagraphBlock extends BlockBase { type: "paragraph"; content: RichText }
export interface ListBlock      extends BlockBase { type: "list"; ordered: boolean; items: RichText[] }
export interface AgendaBlock    extends BlockBase { type: "agenda"; title?: string; items: AgendaItem[] }
export interface DecisionBlock  extends BlockBase { type: "decisions"; title?: string; items: RichText[] }
export interface ActionBlock    extends BlockBase { type: "actions"; title?: string; items: ActionItem[] }
export interface NoticeBlock    extends BlockBase { type: "notice"; tone: "info" | "important"; title?: string; content: RichText }
export interface QuoteBlock     extends BlockBase { type: "quote"; content: RichText; attribution?: string }
export interface ContactBlock   extends BlockBase { type: "contact"; title?: string; entries: ContactEntry[] }
export interface ClosingBlock   extends BlockBase { type: "closing"; content: RichText; signature?: string[] }

export type Block =
  | HeadingBlock | ParagraphBlock | ListBlock | AgendaBlock | DecisionBlock
  | ActionBlock  | NoticeBlock    | QuoteBlock | ContactBlock | ClosingBlock;

export interface AgendaItem  { id: BlockId; text: string; presenter?: string; minutes?: number }
export interface ActionItem  { id: BlockId; task: RichText; owner?: string; due?: IsoDate }
export interface ContactEntry{ id: BlockId; name?: string; role?: string; email?: string; phone?: string; url?: string }

/* ---------- section layer ---------- */

export interface Section {
  id: BlockId;
  heading?: { text: string; level: 2 | 3 };    // undefined = untitled lead section
  blocks: Block[];
  confidence?: Confidence;
}

/* ---------- document layer ---------- */

export type IsoDate = string;                  // "2026-08-14" — never a Date, never locale-formatted

export interface DocumentMeta {
  title: string;
  subtitle?: string;
  date?: IsoDate;
  timeStart?: string;                          // "15:30" — ISO-ish, formatted at render time
  timeEnd?: string;
  location?: string;
  organisation?: string;                       // "Ishøj Lærerkreds"
  footerNote?: string;
}

export interface NewsletterDoc {
  schemaVersion: 1;
  id: BlockId;
  docLang: DocLang;
  docLangExplicit: boolean;                    // see §9.1
  meta: DocumentMeta;
  intro?: RichText;
  sections: Section[];
  createdAt: string;                           // ISO 8601 UTC
  updatedAt: string;
}

export type Confidence = "high" | "medium" | "low";
```

### 10.3 Decisions embedded in the shape

**Dates are `IsoDate` strings, never `Date` objects and never formatted text.** `Date` does not survive `JSON.stringify`/`parse` round-trips as a `Date`, and a formatted string cannot be re-formatted when the document language changes. Storing `"2026-08-14"` means switching `docLang` re-renders `fredag den 14. august 2026` as `Friday 14 August 2026` with no data change — which is exactly the acceptance criterion in §23.

**Times are wall-clock strings, not timestamps.** A meeting at 15.30 is at 15.30 regardless of the reader's time zone. Introducing a time zone here would be an active bug.

**`RichText` is a flat array, not a tree.** Newsletters do not need nested inline structure. A flat array of marked runs converts to and from TipTap JSON in a few dozen lines, maps directly to DOCX `TextRun[]`, and serialises to clipboard HTML without a recursive walk.

**Headings live on `Section`, not free-floating.** This is the structural guarantee from §7.4 expressed in the type: a document cannot contain an orphan `h3` under an `h1`, because a section owns exactly one heading and the level is constrained to `2 | 3`. `h1` is reserved for the document title.

**`confidence` and `sourceRuleId` are part of the model.** They are what the review strip (§3.4) reads, and `sourceRuleId` makes parser bugs reportable: "the rule `da.heading.agenda` fired on this line" is a debuggable statement.

**No styling fields anywhere.** No colour, no size, no alignment, no CSS. If a block needs to look different, that is a new block type or a new `tone`, decided in the design system — not a per-instance override. This is what keeps every export consistent and every document recognisable.

### 10.4 Renderers

Five consumers, one model, each a pure function:

| Renderer | Signature | Notes |
| --- | --- | --- |
| Preview HTML | `(doc, labels) => string` | Semantic HTML with token classes; also used for a section's unfocused static render |
| Editor bridge | `RichText ⇄ TipTapJSON` | Two pure functions, property-tested for round-trip identity |
| Print/PDF | reuses Preview HTML | Same DOM, different stylesheet + Paged.js |
| DOCX | `(doc, labels) => Promise<Blob>` | `docx` v9 object graph |
| Clipboard | `(doc, labels) => { html, text }` | Inline-styled HTML + Markdown-ish plain text |

Because the print path *reuses the preview renderer's DOM*, "the preview matches the export" is not a testing burden — it is structurally true. Only the stylesheet differs.

---

## 11. Rule-based formatting strategy

### 11.1 Pipeline

```
raw text
  │
  ├─ 1. normalise    NFC · CRLF→LF · NBSP→space · strip zero-width · collapse 3+ blank lines
  ├─ 2. segment      → Line[] { text, index, indent, blankBefore, blankAfter }
  ├─ 3. classify     each line scored against the active rule packs → LineKind + confidence
  ├─ 4. group        consecutive same-kind lines → provisional blocks
  ├─ 5. assemble     blocks → sections; promote title/subtitle/meta out of the body
  ├─ 6. enrich       extract dates, times, emails, URLs, owners, deadlines
  ├─ 7. repair       merge stray fragments, drop empties, fix heading levels, dedupe
  └─ 8. emit         { doc: NewsletterDoc, report: ParseReport }
```

Every stage is a pure function `(input, ctx) => output`. Each is separately unit-testable, and a failure in stage 6 cannot corrupt stage 3's output.

### 11.2 Rules are data

```ts
export interface Rule {
  id: string;                       // "da.heading.agenda" — appears in ParseReport
  lang: DocLang;
  kind: LineKind;
  score: number;                    // 0–100; highest wins, ties broken by rule order
  test: (line: Line, ctx: ParseContext) => boolean;
  extract?: (line: Line, ctx: ParseContext) => Partial<Block>;
}
```

A rule pack is an array of `Rule`. `src/parser/rules/da.ts` is loaded first and its rules score higher than `en.ts` on ties. Adding a language is adding a file to a registry. A rule can be unit-tested in three lines. When the parser misbehaves in the field, `ParseReport` names the rule that fired.

### 11.3 Danish rules — first class

**Section-heading lexicon** (case-insensitive, optionally followed by `:`, optionally in caps, optionally numbered):

| Kind | Danish triggers |
| --- | --- |
| Agenda | `Dagsorden`, `Dagsordenen`, `Punkter`, `Mødets punkter`, `Til behandling` |
| Decisions | `Beslutning`, `Beslutninger`, `Vi besluttede`, `Klubben besluttede`, `Til beslutning`, `Konklusion` |
| Actions | `Handling`, `Handlinger`, `Opgaver`, `To-do`, `Aftaler`, `Hvem gør hvad`, `Ansvarlig` |
| Notice (important) | `Vigtigt`, `OBS`, `NB`, `Bemærk`, `Husk`, `Frist`, `Deadline` |
| Notice (info) | `Til orientering`, `Orientering`, `Info`, `Bemærk venligst` |
| Contact | `Kontakt`, `Kontaktoplysninger`, `Spørgsmål`, `Har du spørgsmål` |
| Closing | `Med venlig hilsen`, `Mvh`, `M.v.h.`, `Venlig hilsen`, `De bedste hilsner`, `På vegne af` |
| Meeting meta | `Tid og sted`, `Tidspunkt`, `Sted`, `Mødested`, `Lokale`, `Referent`, `Ordstyrer`, `Dirigent`, `Fremmødte`, `Afbud`, `Næste møde` |
| Generic | `Nyt fra kredsen`, `Nyt fra …`, `Eventuelt`, `Evt.`, `Andet`, `Opsamling`, `Baggrund`, `Indledning` |

**Danish date and time formats** — all recognised:

| Pattern | Example |
| --- | --- |
| `d. månedsnavn åååå` | `14. august 2026`, `d. 14. august 2026` |
| weekday + date | `torsdag den 14. august`, `tors. d. 14/8` |
| numeric slash | `14/8 2026`, `14/8-26`, `14/08/2026` |
| numeric dot | `14.08.2026`, `14.8.26` |
| numeric dash | `14-08-2026` |
| time, dot separator | `kl. 15.30`, `kl 15.30`, `15.30` |
| time, colon separator | `kl. 15:30`, `15:30` |
| time range | `kl. 15.30-17.00`, `15.30 – 17`, `kl. 15-17` |
| relative | `i morgen`, `næste uge` → left as text, never guessed into a date |

Two-digit years map to `2000+yy` for `yy ≤ 79`. Ambiguous numeric dates are read as **day-first** — Danish convention, never US.

**Danish list markers:** `-`, `–`, `—`, `•`, `·`, `*`, `o`, `1.`, `1)`, `(1)`, `a)`, `a.`, `1.1`.

**Danish action-item extraction:** the pattern `<task> (Ansvarlig: <name>, frist <date>)`, `<task> – <name>, senest <date>`, `<name>: <task> inden <date>`, and the tabular `Opgave | Ansvarlig | Frist`. Owner-name detection uses position plus a `Ansvarlig|ansv.|v/|ved` prefix, never a name dictionary.

**English rules** mirror the same table (`Agenda`, `Decisions`, `Action items`, `Important`, `Please note`, `Contact`, `Kind regards`, `Best regards`, month-first dates recognised only when unambiguous or when the month name is present).

### 11.4 Non-lexical heuristics

Applied when no lexical rule fires, because most real notes are not labelled:

| Signal | Inference |
| --- | --- |
| First non-empty line, < 80 chars, no terminal full stop | Title |
| Second line, < 100 chars, no terminal full stop, blank line after | Subtitle |
| Line < 60 chars, no terminal punctuation, blank line before, non-blank after | Heading |
| Line is ALL CAPS, ≥ 3 chars, < 60 chars | Heading (and re-cased to sentence case) |
| Line ends with `:` and the next line is a list | Heading of that list |
| ≥ 2 consecutive lines starting with the same marker | List (ordered iff the marker is numeric) |
| Line matches an email or URL and is short | Contact entry |
| Line starts with `"` or `»` and ends with `"` or `«` | Quote |
| Everything else | Paragraph |

Danish quotation marks are `»…«` **and** `"…"`; both are recognised. Danish sentence case is applied when de-capitalising an ALL CAPS heading — first letter and nothing else, since Danish does not capitalise nouns.

### 11.5 Conflict resolution

Highest score wins. Ties break toward the earlier rule in the pack, and Danish packs precede English. A line matching both `Beslutning` (decision heading) and a date pattern is a heading, because heading rules score 90 and inline-date enrichment happens in stage 6, not stage 3 — the stages remove most conflicts by construction.

### 11.6 Confidence

| Confidence | Assigned when | UI treatment |
| --- | --- | --- |
| `high` | An explicit lexical rule fired | None |
| `medium` | A structural heuristic fired with a clear signal | None |
| `low` | Score < 40, or two rules within 10 points, or a fallback classification | Dotted left rule + the word **Usikker** / *Uncertain*; counted in the review strip |

Only `low` is surfaced. Flagging medium confidence would flood the review strip and train the user to ignore it.

### 11.7 Paste-into-editor behaviour

Pasting into an existing document is a different problem from the initial parse:

- Paste into a **section body**: plain text goes through a *lightweight* line parser (lists and links only) — never a full re-parse, which would try to invent new sections mid-paragraph. Pasted HTML goes through `transformPastedHTML` and the schema, which strips everything alien.
- Paste of a **large multi-line block** (> 5 lines with structure) into an empty section: offer an inline, non-modal choice — **"Formatér som afsnit"** / *"Format as sections"* vs **"Indsæt som tekst"** / *"Insert as plain text"*. Default to plain text; the user asked to paste, not to restructure.

### 11.8 Future AI assist, without a v1 dependency

The parser's interface is the extension point:

```ts
interface Restructurer {
  id: string;
  restructure(raw: string, ctx: ParseContext): Promise<{ doc: NewsletterDoc; report: ParseReport }>;
}
```

`RuleBasedRestructurer` implements it and is the only registered implementation in v1. A future `AiRestructurer` would implement the same interface and be selectable in settings. The requirements it would have to meet, decided now so the option stays open:

- **Opt-in per use, never persistent.** A dialog naming the provider, stating that the text leaves the browser, requiring explicit confirmation each session.
- **Bring-your-own-key, stored locally**, or a proxy the kreds operates. No key ever ships in the frontend.
- **Output validated against the `NewsletterDoc` Zod schema** before it touches the store; a malformed response falls back to the rule-based result.
- **Rule-based output always computed first** and shown as the diff baseline, so the user can reject the AI result in one click.

Because `NewsletterDoc` is the contract and not HTML, an AI path is a swap of one implementation. No architectural work is deferred; nothing about v1 anticipates it beyond this interface.
