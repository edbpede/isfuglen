# Nyhedsbrevsgenerator til faglig klub — Implementation Plan

**Status:** Proposal, awaiting review. No application code written.
**Target stack:** Bun 1.3 · Astro 7.2 · Svelte 5 (runes) · UnoCSS 66 (`presetWind4`) · TypeScript strict
**Binding conventions:** `.augment/rules/bun-unocss-dev-pro.md`
**Plan language:** English. All interface-copy examples are Danish first, English second.

### Section map

All twenty-four required sections are present. Two are added: §0 records a blocker found during preparation, and §2 is the requested decision table, placed early so a reviewer sees every decision before the argument for it.

| Required | Here | Required | Here |
| --- | --- | --- | --- |
| 1. Feasibility conclusion | §1 | 13. DOCX export strategy | §14 |
| 2. Product experience and user flow | §3 | 14. Clipboard strategy | §15 |
| 3. Information architecture | §4 | 15. Local storage and privacy | §16 |
| 4. Text wireframes | §5 | 16. Accessibility | §17 |
| 5. Technical architecture | §6 | 17. Component inventory | §18 |
| 6. Astro integration and editor choice | §7 | 18. Project and folder structure | §19 |
| 7. Localisation architecture | §8 | 19. Testing strategy | §20 |
| 8. Interface vs. document language | §9 | 20. Browser compatibility | §21 |
| 9. Structured document model | §10 | 21. Risks and mitigations | §22 |
| 10. Rule-based formatting strategy | §11 | 22. Implementation plan | §23 |
| 11. Visual direction and design tokens | §12 | 23. MVP acceptance criteria | §24 |
| 12. PDF export strategy | §13 | 24. Open questions | §25 |

The required localisation acceptance criteria are §24.2, listed in the order given in the brief.

---

## 0. Preconditions and blockers

Two items must be resolved before Milestone 5 (visual identity). Neither blocks Milestones 1–4.

| Item | Status | Impact |
| --- | --- | --- |
| `018-ishoej.svg` | **Not present in the repository or workspace** | Blocks exact palette extraction and logo geometry |
| `018-ishoej.png` | **Not present in the repository or workspace** | Blocks DOCX/clipboard logo embedding |

The brief describes both files as attached; neither exists on disk. This plan therefore specifies a **drop-in contract** (§12.8) so that adding the two files completes the visual layer without refactoring, and anchors the provisional palette on Danmarks Lærerforening's own published identity — `#253154` navy, verified from the `theme-color` and `msapplication-TileColor` meta tags on `dlf.org`, plus the gold/yellow the DLF mark uses in its footer treatment. **Every colour marked `provisional` in §12.4 must be re-derived from the actual SVG before the design is signed off.**

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
| **Auto-formatting** | Rule engine; LLM; hybrid | **Deterministic rule registry, Danish rules first-class** | No backend, no keys, no cost, no latency, fully testable, privacy-safe by construction. | Cannot handle genuinely unstructured prose as well as an LLM; mitigated by an explicit review step (§3.4). |
| **Localisation** | `i18next`, `astro-i18next`, Paraglide, hand-rolled typed catalogs | **Hand-rolled typed catalogs + 2 nanostores** | ~60 lines of code, compile-time completeness enforcement, no runtime framework in the bundle, third language = one file. | No plural/ICU machinery — we add the two plural rules we actually need. |
| **UI language mechanism** | Route-per-locale only; client-only strings; hybrid | **Astro i18n routes for static chrome + both catalogs in the island, URL kept in sync** | Instant switching with no navigation and no editor-state loss; reload lands on the correct prefix so there is no flash. | Both catalogs ship (~3 KB gz). Accepted for instant, state-preserving switching. |
| **PDF** | Print CSS only; jsPDF + html2canvas; jsPDF/pdf-lib text API; **Paged.js** + print | **Paged.js paginates both the on-screen preview and the printed document; native print CSS is the always-present fallback** | Only browser-native route that gives real page boxes, in-content page numbers, running headers/footers, and *cross-browser-uniform* orphan/widow control (Firefox does not implement `orphans`/`widows`). Preview matches export by construction. | pagedjs 0.4.3, last npm publish 2023 — maintenance risk; ~120 KB. Fallback path is mandatory (§13.2). |
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

> **Vi satte 6 afsnit op. 2 af dem er vi i tvivl om.**
> *We laid out 6 sections. We are unsure about 2 of them.*

Two sentences, one count each: the plural machinery selects on a single `n`, so a single sentence carrying four counts cannot be grammatical in both languages at once (`1 punkter er usikre`, `0 dagsorden`). The agenda and action tallies are not here, because neither asks the reader to do anything and both read as a failure report on a newsletter that never wanted either. `ParseReport` still carries them; they are the parser's own accounting.

Low-confidence blocks (§11.6) carry an unobtrusive marker in the editor pane — a dotted left rule plus the word **Usikker** / *Uncertain*, never colour alone. Clicking the strip's counter walks the user through them. Dismissing the strip is permanent for that draft.

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
| Line ends with `:`, and either a list or a blank line follows it | Heading of what comes after it |
| ≥ 2 consecutive lines starting with the same marker | List (ordered iff the marker is numeric) |
| A lead-in line (ends with `:`, or with `med`/`følgende`/`disse`/`herunder`/`nemlig`) followed by one unbroken block of ≥ 2 short, single-clause, capital-initial lines with no marker | Ordered list, always `low` confidence |
| Line matches an email or URL and is short | Contact entry |
| Line starts with `"` or `»` and ends with `"` or `«` | Quote |
| Everything else | Paragraph |

Danish quotation marks are `»…«` **and** `"…"`; both are recognised. Danish sentence case is applied when de-capitalising an ALL CAPS heading — first letter and nothing else, since Danish does not capitalise nouns.

**Lists whose numbering the clipboard dropped.** Copying an auto-numbered list out of Google Docs yields the item text without the numerals, so the parser sees loose lines and the short-heading heuristic reads the first of them as a heading. The lead-in survives the copy, and the last rule in the table above reconstructs the list from it. It refuses in every case it cannot be sure of — a run of one, a run that would chop a paragraph in half, a run separated by blank lines, lines that read as prose — because leaving the numbering lost is a smaller cost than inventing structure. When it does fire it is `low` confidence by construction: `Rule.uncertain` overrides the score band, and the review strip names `structure.recoveredList` as the rule that guessed.

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

---

## 12. Visual direction and design tokens

### 12.1 Logo analysis — and its current limits

The two logo files are absent (§0). What can be established without them:

- The mark belongs to **Ishøj Lærerkreds, Kreds 18**, a local branch of **Danmarks Lærerforening**.
- DLF's own published identity is a **deep navy** — `#253154`, verified from the `theme-color` and `msapplication-TileColor` meta tags on `dlf.org` — paired with a **warm gold/yellow** used for the mark itself and for accents.
- Kreds marks in DLF's federation are typically a wordmark plus a compact symbol, built for small reproduction on letterheads and meeting papers.

The palette below is therefore anchored on the parent organisation's verified navy, with the accent held as **provisional**. When the SVG lands, one task closes the loop: extract its actual fill values, replace the provisional tokens, re-run the contrast table in §12.4, and confirm the logo's intrinsic aspect ratio against §12.8.

**What must not happen:** inventing a mark, recolouring the supplied one to fit the palette, or letting the logo become a decorative motif. The palette adapts to the logo, never the reverse.

### 12.2 Design intent

Six words from the brief — modern, calm, trustworthy, professional, approachable, Scandinavian — resolve into four concrete rules:

1. **Generous white space over rules and boxes.** Structure is signalled by spacing first, by a hairline second, by a fill only where a block genuinely interrupts the reading flow.
2. **One accent, used sparingly.** Gold appears as a short rule under the masthead, as the agenda number chip, and as the important-notice bar. Nowhere else.
3. **Type does the work.** Hierarchy comes from size, weight and spacing, not from colour or boxes.
4. **The page looks like a document, not a web page.** No cards with shadows in the printed artefact, no gradients, no icon soup. Shadows exist in the *application chrome* only.

The result should read as though the kreds has a designer on staff — which is exactly the promise in §3.1.

### 12.3 Typography

| Role | Screen / PDF | Size | Weight | Line height | Tracking |
| --- | --- | --- | --- | --- | --- |
| Document title (`h1`) | Source Serif 4 | 30 pt / 40 px | 600 | 1.15 | −0.01em |
| Subtitle | Source Sans 3 | 14 pt / 19 px | 400 | 1.4 | 0 |
| Section heading (`h2`) | Source Serif 4 | 16 pt / 21 px | 600 | 1.25 | 0 |
| Sub-heading (`h3`) | Source Sans 3 | 12 pt / 16 px | 600 | 1.3 | 0.02em, small caps feel via uppercase |
| Body | Source Sans 3 | 10.5 pt / 14 px | 400 | 1.55 | 0 |
| Meta line (date, location) | Source Sans 3 | 9.5 pt / 13 px | 500 | 1.4 | 0.01em |
| Info-box body | Source Sans 3 | 10 pt / 13.5 px | 400 | 1.5 | 0 |
| Footer | Source Sans 3 | 8.5 pt / 11.5 px | 400 | 1.4 | 0.01em |

**Why this pairing.** Source Serif 4 gives the masthead and section headings the authority a union document wants without tipping into officialese; Source Sans 3 is a humanist sans that stays warm at 10.5 pt and holds up in a Word substitution scenario. They were designed to work together, which removes an entire category of pairing risk. Both are SIL OFL 1.1 — free for web use, embedding and commercial distribution — and both carry complete Danish coverage including `æ ø å Æ Ø Å` and the `»«` quotation marks.

**Why not Inter.** Inter is the safe modern default and would not be wrong, but it is neutral to the point of anonymity and its default figures read coldly in running text. This document should feel like it came from people, not from a dashboard.

**Loading.** Self-hosted via `@fontsource-variable/source-sans-3` and `@fontsource-variable/source-serif-4`, subset to `latin` and `latin-ext` (the latter is not strictly required for Danish but costs little and covers pasted Nordic and German names). `font-display: swap` for UI; **`font-display: block` with a short preload for the preview surface**, because a font swap mid-pagination causes Paged.js to reflow and page breaks to jump. No Google Fonts request — self-hosting is also the GDPR-clean choice for a union (§15.4).

**Body-text measure.** 62–72 characters at A4 with the margins in §12.7. That falls in the comfortable range without needing columns.

### 12.4 Colour

All ratios below are computed, not estimated.

**Core**

| Token | Value | Use | Contrast |
| --- | --- | --- | --- |
| `--c-ink` | `#1A2340` | Body text, `h1` | 15.46:1 on white |
| `--c-brand` | `#253154` | Headings, header rule, footer text | 12.76:1 on white |
| `--c-brand-mid` | `#3C4E7A` | Links, secondary emphasis | 8.19:1 on white |
| `--c-muted` | `#4A5262` | Meta lines, captions | 7.85:1 on white |
| `--c-accent` | `#F2B233` *(provisional)* | Rules, chips, notice bar — **never text** | 1.88:1 on white |
| `--c-surface` | `#FFFFFF` | Page | — |
| `--c-surface-sunken` | `#F7F8FA` | App chrome background | ink 12.01:1 |
| `--c-hairline` | `#DFE3EB` | Rules, borders | non-text |

**Semantic block fills** — every one carries `--c-ink` or `--c-brand` as its text colour, so all clear AA comfortably:

| Block | Fill | Bar / accent | Text contrast |
| --- | --- | --- | --- |
| Info notice | `#E7EDF7` | `--c-brand-mid` | 10.85:1 |
| Important notice | `#FDF3DD` | `--c-accent` | 11.57:1 |
| Decisions | `#EAF0E9` | `#0F5132` | 11.02:1 |
| Action items | `#FBEAE8` | `#B02A1E` | 10.96:1 |
| Quote | none | `--c-hairline` left rule | 15.46:1 |

**The gold rule, stated once and enforced.** `--c-accent` is 1.88:1 on white. It is **never** used for text, icons carrying meaning, or focus rings. It is used as: a 3 px rule beneath the masthead, the fill of agenda number chips (navy text on gold is 6.80:1 — AA for normal text), and the left bar of the important-notice block. A lint rule and a code-review check both enforce this, because it is the single easiest way for a well-meaning future change to break accessibility.

**Colour is never the only signal.** Each semantic block carries a text label in the document language — `Vigtigt` / *Important*, `Beslutninger` / *Decisions*, `Handlinger` / *Action items* — plus a distinct left-bar treatment (solid, double, dotted). A greyscale print and a monochrome screen reader both retain the full meaning.

### 12.5 Spacing

A 4 px base, expressed in millimetres on the page so print and screen stay in step.

| Token | Screen | Print | Use |
| --- | --- | --- | --- |
| `--sp-1` | 4 px | 1 mm | Inline gaps |
| `--sp-2` | 8 px | 2 mm | List item spacing |
| `--sp-3` | 12 px | 3 mm | Paragraph spacing |
| `--sp-4` | 16 px | 4 mm | Inside info boxes |
| `--sp-5` | 24 px | 6 mm | Between blocks |
| `--sp-6` | 32 px | 8 mm | Before a section heading |
| `--sp-7` | 48 px | 12 mm | After the masthead |

Vertical rhythm rule: **space before a heading is always larger than space after it.** This is what makes a heading read as belonging to the text below rather than floating between two blocks, and it is the cheapest way to make an amateur layout look considered.

### 12.6 Borders, radii, shadows, focus

| Token | Value | Note |
| --- | --- | --- |
| `--bw-hairline` | 1 px / 0.25 mm | Rules and box outlines |
| `--bw-bar` | 4 px / 1 mm | Semantic block left bars |
| `--bw-brand` | 3 px / 0.8 mm | Masthead rule |
| `--r-sm` | 3 px | Info boxes, chips |
| `--r-md` | 6 px | App chrome controls |
| `--r-none` | 0 | **Everything in the printed document except info boxes and chips** |
| `--shadow-chrome` | `0 1px 2px rgb(37 49 84 / .06), 0 4px 12px rgb(37 49 84 / .08)` | App chrome only |
| `--shadow-page` | `0 2px 8px rgb(37 49 84 / .10)` | The A4 sheet in the preview pane; **removed in print** |
| `--focus-ring` | `0 0 0 2px #FFFFFF, 0 0 0 4px #3C4E7A` | 3.4:1 against white, 2 px thick — meets WCAG 2.2 SC 2.4.11 |

Focus is never conveyed by colour change alone; the ring is a geometric addition. The white inner ring guarantees the indicator stays visible on both light and tinted backgrounds.

### 12.7 A4 layout and grid

```
   210 mm
┌─────────────────────────────────────────────┐  ▲
│            18 mm top margin                 │  │
│  ┌────────────────────────────────────────┐ │  │
│  │ [logo 32mm]              Ishøj         │ │  │  header band, 22 mm
│  │                          Lærerkreds    │ │  │
│  │ ══════════════════════════════════════ │ │  │  gold rule, 0.8 mm
│  ├────────────────────────────────────────┤ │  │
│  │                                        │ │  │
│  │  Klubmøde august              (h1)     │ │  │
│  │  Referat fra mødet         (subtitle)  │ │  │
│  │  fredag den 14. august 2026   (meta)   │ │  │
│  │  kl. 15.30–17.00 · Lærerværelset       │ │  │
│  │                                        │ │  │  content column
│  │  ─────────────────────────────────     │ │  │  170 mm
│  │                                        │ │  │
│  │  DAGSORDEN                    (h2)     │ │  │  297 mm
│  │  ① Godkendelse af referat              │ │  │
│  │  ② Nyt fra kredsen                     │ │  │
│  │                                        │ │  │
│  │  ▍ VIGTIGT                             │ │  │
│  │  ▍ Frist for tilmelding er 20. august. │ │  │
│  │                                        │ │  │
│  └────────────────────────────────────────┘ │  │
│  ─────────────────────────────────────────  │  │  footer rule
│  Ishøj Lærerkreds · Kreds 18 · DLF   1 / 3  │  │  footer band, 12 mm
│            18 mm bottom margin              │  ▼
└─────────────────────────────────────────────┘
   20 mm side margins
```

- **Page:** A4 portrait, 210 × 297 mm.
- **Margins:** 18 mm top/bottom, 20 mm left/right. Comfortably inside the non-printable area of every common office printer (typically ≤ 6.4 mm), so nothing clips.
- **Content column:** 170 mm — one column, no grid subdivision. A newsletter of this length does not need columns, and columns fight both Word export and mobile preview.
- **Header band:** 22 mm, repeated on every page. Page 1 shows the full logo lockup; pages 2+ show a reduced version (§12.8).
- **Footer band:** 12 mm, organisation line left, page number right.
- **Baseline:** 4 mm vertical rhythm. Blocks snap to it; body text does not need to, and forcing it would create awkward gaps around lists.

### 12.8 Logo placement and sizing

| Context | Width | Placement | Format |
| --- | --- | --- | --- |
| App header | 28 px height | Left, beside the app title | SVG |
| Document page 1 | 32 mm | Header band, left-aligned | SVG (print), PNG (DOCX) |
| Document pages 2+ | 20 mm | Header band, left-aligned | SVG (print), PNG (DOCX) |
| DOCX header | 32 mm | Header, left | PNG @ 300 ppi ≈ 378 px wide |
| Clipboard HTML | Not included | — | See §14.3 |

**Rules.** Aspect ratio comes from the SVG's `viewBox` and is never overridden — width is set, height is `auto`, and the DOCX `ImageRun` receives explicitly computed dimensions derived from the same ratio. No recolouring, no cropping, no filters, no rotation, no drop shadow, no placement over a tinted background. Minimum clear space on all sides equals the logo's cap height. Minimum reproduction width 18 mm; below that the wordmark stops being legible and the mark should be omitted rather than shrunk.

**Contract for the missing files** (§0), so dropping them in completes the work:

```
public/brand/
  ishoej-kreds18.svg      # the supplied 018-ishoej.svg, renamed, unmodified
  ishoej-kreds18.png      # the supplied 018-ishoej.png, unmodified
  ishoej-kreds18@300.png  # BUILD ARTEFACT — generated from the SVG, see §14.4
```

### 12.9 Block styles

| Block | Treatment |
| --- | --- |
| **Heading (h2)** | Serif, brand navy, 8 mm above / 3 mm below, no rule, no box |
| **Sub-heading (h3)** | Sans, uppercase, tracked, muted, 6 mm above / 2 mm below |
| **Paragraph** | 3 mm below, no indent, ragged right |
| **List** | 4 mm hanging indent; bullets are a small navy square, numbers are navy |
| **Agenda** | Numbered chips: gold circle, navy numeral, 5 mm; item text aligned to a hanging indent; optional presenter in muted small caps on the right |
| **Decisions** | Green-tinted fill, solid dark-green 1 mm left bar, label `BESLUTNINGER`, checkmark glyph before each item |
| **Action items** | Red-tinted fill, solid 1 mm left bar, label `HANDLINGER`; each item is `task — owner · deadline` with owner in medium weight and deadline in the document locale |
| **Important notice** | Warm-tinted fill, gold 1 mm left bar, label `VIGTIGT`, 4 mm padding |
| **Info notice** | Blue-tinted fill, brand-mid 1 mm left bar, label `TIL ORIENTERING` |
| **Quote** | No fill; 1 px hairline left rule, italic, 6 mm left indent, attribution in muted small caps below |
| **Contact** | Hairline rule above, two-column definition-list layout, links in brand-mid with underline |
| **Closing** | 8 mm above, no rule; signature lines tight at 1.3 line height |

**Consistent without being rigid.** The system holds because every block draws from the same three-part vocabulary — *fill, bar, label* — and varies only which parts it uses and in what colour. Adding an eleventh block type later means picking from that vocabulary, not inventing a new visual language. The variation between a quote (bar only), a paragraph (nothing) and a decision block (all three) gives the page rhythm without any block feeling foreign.

### 12.10 Token implementation

`uno.config.ts` is the source of truth per the house rules; tokens are declared once in the UnoCSS `theme` and mirrored as CSS custom properties for the print stylesheet, which needs raw values rather than utility classes.

```ts
// uno.config.ts (shape)
theme: {
  colors: {
    ink: "#1A2340",
    brand: { DEFAULT: "#253154", mid: "#3C4E7A" },
    accent: "#F2B233",
    hairline: "#DFE3EB",
    // semantic fills…
  },
  fontFamily: {
    sans: "'Source Sans 3 Variable', system-ui, sans-serif",
    serif: "'Source Serif 4 Variable', Georgia, serif",
  },
}
```

**Two constraints from the house rules that shape this:** UnoCSS only generates classes it finds by scanning source, so semantic block variants are written as **full literal class strings** selected by a lookup map — never as `` `bg-${tone}-50` ``. And `presetWind4` is the only preset; `presetUno` and `presetWind3` are superseded. Both are enforced at commit time by the `deny-pattern` hooks in `prek.toml`.

---

## 13. PDF export strategy

### 13.1 Options

| Approach | Text selectable | Logo sharp | Page numbers in content | Cross-browser break control | Verdict |
| --- | --- | --- | --- | --- | --- |
| **A. Print CSS + `window.print()`** | Yes | Yes (vector) | **No** | **No** — Firefox does not implement `orphans`/`widows` | Necessary, insufficient alone |
| **B. jsPDF + html2canvas** | **No** — rasterised | **No** | Yes | N/A | Reject |
| **C. jsPDF / pdf-lib text API** | Yes | Yes | Yes | Full, but hand-built | Reject for v1 |
| **D. Paged.js + `window.print()`** | Yes | Yes | **Yes** | **Yes** — implemented in JS, identical everywhere | **Recommended** |

**Why B is rejected outright.** `html2canvas` produces a bitmap. Selectable text disappears, the logo becomes pixels, file size multiplies, and screen readers get nothing. The brief explicitly asks to avoid rasterising unless nothing else works — and something else works.

**Why C is rejected for v1.** `pdf-lib` and jsPDF's text API give total control, and would deliver a genuine one-click download. The cost is reimplementing text layout: line breaking, Danish hyphenation, list wrapping, widow control, table-free info boxes, font subsetting for `æøå`. That is weeks of work with a long tail of typographic bugs, for a benefit (download vs. print dialog) that costs the user one click. Revisit only if the print flow proves unacceptable in real use.

**Why A alone is insufficient.** `@page` margin boxes — `@top-center`, `@bottom-right`, `counter(page)` — are specified in CSS Paged Media but implemented by **no** current browser. Only the browser's own print-dialog header/footer can show page numbers, and the user controls whether those appear. Firefox additionally does not support `orphans` and `widows`, so "no isolated heading at the bottom of a page" would hold in Chrome and Safari and silently fail in Firefox.

### 13.2 Recommendation

**Paged.js paginates both the on-screen preview and the printed document. Native print CSS is a mandatory fallback layer.**

Three reasons, in order of weight:

1. **The preview matches the export by construction.** The same engine, the same DOM, the same stylesheet produce both. This is not a testing burden we take on; it is a property of the design.
2. **Page breaks behave identically in all four browsers**, because Paged.js implements orphans, widows and break avoidance itself rather than delegating to four different layout engines.
3. **Page numbers and running headers work** — `counter(page)`, `counter(pages)` and named page margin boxes are Paged.js's core competence.

**Fallback contract.** The print stylesheet is authored to be correct on its own. If Paged.js fails to load, throws, or exceeds a 3-second budget, the preview shows a continuous (unpaginated) document with a quiet notice, and printing uses the plain stylesheet. The result is still a correct, selectable, sharp multi-page PDF — it simply loses in-content page numbers and uniform widow control. The fallback costs nothing extra because the print CSS must exist regardless. Because this path is mandatory rather than hypothetical, it is released against its own acceptance criterion — §24.1.7, deliberately weaker than the §24.1.6 bar that Paged.js is there to meet — and §20.2 tests it separately with Paged.js blocked.

**Isolation.** Paged.js rewrites the DOM it is given. It therefore runs on a **cloned, non-editable render** of `NewsletterDoc` inside the preview pane, never on the editor. Re-pagination is debounced at 400 ms after the last edit, runs against a detached fragment, and swaps in on completion — so typing never fights the paginator.

### 13.3 What the print stylesheet must specify

```css
@page {
  size: A4 portrait;
  margin: 18mm 20mm;
}
```

| Concern | Rule |
| --- | --- |
| Isolated heading | `h2, h3 { break-after: avoid; }` plus Paged.js's own check |
| Orphans / widows | `p { orphans: 3; widows: 3; }` |
| Block integrity | Info boxes, quotes and action items: `break-inside: avoid` |
| Lists across pages | `li { break-inside: avoid; }` — the item stays whole, the list continues; numbering continues because Paged.js preserves the counter |
| Long links | `a { word-break: break-word; overflow-wrap: anywhere; }` |
| Long Danish words | `hyphens: auto` with `lang="da"` on the preview root — Chrome, Firefox and Safari all ship Danish hyphenation patterns. This matters: `arbejdstidsaftale` and `medarbejderrepræsentant` are ordinary words here |
| Very long content | No cap. A 30-page document paginates; performance is monitored (§22, risk 7) |
| Chrome background bug | `-webkit-print-color-adjust: exact; print-color-adjust: exact;` on tinted blocks — without it, Chrome drops the fills |
| Chrome extras | Hide app chrome with `@media print { .app-chrome { display: none } }` |
| Shadows | `--shadow-page` removed in print |

### 13.4 Locale in the PDF

- The preview root carries `lang={docLang}`, which drives hyphenation and is inherited by the print output.
- All generated labels come from `labels/[docLang]`.
- Dates come from `format.ts` with the matching locale.
- **Document metadata is a known limitation.** The browser print pipeline derives the PDF title from `document.title` and does not expose `/Lang` or `/Subject`. The mitigation: set `document.title` to `"<title> — <organisation>"` immediately before `window.print()` and restore it afterwards, so the saved filename and the PDF title are correct. Full metadata control is available in DOCX (§14.3) and would come with a v2 generator.

### 13.5 Download vs. print — the honest difference

| | Direct "Hent PDF" | "Udskriv eller gem som PDF" |
| --- | --- | --- |
| User steps | 1 — file appears in Downloads | 2 — dialog opens, choose destination, save |
| Filename | We control it | Browser suggests from `document.title`; user may change |
| Requires | A PDF generator in the bundle | Nothing |
| Text quality | Depends entirely on the generator | Native — real fonts, real kerning, selectable |
| Logo | Depends on the generator | Vector |
| Metadata | Full control | Title only |
| Failure mode | Silent wrong layout | Visible in the print preview before saving |
| Available in v1 | **No** | **Yes** |

**Recommended copy.** The primary button says what actually happens:

- **"Udskriv eller gem som PDF"** / *"Print or save as PDF"*
- Helper line beneath: **"Vælg »Gem som PDF« i printdialogen."** / *"Choose 'Save as PDF' in the print dialog."*

**"Hent PDF" / "Download PDF" is deliberately not used in v1**, because it would promise a download the app cannot deliver. Reserve the label for a future release that ships a real generator. A tool that describes itself accurately is trusted; one that mislabels a button teaches the user to distrust every other label.

### 13.6 Known browser behaviour

| Browser | Notes |
| --- | --- |
| Chrome / Edge | Best case. Requires `print-color-adjust: exact` for fills. "Save as PDF" is a built-in destination |
| Firefox | Good with Paged.js. Without it, `orphans`/`widows` are ignored. "Save to PDF" built in |
| Safari (macOS) | Good. Save-as-PDF lives behind the dialog's PDF dropdown, which users miss — the helper line should mention it |
| Safari (iOS) | **Weakest.** Print goes via the share sheet, and saving requires pinch-to-zoom on the preview. Documented in `/hjaelp`; DOCX or clipboard is the better mobile route |

---

## 14. DOCX export strategy

### 14.1 Library

**`docx` v9.7 (dolanmiu), `Packer.toBlob()`, dynamically imported on first use.**

Alternatives weighed: `@turbodocx/html-to-docx` converts HTML and is quicker to wire up, but it hands us far less control over numbering definitions, header/footer construction and run-level language — all of which are explicit requirements here. Writing an HTML file with a `.doc` extension is not DOCX and is rejected.

`docx` produces genuine OOXML, works in the browser, and covers everything we need: `Header`, `Footer`, `PageNumber.CURRENT` / `TOTAL_PAGES`, `ImageRun`, `ExternalHyperlink`, abstract numbering definitions, table shading and borders, and per-run `language`.

### 14.2 Mapping

| Model | DOCX |
| --- | --- |
| `meta.title` | `Paragraph`, style `Title`, Georgia 22 pt, brand navy |
| `meta.subtitle` | `Paragraph`, style `Subtitle`, Calibri 11 pt, muted |
| Date / time / location | One `Paragraph`, Calibri 9.5 pt, formatted via `format.ts` in `docLang` |
| `Section.heading` (level 2) | `HeadingLevel.HEADING_1`, Georgia 13 pt, brand navy, `keepNext: true` |
| `Section.heading` (level 3) | `HeadingLevel.HEADING_2`, Calibri 10 pt bold, uppercase |
| `ParagraphBlock` | `Paragraph` of `TextRun[]` from `RichText` |
| `InlineText` marks | `TextRun({ bold, italics })` |
| `InlineLink` | `ExternalHyperlink` wrapping a styled `TextRun` (brand-mid, underlined) |
| `InlineBreak` | `TextRun({ break: 1 })` |
| `ListBlock` | `Paragraph({ numbering: { reference, level: 0 } })`, two abstract definitions: `nl-bullet`, `nl-number` |
| `AgendaBlock` | Numbered list under `nl-agenda` with a bold numeral; presenter appended as a muted run |
| `DecisionBlock` / `ActionBlock` / `NoticeBlock` | **1 × 1 `Table`**, full-width, cell `shading` in the block fill, `borders` with a thick coloured `left` and `none` elsewhere; label paragraph in bold caps, then content |
| `QuoteBlock` | `Paragraph` with `indent.left` and a left `border`, italic; attribution as a muted run |
| `ContactBlock` | 2-column borderless `Table`; emails as `mailto:` hyperlinks |
| `ClosingBlock` | Paragraphs, tight spacing |
| Header | `Header` with `ImageRun` (logo) + organisation `TextRun`, bottom border in brand navy |
| Footer | `Footer` with organisation line and `PageNumber.CURRENT` / `TOTAL_PAGES` |
| Page | `size: { orientation: portrait, width: 11906, height: 16838 }` twips; `margin: { top: 1021, bottom: 1021, left: 1134, right: 1134 }` (18 mm / 20 mm) |

**Why a 1 × 1 table for info boxes.** Word does support paragraph shading and borders, but a table cell reproduces the "coloured bar plus tinted panel" look far more reliably, survives round-tripping through LibreOffice and Google Docs, and keeps the block together across a page break via `cantSplit`. The trade-off is that a table is slightly more awkward for a user who then wants to edit the text in Word — acceptable, and the same substitute is used in the clipboard HTML (§14.2), which keeps the two outputs consistent.

### 14.3 Language metadata

Two distinct things, both required:

1. **Run-level `language: { value: "da-DK" }`** on every `TextRun`. This is what actually drives Word's proofing tools; without it a Danish document gets red-underlined by an English dictionary, which looks broken to the recipient.
2. **Core properties** — `title`, `subject`, `creator`, `description`, `keywords` — set from `DocumentMeta` and the document language.

Set `"da-DK"` or `"en-GB"` from `docLang`. Verify in a real Word install as part of the export test matrix (§20.4); this is the kind of detail that silently regresses.

### 14.4 The logo

**Recommendation: a build-time high-resolution PNG generated from the supplied SVG, with the supplied PNG as the committed fallback.**

| Option | Assessment |
| --- | --- |
| Rasterise SVG in-browser at export time | Canvas + `XMLSerializer` works, but adds runtime cost, risks canvas tainting, and produces different results across browsers. Rejected |
| Embed the SVG directly in DOCX | Word 2016+ supports it via the `svgBlip` extension, but **requires an embedded PNG fallback anyway**, and LibreOffice and Google Docs handle it poorly. Rejected as the primary |
| Use the supplied PNG as-is | Zero work, but its resolution is unknown; at 32 mm placed width, sharp print needs ≈ 378 px at 300 ppi |
| **Build-time PNG from the SVG** | Deterministic, generated once by `@resvg/resvg-js` in a build script, no runtime cost, renders correctly in every consumer. **Recommended** |

The build script emits `ishoej-kreds18@300.png` at exactly the pixel width implied by 32 mm at 300 ppi, preserving the SVG's aspect ratio. `ImageRun` receives explicitly computed `width`/`height` derived from that same ratio, so distortion is impossible by construction.

### 14.5 Fonts in DOCX

**Georgia for headings, Calibri for body**, mapped explicitly from the screen typography:

| Screen / PDF | DOCX | Reason |
| --- | --- | --- |
| Source Serif 4 | Georgia | Both transitional serifs with large x-height; Georgia is present on effectively every Windows and macOS install |
| Source Sans 3 | Calibri | Both humanist sans; Calibri is the Word default recipients already have |

**The reasoning, plainly:** a DOCX names a font, it does not carry one. Specifying "Source Sans 3" means Word substitutes on almost every recipient's machine, and Word's substitution is metric-driven and unpredictable — line counts shift, page breaks move. Choosing fonts the recipient already has produces a document that looks intentional everywhere, at the cost of not matching the PDF exactly. Font embedding (`w:embedRegular`) exists but brings licence-flag complexity, a much larger file, and patchy support outside Word. Not a v1 bet.

### 14.6 Stated plainly

**Word and browsers use different layout engines. The PDF and the DOCX will not be pixel-identical, and this is expected rather than a defect.** Line breaks will fall differently, page breaks may land a paragraph earlier or later, and the DOCX uses substitute fonts by design (§14.5). What *is* guaranteed to match: the content, its order, the heading hierarchy, the labels in the correct document language, the logo, the margins, the page size, and the semantic distinction between every block type.

This sentence belongs in `/hjaelp` in both languages, not just in this plan. A user who is told beforehand is not disappointed.

---

## 15. Clipboard strategy

### 15.1 Mechanism

```ts
// Blobs are constructed synchronously — Safari rejects ClipboardItem contents
// produced by an await that resolves after the user gesture.
const html = new Blob([renderClipboardHtml(doc, labels)], { type: "text/html" });
const text = new Blob([renderPlainText(doc, labels)], { type: "text/plain" });
await navigator.clipboard.write([new ClipboardItem({ "text/html": html, "text/plain": text })]);
```

Three-tier fallback:

1. `navigator.clipboard.write` with both MIME types — the target path.
2. `document.execCommand("copy")` over a hidden, selected `contenteditable` holding the HTML — loses guaranteed plain-text control but works where `ClipboardItem` is blocked.
3. A dialog showing the rendered document with everything pre-selected and the instruction **"Tryk Ctrl+C for at kopiere"** / *"Press Ctrl+C to copy"*.

Tier 3 matters more than it looks: it is the path for insecure contexts (`http://` on a LAN), for locked-down school-managed browsers, and for anyone whose clipboard permission is denied. A copy button that simply fails is worse than no copy button.

### 15.2 What the clipboard HTML must look like

- **Every style inline.** No `<style>` block, no classes — Gmail and Outlook strip both.
- **`<table>` for info boxes**, matching the DOCX approach (§14.2). Paragraph background colours are dropped by Google Docs; table cell shading survives nearly everywhere.
- **Semantic elements** — `h1`, `h2`, `p`, `ul`, `ol`, `li`, `a`, `strong`, `em`. These are what every target maps onto its own styles.
- **No logo.** An `<img>` needs either an absolute URL (a network request from the recipient's mail client, which many block) or a base64 data URI (which Outlook strips and Gmail truncates). Omitting it is the honest choice, and §5.5 tells the user so.
- **Points, not pixels**, for font sizes — Word interprets `pt` predictably.
- **`<meta charset="utf-8">`** in the fragment and `;charset=utf-8` on the blob type, so `æøå` survive.

### 15.3 Realistic paste results

| Target | Headings | Lists | Links | Info boxes | Colours | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| **Microsoft Word** | Yes | Yes, nesting preserved | Yes, clickable | Yes, as tables with shading | Yes | Best fidelity. Word maps `h1`/`h2` onto its own heading styles, so the recipient's template may restyle them — acceptable and often desirable |
| **Outlook (desktop)** | Yes | Yes | Yes | Yes | Yes | Uses the Word rendering engine. Very close to the Word result |
| **Outlook (web)** | Yes | Yes | Yes | Mostly — some border loss | Mostly | Sanitiser is more aggressive; left bars may thin |
| **Gmail** | Yes | Yes | Yes | Yes, table shading survives | Yes | Strips `position` and `float`; our layout uses neither |
| **Google Docs** | Yes | Yes | Yes | **Partly** — cell shading survives, cell borders are unreliable | Text colour yes, paragraph background no | The specific reason info boxes are tables and not styled paragraphs |
| **Plain-text field** | As `## HEADING` | As `- item` / `1. item` | `Label (https://…)` | As `[VIGTIGT] …` | N/A | See §15.4 |
| **Slack / Teams** | Partial | Yes | Yes | No | No | Both convert to their own limited markup. Plain text is the practical result |

### 15.4 The plain-text fallback

Not a stripped-tags dump — a deliberately readable Markdown-ish serialisation, and the same format the raw-text mode uses (§7.5), so the two round-trip:

```
KLUBMØDE AUGUST
Referat fra mødet
fredag den 14. august 2026 · kl. 15.30–17.00 · Lærerværelset

Kære kolleger. Her er et kort referat fra klubmødet.

## DAGSORDEN
1. Godkendelse af referat
2. Nyt fra kredsen

## BESLUTNINGER
- Klubben bakker op om forslaget.

## HANDLINGER
- Indkalde til møde om arbejdstid — Mette, frist 01.09.2026

[VIGTIGT] Frist for tilmelding er 20. august.

## KONTAKT
Mette Hansen · mette@ishoejlaererkreds.dk

Med venlig hilsen
Ishøj Lærerkreds · Kreds 18 · DLF
```

Labels follow the document language. Line width is not hard-wrapped — wrapping fights every target that reflows.

### 15.5 Status copy

| State | Danish | English |
| --- | --- | --- |
| Idle | Kopiér nyhedsbrev | Copy newsletter |
| Success | Kopieret | Copied |
| Failure | Kunne ikke kopiere | Could not copy |
| Fallback | Tryk Ctrl+C for at kopiere | Press Ctrl+C to copy |

Success is announced in a polite live region and shown with a checkmark **and** the word — never a colour change alone. The state reverts after 4 seconds.

### 15.6 Browser constraints

- **Secure context required.** `navigator.clipboard` is unavailable on plain `http://` except `localhost`. The static host must be HTTPS.
- **User gesture required** in every browser. The write happens in the click handler, never after an `await` that could break the gesture chain.
- **Safari** requires blob construction to be synchronous within the gesture, or the `ClipboardItem` to receive a `Promise` directly in its constructor. Building blobs synchronously satisfies both.
- **Firefox** has supported `ClipboardItem` with `text/html` since v127; older builds fall through to tier 2.
- **`text/html` only.** Custom MIME types (`web application/x-…`) are not portable and buy us nothing.

---

## 16. Local storage and privacy

### 16.1 Comparison

| | localStorage | IndexedDB (`idb-keyval`) |
| --- | --- | --- |
| API | Synchronous, trivial | Async, 4 functions via `idb-keyval` (~1.1 KB) |
| Quota | ~5 MB per origin | Large; browser-managed |
| Blocks the main thread | Yes | No |
| Structured data | Strings only — manual JSON | Structured clone |
| Right for | Small values needed synchronously at boot | Documents, autosave, many drafts |

### 16.2 Recommendation

**Preferences in localStorage via `@nanostores/persistent`; documents in IndexedDB via `idb-keyval`.**

Two mechanisms, each with one non-overlapping reason:

- **Preferences must resolve synchronously at boot.** `uiLang` decides what the first paint says. An async read means a flash of the wrong language on every load — precisely the failure §9.3 is engineered to avoid. localStorage is the only synchronous option.
- **Documents must not block the main thread.** Autosave fires on a 600 ms debounce while the user types. A 60 KB synchronous `JSON.stringify` + `localStorage.setItem` on every pause is a visible stutter, and 20 drafts would crowd the 5 MB cap.

Considered and rejected: **localStorage for everything.** Simpler on the surface, but it trades a real correctness property (no jank, no quota ceiling) for the removal of a 1.1 KB dependency.

### 16.3 What is stored

| Key | Store | Contents |
| --- | --- | --- |
| `nl.uiLang` | localStorage | `"da"` \| `"en"` |
| `nl.docLang` | localStorage | Default document language for new documents |
| `nl.settings` | localStorage | Organisation name, footer line, preview zoom, dismissed hints |
| `nl.current` | IndexedDB | The autosaved working document |
| `nl.draft.<uuid>` | IndexedDB | Named drafts |
| `nl.draftIndex` | IndexedDB | `{ id, name, updatedAt }[]` for the drafts panel |

Every document value is validated with a Zod schema on read. A draft written by an older release either migrates through the `schemaVersion` chain or surfaces a recoverable error — it never crashes the workspace or silently loses content.

### 16.4 Privacy posture

Version 1 guarantees, and each is testable:

1. **No document content leaves the browser.** No backend, no adapter, no API route, no `fetch` to any origin. Enforced by a CSP `connect-src 'self'` and asserted by a Playwright test that fails on any outbound request during a full paste-edit-export cycle.
2. **No analytics, no third-party tracking, no external AI.** No Google Fonts (self-hosted), no CDN, no tag manager, no error reporting service.
3. **Drafts live in the browser**, stated in three places: the entry screen, the export bar, and the drafts panel — not hidden in a privacy page nobody opens.
4. **The user can delete everything.** "Slet alle gemte data" / *"Delete all stored data"* clears both stores and reloads. One click, one confirmation, no residue.
5. **No claim of encryption.** The privacy page says so directly:

   > **Dansk:** Kladder gemmes i din browser på denne computer. De er ikke krypterede, og de er ikke egnede til stærkt fortrolige oplysninger. Andre med adgang til computeren og denne browserprofil kan læse dem. Brug ikke værktøjet til personsager eller helbredsoplysninger.
   >
   > **English:** Drafts are stored in your browser on this computer. They are not encrypted and are not suitable for highly confidential information. Anyone with access to this computer and this browser profile can read them. Do not use this tool for individual member cases or health information.

   The second sentence of each is the one that matters. Union material can include disciplinary and health matters, and a calm, specific warning is more useful than a generic disclaimer.

6. **A `/privatliv` page with zero JavaScript**, in Danish and English, covering what is stored, where, for how long, how to delete it, and what the tool never does.

### 16.5 Storage eviction — a real limitation

**Safari's Intelligent Tracking Prevention deletes all script-writable storage after 7 days without user interaction with the site.** This affects localStorage *and* IndexedDB. A user who writes a draft in Safari and returns three weeks later will find it gone.

Mitigations, in order:

1. **"Hent alle kladder som fil"** / *"Download all drafts as a file"* — a JSON export, and the matching import. This is the only durable backup and is a v1 requirement, not an extra.
2. A one-time notice in Safari: **"Din browser sletter gemte kladder efter 7 dage uden brug. Hent en sikkerhedskopi, hvis du vil gemme dem længere."** / *"Your browser deletes saved drafts after 7 days of inactivity. Download a backup if you want to keep them longer."*
3. `navigator.storage.persist()` requested once, which can exempt the origin — but it is granted at the browser's discretion and must not be relied upon.

Also worth knowing: private/incognito windows discard everything on close, and some school-managed browsers clear site data on sign-out. The same file export covers all of these.

---

## 17. Accessibility

Target: **WCAG 2.2 AA**.

### 17.1 Structure and semantics

- One `h1` per document (the newsletter title); sections are `h2`, sub-sections `h3`. Levels are never skipped — guaranteed by the model (§10.3), not by discipline.
- Landmarks: `header`, `main`, `nav` (drafts), `footer`; the preview is `role="region"` with `aria-label` **"Forhåndsvisning af nyhedsbrevet"** / *"Newsletter preview"*.
- Section cards are `<article>` with `aria-labelledby` pointing at their heading input.
- Lists are real `ul`/`ol`. Tables are used only in DOCX and clipboard output, never in the app UI.
- The editor surface carries `role="textbox"`, `aria-multiline="true"` and an `aria-label` in the interface language.

### 17.2 Keyboard

Every function reachable and operable by keyboard, with no traps:

| Action | Keys |
| --- | --- |
| Move between sections | `Tab` / `Shift+Tab` |
| Reorder a section | Focus the card, then `Alt+↑` / `Alt+↓` — **and** the visible `[↑]` `[↓]` buttons |
| Editor formatting | `Ctrl/⌘+B`, `Ctrl/⌘+I`, `Ctrl/⌘+K` (link) |
| Undo / redo | `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z` |
| Exit the editor | `Escape` returns focus to the section card |
| Skip to preview | A skip link, first in tab order |
| Close dialogs | `Escape`; focus returns to the trigger |

**Reordering has no drag-only path.** Drag-and-drop may be added as an enhancement, but the buttons and the keyboard shortcut are the primary mechanism — which also happens to be faster for everyone.

### 17.3 Focus

- Visible on every interactive element, using `--focus-ring` (§12.6): 2 px, 3.4:1 against the adjacent colour, with a white inner ring so it survives tinted backgrounds. Meets SC 2.4.11 *Focus Not Obscured* and SC 2.4.13 *Focus Appearance*.
- Never removed without replacement. `:focus-visible` for pointer users, `:focus` fallback.
- Dialogs trap focus while open and restore it on close.
- After the parse transition, focus moves to the review strip so keyboard and screen-reader users are not stranded at the top of a changed page.

### 17.4 Colour and contrast

- Body text 15.46:1, headings 12.76:1, muted text 7.85:1, links 8.19:1 — all far above the 4.5:1 requirement.
- Gold is never text (§12.4).
- No information conveyed by colour alone: every semantic block has a text label and a distinct bar treatment; low-confidence blocks show the word **Usikker** / *Uncertain*; save status shows text, not a coloured dot.
- Checked at 200% zoom and at 320 px width (SC 1.4.10 *Reflow*).

### 17.5 Language attributes

- `<html lang>` matches the interface language and updates on switch.
- The **preview root carries `lang={docLang}`**, so a Danish document in an English interface is announced in Danish. This is the accessibility payoff of separating the two axes, and it is the specific case to include in the screen-reader test pass.
- The language switch buttons carry `lang` and `hreflang` for their own language, so "English" is pronounced in English even inside a Danish page.

### 17.6 Announcements

- One polite live region for status: saved, copied, export started, export finished, parse complete.
- One assertive region for errors only.
- Language change announced in the **new** language, after `<html lang>` has updated (§9.3).
- Export progress announced at start and end, never on a timer.
- `prefers-reduced-motion: reduce` removes the parse transition, preview scroll-sync animation and all non-essential motion; nothing depends on animation to be understood.

### 17.7 Forms and errors

- Every input has a visible `<label>` with `for` — never a placeholder as the only label.
- Errors are associated via `aria-describedby`, appear next to the field, and describe the fix: **"Datoen skal se ud som 14.08.2026"** / *"The date must look like 14/08/2026"* — not "Invalid input".
- Required fields are marked in text, not with a bare asterisk.
- Nothing auto-submits or auto-navigates on input.

### 17.8 Verification

`axe-core` via Playwright on every screen and every dialog, in both interface languages, as part of CI. Automated scanning catches perhaps half of real issues, so it is paired with a manual pass: keyboard-only walkthrough of the full flow, and a screen-reader pass (NVDA on Windows, VoiceOver on macOS) covering the language switch, the review strip and the export status.

---

## 18. Component inventory

### 18.1 Astro

| Component | Purpose | JS |
| --- | --- | --- |
| `layouts/Base.astro` | `<html lang>`, meta, fonts, CSP | None |
| `layouts/Static.astro` | Help / privacy / about shell | None |
| `components/SiteHeader.astro` | Logo, title, static language links | None |
| `components/SiteFooter.astro` | Organisation line, privacy link | None |
| `pages/index.astro` | Danish workspace | Island |
| `pages/en/index.astro` | English workspace | Island |
| `pages/{hjaelp,privatliv,om}.astro` + `/en/*` | Static content | None |

### 18.2 Svelte island

```
Workspace.svelte                  root; owns DocumentStore, layout mode
├── AppHeader.svelte
│   ├── LanguageSwitch.svelte     interface language, segmented, a11y-complete
│   └── DraftsMenu.svelte
├── EntryScreen.svelte            paste target, resume-draft row
├── ReviewStrip.svelte            parse summary, low-confidence walker
├── EditorPane.svelte
│   ├── DocumentHeaderCard.svelte title, subtitle, date, time, location, docLang
│   ├── SectionCard.svelte        wrapper: heading, reorder, type menu, delete
│   │   ├── RichTextEditor.svelte TipTap mount; lazy on first focus
│   │   ├── EditorToolbar.svelte  bold, italic, link, lists, clear, undo/redo
│   │   ├── AgendaEditor.svelte
│   │   ├── ActionItemsEditor.svelte
│   │   ├── ContactEditor.svelte
│   │   └── NoticeEditor.svelte
│   ├── AddSectionMenu.svelte
│   └── RawTextView.svelte        the third view (§7.5)
├── PreviewPane.svelte
│   ├── PagedPreview.svelte       Paged.js in an isolated subtree
│   ├── PageIndicator.svelte
│   └── ZoomControl.svelte
├── ExportBar.svelte
│   ├── PdfButton.svelte
│   ├── DocxButton.svelte
│   ├── CopyButton.svelte
│   └── SaveStatus.svelte
├── DraftsPanel.svelte            list, rename, delete, file export/import
├── PrivacyNotice.svelte
└── ui/  Button · Dialog · Select · Tabs · Toast · Tooltip · LiveRegion · VisuallyHidden
```

Eight primitives in `ui/`, hand-written. This is the concrete reason `shadcn-svelte` + `unocss-preset-shadcn` is not worth its wiring here (§2): the bridge costs more than the components it would deliver.

### 18.3 Non-visual modules

```
model/      types.ts · factory.ts · migrate.ts · schema.ts (Zod)
parser/     index.ts · normalise.ts · segment.ts · classify.ts · assemble.ts
            enrich.ts · repair.ts · report.ts · rules/{da,en}.ts
render/     html.ts · plaintext.ts · tiptap.ts (RichText ⇄ TipTap JSON)
export/     pdf.ts · docx.ts · clipboard.ts · filename.ts
i18n/       types.ts · da.ts · en.ts · index.ts · format.ts
labels/     types.ts · da.ts · en.ts
storage/    prefs.ts · documents.ts · backup.ts
stores/     document.svelte.ts · lang.ts · status.ts
```

---

## 19. Project and folder structure

### 19.1 Layout

```
newsletter/
├─ astro.config.mjs           output: "static", i18n, UnoCSS, Svelte
├─ uno.config.ts              presetWind4 + design tokens (§12.10)
├─ bunfig.toml                linker, test config
├─ biome.json                 TS/JS/JSON/CSS
├─ .prettierrc                .astro/.svelte/.md only
├─ prek.toml                  git hooks (§19.2)
├─ tsconfig.json              astro/tsconfigs/strict
├─ package.json
├─ docs/
│  └─ PLAN.md
├─ public/
│  └─ brand/                  ishoej-kreds18.{svg,png} + generated @300.png
├─ scripts/
│  └─ build-logo-png.ts       @resvg/resvg-js, run in prebuild (§14.4)
├─ src/
│  ├─ pages/                  index.astro · hjaelp · privatliv · om · en/*
│  ├─ layouts/                Base.astro · Static.astro
│  ├─ components/             SiteHeader.astro · SiteFooter.astro
│  ├─ islands/                Workspace.svelte + the tree in §18.2
│  ├─ lib/                    model · parser · render · export · i18n
│  │                          labels · storage · stores
│  └─ styles/                 tokens.css · print.css · document.css
└─ tests/
   ├─ unit/                   mirrors src/lib
   ├─ fixtures/               real Danish meeting notes + expected NewsletterDoc
   └─ e2e/                    Playwright
```

`src/styles/print.css` is deliberately a plain CSS file, not utility classes: `@page`, break control and print colour adjustment are rules UnoCSS has no reason to generate, and keeping them in one readable file makes the print behaviour auditable.

### 19.2 Tooling and hooks

Per the house rules: **Bun** is the runtime, installer, script runner and test runner; **Biome** owns TS/JS/JSON/CSS; **Prettier** with `prettier-plugin-astro` and `prettier-plugin-svelte` owns template markup, because Biome 2.5's parsing of `.astro` and `.svelte` templates is still maturing.

`prek.toml` is already committed and wires this up. Beyond ordinary hygiene it encodes the stack's anti-patterns as commit-time failures — Bun-only tooling, Svelte 5 runes only, `presetWind4` only, no removed `Astro.glob()`, `client:only` must name its framework, and no runtime-assembled UnoCSS class names. `fix-byte-order-marker` is included specifically because a BOM corrupts the `æøå` handling this project depends on.

`prek install` runs as part of Milestone 1, once `package.json` exists — the local hooks (`biome`, `prettier`, `bun run check`, `bun test`) need it. Until then the config is inert.

Scripts the hooks depend on:

```jsonc
{
  "scripts": {
    "dev": "astro dev",
    "build": "bun run scripts/build-logo-png.ts && astro build",
    "check": "astro check && svelte-check --tsconfig ./tsconfig.json",
    "test": "bun test",
    "test:e2e": "playwright test"
  }
}
```

---

## 20. Testing strategy

### 20.1 Unit — `bun test`

| Area | What is asserted |
| --- | --- |
| **Parser** | A fixture corpus of real Danish meeting notes, each with an expected `NewsletterDoc`. Every rule has a focused test. Adversarial inputs: empty, one word, 50 pages, no line breaks, all caps, mixed Danish/English, decomposed `å`, Windows CRLF, smart quotes, tab-indented lists |
| **Date/time recognition** | Every format in §11.3, plus rejection cases (`14/8` inside a URL, `1.1` as a numbering prefix) |
| **Model** | Migration chain across schema versions; Zod rejects malformed drafts |
| **Converters** | `RichText ⇄ TipTapJSON` round-trip identity, property-tested over generated inline structures |
| **i18n** | Key parity `da` ↔ `en`; no empty strings; no untranslated placeholders; every `{var}` in a Danish string exists in its English counterpart; unknown key falls back to Danish |
| **Formatting** | The exact `Intl` outputs in §8.6, pinned as assertions |
| **Renderers** | HTML and plain-text snapshots per block type, in both document languages |
| **Clipboard HTML** | All styles inline, no `<style>`, no classes, `charset` present, info boxes are tables |
| **DOCX** | Unzip the generated blob with `jszip` and assert against `word/document.xml`: correct labels, `w:lang` = `da-DK`/`en-GB`, numbering definitions present, header/footer present, `æøå` intact |

The DOCX test is worth highlighting: unzipping the blob and asserting on the XML turns "the export works" from a manual claim into a CI gate, with no Word install required.

### 20.2 End-to-end — Playwright

**Core flow:** paste Danish notes → format → verify section count and types → edit a heading → reorder a section → verify the preview updates → export.

**Localisation** (mirrors §24.2 one-for-one):

1. First run with `navigator.language = "en-US"` still opens in Danish.
2. Switch to English; all visible strings change.
3. Reload; English persists; URL is `/en/`.
4. Switch language with content present; deep-equal the document's content nodes before and after.
5. Set interface English + document Danish; preview labels stay Danish, chrome is English.
6. Switch document language; preview labels and the rendered date both change.
7. Danish `14.08.2026` / `15.30` vs English `14/08/2026` / `15:30`.
8. Export PDF and DOCX in each document language; assert generated labels.
9. Crawl every control, dialog and status in both languages; fail on any string absent from the catalog.
10. Type `Ø Æ Å æ ø å` and assert it survives editor → preview → clipboard → DOCX.
11. Operate the language switch by keyboard alone; assert `aria-pressed` and the live-region announcement.

**Export:**

- `page.emulateMedia({ media: "print" })`, then assert page count, that no `h2` is the last element on a page, that a list spans a break with continuing numbering, and that the footer shows the right page number. This is the §24.1.6 contract and it presumes Paged.js.
- The same flow with the lazily-imported `pagedjs` chunk aborted via `page.route()` (§6.4), exercising the "fails to load" branch of §13.2 and asserting the §24.1.7 contract instead: the fallback notice is visible and every section still appears exactly once, in order. Page-number and widow assertions are deliberately absent — a mandatory degradation path is only honest if its weaker guarantees are the ones actually tested. Break behaviour is *not* DOM-observable once Paged.js is gone, so "nothing lost across a break" is asserted from `page.pdf()` text extraction in Chromium and falls to §20.4 elsewhere.
- DOCX: capture the download, unzip, assert structure.
- Clipboard: `context.grantPermissions(["clipboard-read", "clipboard-write"])` (Chromium), read back both flavours, assert both.

**Privacy:** intercept all network traffic during a full paste-edit-export cycle; **fail on any request beyond the app's own static assets.**

**Accessibility:** `axe-core` on every screen and dialog, both languages; keyboard-only traversal of the full flow.

### 20.3 Visual regression

Screenshot the A4 preview at a fixed viewport for a set of canonical documents: one page, three pages, long Danish compound words, a very long link, an agenda spanning a page break, every block type on one page. Both document languages. These catch template drift that no assertion would.

### 20.4 Manual matrix

Automated tests cannot verify what Word does with a DOCX. Once per milestone, on a real install:

| Check | Word (Win) | Word (macOS) | LibreOffice | Google Docs |
| --- | --- | --- | --- | --- |
| Opens without a repair prompt | ✓ | ✓ | ✓ | ✓ |
| Header logo and footer page number correct | ✓ | ✓ | ✓ | ✓ |
| Info boxes render with fill and bar | ✓ | ✓ | ✓ | partial |
| Danish proofing language active | ✓ | ✓ | ✓ | n/a |
| `æøå` correct throughout | ✓ | ✓ | ✓ | ✓ |

Plus a paste pass into Word, Outlook desktop, Outlook web, Gmail and Google Docs against the table in §15.3 — that table is a claim, and it must be checked rather than assumed.

And one print pass per target browser — Chrome, Firefox, Safari desktop, Safari iOS — with Paged.js blocked, checking the §24.1.7 degraded bar on the saved PDF rather than in the DOM. Without Paged.js the page breaks exist only inside the browser's own print engine, so nothing but the output can answer whether content survived them.

---

## 21. Browser compatibility

Target: current Chrome, Edge, Firefox, Safari — desktop and mobile.

| Feature | Chrome / Edge | Firefox | Safari | Mitigation |
| --- | --- | --- | --- | --- |
| `ClipboardItem` + `text/html` | Yes | Yes (127+) | Yes | Three-tier fallback (§15.1) |
| Clipboard on `http://` | No | No | No | HTTPS required |
| `window.print()` | Yes | Yes | Yes | — |
| `@page` margin boxes | **No** | **No** | **No** | Paged.js |
| `orphans` / `widows` | Yes | **No** | Yes | Paged.js |
| `break-after: avoid` | Yes | Partial | Yes | Paged.js |
| Print background colours | Needs `print-color-adjust` | Needs it | Needs it | Set on every tinted block |
| Save as PDF from print | Yes | Yes | Yes (in a dropdown) | Helper copy points at it |
| iOS print | Awkward — share sheet | n/a | Awkward | Documented; DOCX/clipboard preferred |
| Variable fonts | Yes | Yes | Yes | Static fallback in the `@font-face` stack |
| `font-display` | Yes | Yes | Yes | `block` for the preview surface |
| IndexedDB | Yes | Yes | Yes, **7-day eviction** | File export/import (§16.5) |
| localStorage | Yes | Yes | Yes, same eviction | Same |
| `navigator.storage.persist()` | Yes | Yes | Partial | Best-effort only |
| Blob download | Yes | Yes | Yes | — |
| `Intl.DateTimeFormat` da-DK | Yes | Yes | Yes | — |
| `Intl.PluralRules` / `ListFormat` | Yes | Yes | Yes | — |
| `String.prototype.normalize` | Yes | Yes | Yes | — |
| `crypto.randomUUID` | Yes | Yes | Yes (secure ctx) | HTTPS required anyway |
| `structuredClone` | Yes | Yes | Yes | — |
| `prefers-reduced-motion` | Yes | Yes | Yes | — |

**Not supported:** Internet Explorer, and any browser without `ClipboardItem` gets the tier-3 manual copy dialog rather than a broken button.

---

## 22. Risks, limitations and mitigations

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| 1 | **Paged.js is stale** — 0.4.3, last npm publish 2023 | Medium | High | The native print-CSS fallback is mandatory and always present, so a Paged.js failure degrades page numbering rather than breaking export. Pin the version, vendor it if the project goes dark, and keep the abstraction behind `export/pdf.ts` so replacement touches one file |
| 2 | **Logo files absent** (§0) | Certain today | Blocks visual sign-off | Drop-in contract in §12.8; provisional palette anchored on DLF's verified navy; one task closes it |
| 3 | **Parser precision on messy input** | High | Medium | Confidence marking and the review strip (§3.4) make imprecision visible rather than silent; the raw-text view (§7.5) is the escape hatch; a growing fixture corpus turns each field report into a regression test |
| 4 | **Safari 7-day storage eviction** | Certain in Safari | High | File export/import as a v1 requirement, a Safari-specific notice, and `storage.persist()` as best effort (§16.5) |
| 5 | **PDF is a print dialog, not a download** | Certain | Medium | Honest labelling (§13.5). Revisit with a real generator in v2 |
| 6 | **DOCX will not match the PDF** | Certain | Low | Stated in the plan, in `/hjaelp`, and in both languages (§14.6) |
| 7 | **Multiple TipTap instances on a long document** | Medium | Medium | Lazy mount on first focus; unfocused sections render as static HTML. Measure at 30 sections |
| 8 | **Live pagination janks while typing** | Medium | Medium | Paged.js runs debounced on a detached clone, never on the editable DOM (§13.2) |
| 9 | **English text overflowing Danish-sized UI** | Medium | Low | No fixed-width buttons; a Playwright pass at 320 px in both languages; longest-string cases in the fixture set |
| 10 | **Decomposed `æøå` from macOS paste** | Medium | High if unhandled | NFC normalisation at every ingress point, with a unit test (§8.7) |
| 11 | **Scope creep toward a Word clone** | Medium | High | The block-type menu (§5.4) is the contract; adding a type is a design decision, not a feature request |
| 12 | **A future contributor uses gold for text** | Medium | Medium | Stated as a rule in §12.4, checked in code review, and covered by the contrast assertions in the token tests |
| 13 | **Sensitive union content in an unencrypted store** | Medium | High | Explicit, specific warning naming member cases and health information (§16.4); no cloud path exists to leak to |

---

## 23. Implementation plan

Each milestone ends with something that works. Nothing is left half-built between them.

### Milestone 1 — Foundation *(~2 days)*

Scaffold Bun + Astro 7 static + Svelte 5 + UnoCSS with `presetWind4`. `tsconfig` on `astro/tsconfigs/strict`. Biome + Prettier split per §19.2. **`prek install`** — the hooks become live here. Astro i18n routing with `da` unprefixed. The four routes render.

*Done when:* `bun run dev` serves `/` and `/en/`, `bun run check` and `bun test` pass, and `prek run --all-files` is clean.

### Milestone 2 — Model and localisation *(~3 days)*

`model/types.ts`, factory, Zod schema, migration scaffold. `i18n/` with both catalogs, `t()`, `format.ts`. `labels/` with both packs. `$uiLang` and `$docLang` stores with persistence.

*Done when:* the language switch works with persistence, `Intl` assertions match §8.6, and the key-parity test passes.

### Milestone 3 — Parser *(~5 days)*

The eight-stage pipeline, the Danish rule pack, then the English one. `ParseReport` with confidence. The fixture corpus starts here and grows for the rest of the project.

*Done when:* every fixture parses to its expected document and every rule has a test.

### Milestone 4 — Editor and preview *(~6 days)*

Entry screen. Section cards with reorder, type menu, delete. TipTap mounted per section with the restricted schema and lazy mount. Metadata editors. Static HTML preview — **not yet paginated**. Autosave to IndexedDB.

*Done when:* paste → format → edit → autosave → reload → content intact, entirely by keyboard.

### Milestone 5 — Visual design *(~4 days)*

Tokens into `uno.config.ts` and `tokens.css`. Fonts self-hosted. Full A4 document stylesheet, every block type. Logo integrated — **requires the files from §0**. Responsive split/tabs.

*Done when:* the preview matches §12.7 at every breakpoint and the contrast table is verified in code.

### Milestone 6 — Export *(~5 days)*

Paged.js pagination for preview and print, with the fallback path. `print.css`. DOCX builder with the full mapping, headers, footers, numbering, `w:lang`. The build-time logo PNG script. Clipboard with all three tiers.

*Done when:* a three-page newsletter exports to PDF and DOCX in both document languages, opens correctly in Word, and pastes correctly into Word, Outlook and Gmail.

### Milestone 7 — Drafts, privacy, accessibility *(~3 days)*

Named drafts, rename, delete, delete-all. File export/import. Safari eviction notice. Static help/privacy/about pages in both languages. Full accessibility pass: focus, live regions, `axe-core`, keyboard-only, screen reader.

*Done when:* `axe-core` is clean on every screen in both languages and the manual passes are signed off.

### Milestone 8 — Hardening *(~3 days)*

Adversarial parser inputs. Long-document performance. Cross-browser matrix. Visual regression baselines. The manual Word/Outlook/Gmail matrix. Bundle-size check against the §6.4 budget.

*Done when:* the acceptance criteria in §24 all pass.

**Total: ~31 working days.** Milestones 1–4 produce a usable tool; 5–8 make it shippable.

---

## 24. MVP acceptance criteria

### 24.1 Core

1. The app opens in a browser with no install, no account, no backend.
2. Pasting Danish meeting notes and pressing one button produces a structured newsletter.
3. The engine recognises title, subtitle, date, time, location, introduction, headings, sub-headings, paragraphs, agenda, bulleted and numbered lists, decisions, important notices, action items with owner and deadline, quotes, contact details, links, email addresses, closing text and signature.
4. Every engine decision is correctable by the user.
5. The live A4 preview reflects edits within 500 ms.
6. **On the Paged.js path**, multi-page documents paginate with correct breaks: no isolated heading at a page bottom, lists continue with correct numbering, in-content page numbers are correct.
7. **On the print-CSS fallback path** — mandatory whenever Paged.js fails to load, throws, or exceeds its 3-second budget (§13.2) — these degraded criteria apply *instead of* criterion 6: the export still meets criterion 8, every section appears exactly once and in order with no content lost or duplicated across a break, and the preview shows the fallback notice. In-content page numbers, cross-browser-uniform widow control **and** heading/page-bottom isolation are **not** required here — §21 records `orphans`/`widows` as absent in Firefox and `break-after: avoid` as only partial there — and their absence is not a release blocker. That is the whole reason §13.1 rejects print CSS *alone* while §13.2 still requires it as a floor. Both criteria are demonstrated at release: 6 with Paged.js loaded, 7 with it blocked (§20.2).
8. PDF export produces a multi-page document with selectable text and a sharp logo.
9. DOCX export opens in Word without a repair prompt, with headings, lists, links, info boxes, header, footer, logo, margins and A4 page size intact.
10. Copy writes both `text/html` and `text/plain`; pasting into Word preserves headings, lists, links and info boxes.
11. Drafts survive a reload and are deletable by the user.
12. No document content leaves the browser — verified by a network-interception test.
13. The full flow is operable by keyboard alone.
14. `axe-core` reports no violations on any screen in either language.

### 24.2 Localisation — required set

1. **The app opens in Danish on first use**, regardless of browser language.
2. The user can switch the interface to English.
3. The interface language survives a page reload.
4. Switching interface language does not change user content.
5. Interface language and document language are selected independently.
6. Generated template labels follow the document language.
7. Danish and English dates use correct locale conventions — `14.08.2026` / `15.30` and `14/08/2026` / `15:30`.
8. Exported PDF and DOCX use the selected document language for generated labels and metadata.
9. Every control, validation message, dialog, status and accessibility label exists in Danish and English.
10. No untranslated keys reach the user — enforced by the compiler (§8.2) and asserted in CI.
11. Missing translations fall back to Danish.
12. The UI stays usable when English text runs longer than Danish — verified at 320 px in both languages.
13. Danish characters render correctly in editor, preview, clipboard, PDF and DOCX.
14. The language switch is fully keyboard-accessible and screen-reader-friendly, and announces the change in the new language without moving focus.

### 24.3 Explicitly out of scope for v1

Login, cloud sync, real-time collaboration, backend, database, email delivery, CMS, multiple organisations, white-labelling, external AI, automatic translation, template builders, desktop publishing, a Word clone.

---

## 25. Open questions

Ordered by how much the answer changes the work.

| # | Question | Why it matters | Default if unanswered |
| --- | --- | --- | --- |
| 1 | **Where are `018-ishoej.svg` and `018-ishoej.png`?** | Blocks Milestone 5. Nothing else is affected | Build against a placeholder with the correct aspect ratio; swap on arrival |
| 2 | Does Ishøj Lærerkreds have a brand guide with exact colour values and a logo clear-space rule? | The palette is currently derived from DLF's parent identity plus judgement | Use §12.4, re-derive the accent from the SVG |
| 3 | Should the header and footer be editable, or locked to the kreds identity? | Editable header text weakens visual consistency; locked text blocks reuse by other kredse | Organisation name and footer line editable; logo and layout locked |
| 4 | Is the tool for **one** kreds, or will other kredse use the same deployment? | Multi-organisation is explicitly out of scope, but it changes whether the logo is a build-time asset or a user upload | One kreds; logo is a build-time asset |
| 5 | Realistic maximum document length? | Drives the Paged.js performance budget and whether lazy editor mounting is enough | Optimise for 1–8 pages, degrade gracefully to 30 |
| 6 | Are there existing newsletters to use as parser fixtures and design references? | The single highest-value input available. Real notes beat invented ones for both rule design and visual calibration | Construct representative fixtures and mark them as synthetic |
| 7 | Is the English interface for actual English-speaking members, or mainly for external sharing? | Changes how much English rule coverage the parser needs | Full English UI, secondary English parser rules |
| 8 | Should action-item owners come from a small roster the user maintains? | Would improve owner extraction and add a useful autocomplete — but it stores names, which is a privacy consideration | Free text in v1 |
| 9 | Where will this be hosted, and is HTTPS guaranteed? | Clipboard and `crypto.randomUUID` require a secure context | Assume HTTPS static hosting |
| 10 | Is Word 2016 or LibreOffice in scope for the manual matrix? | Affects DOCX feature choices, particularly around tables | Word 2019+, LibreOffice 7+, Google Docs |
