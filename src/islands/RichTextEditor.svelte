<script lang="ts">
  import type { Editor } from "@tiptap/core";
  import type { Translator } from "../lib/i18n/index";
  import type { DocLang } from "../lib/model/types";
  import { looksStructured } from "../lib/parser/paste";
  import { renderInline } from "../lib/render/html";
  import { type BodyBlock, blocksToTipTapDoc, tipTapDocToBlocks } from "../lib/render/tiptap";
  import EditorToolbar from "./EditorToolbar.svelte";

  /**
   * A TipTap instance over one section's body — docs/PLAN.md §7.3.
   *
   * Three rules are encoded here, and each of them is a bug that would otherwise
   * be found late:
   *
   * 1. One `$effect`, with cleanup. TipTap owns real DOM and real event
   *    listeners; failing to `destroy()` on section removal leaks them.
   * 2. The editor is uncontrolled. `NewsletterDoc` is updated *from* it, never
   *    fed back into it — doing so causes cursor jumps and, with runes, an
   *    `effect_update_depth_exceeded` loop.
   * 3. Lazy mount on first focus. Until then the section renders as static HTML
   *    identical to the preview, which keeps a fifteen-section document at one or
   *    two live ProseMirror instances and makes the first paint after a parse
   *    instant.
   *
   * TipTap and its schema are imported at that same moment rather than at module
   * scope. An editor nobody has focused yet has no business costing ~90 KB gz of
   * the initial workspace payload, and the plan's budget is not met without this
   * (§6.4). The type-only import above compiles away entirely.
   */
  interface Props {
    blocks: BodyBlock[];
    docLang: DocLang;
    t: Translator;
    labelledBy?: string;
    onchange: (blocks: BodyBlock[]) => void;
    /** Lay a large structured paste out as sections, replacing this one. */
    onformat?: (raw: string) => void;
  }

  let { blocks, docLang, t, labelledBy, onchange, onformat }: Props = $props();

  let host = $state<HTMLElement>();
  let editor = $state<Editor | undefined>();
  let mounted = $state(false);
  let toolbarVersion = $state(0);
  /** A large structured paste waiting for the user's choice (§11.7). */
  let pendingPaste = $state<string | null>(null);

  /**
   * Static render of the unfocused state — literally the preview's inline
   * renderer, only the block wrappers differ.
   *
   * It is spelled this way because the second copy of that loop was a
   * cross-site scripting hole: it went into `{@html}` with an unescaped `href`,
   * so an imported draft or a pasted `[label](https://x"onmouseover=…)` could
   * add an event handler to this page. `renderInline` escapes the attribute and
   * applies the very predicate the editor schema is configured with, so there is
   * nowhere left for the two to drift apart.
   */
  const staticHtml = $derived(renderStatic(blocks));

  function renderStatic(source: BodyBlock[]): string {
    return source
      .map((block) => {
        if (block.type === "paragraph") {
          return `<p>${renderInline(block.content) || "&nbsp;"}</p>`;
        }
        const items = block.items.map((item) => `<li>${renderInline(item)}</li>`).join("");
        return block.ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
      })
      .join("");
  }

  $effect(() => {
    if (!mounted || !host || editor) return;

    const element = host;
    let instance: Editor | undefined;
    let cancelled = false;

    void (async () => {
      const [{ Editor: TipTapEditor }, { sectionBodyExtensions, stripAlienStyles }] =
        await Promise.all([import("@tiptap/core"), import("../lib/editor/schema")]);
      if (cancelled) return;

      instance = new TipTapEditor({
        element,
        extensions: sectionBodyExtensions(t("section.bodyPlaceholder")),
        content: blocksToTipTapDoc(blocks),
        editorProps: {
          attributes: {
            class: "nl-editor-surface",
            role: "textbox",
            "aria-multiline": "true",
            "aria-label": t("section.body"),
            ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
            lang: docLang,
          },
          transformPastedHTML: stripAlienStyles,
          /**
           * A large, structured plain-text paste into an *empty* section is the
           * one case where the user might have meant "lay this out", so it is
           * offered as an inline, non-modal choice. The default is plain text:
           * they asked to paste, not to restructure (§11.7).
           */
          handlePaste: (view, event) => {
            if (!onformat) return false;
            const text = event.clipboardData?.getData("text/plain") ?? "";
            if (text.length === 0) return false;
            if (!view.state.doc.textContent.trim().length && looksStructured(text)) {
              pendingPaste = text;
            }
            return false;
          },
          handleKeyDown: (_view, event) => {
            // Escape leaves the editor rather than trapping the caret (§17.2).
            if (event.key !== "Escape") return false;
            const card = element.closest("[data-section-card]") as HTMLElement | null;
            card?.focus();
            return true;
          },
        },
        onUpdate: ({ editor: current }) => {
          onchange(tipTapDocToBlocks(current.getJSON()));
        },
        onSelectionUpdate: () => {
          toolbarVersion += 1;
        },
        onTransaction: () => {
          toolbarVersion += 1;
        },
      });

      editor = instance;
      instance.commands.focus("end");
    })();

    return () => {
      cancelled = true;
      instance?.destroy();
      editor = undefined;
    };
  });
</script>

<div class="flex flex-col gap-2">
  {#if mounted && editor}
    <EditorToolbar {t} {editor} version={toolbarVersion} />
  {/if}

  {#if pendingPaste}
    <div
      class="flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-surface-sunken p-2 text-sm"
    >
      <p class="flex-1">{t("paste.question")}</p>
      <button
        type="button"
        class="btn-secondary text-xs"
        onclick={() => {
          const raw = pendingPaste;
          pendingPaste = null;
          if (raw) onformat?.(raw);
        }}
      >
        {t("paste.asSections")}
      </button>
      <button
        type="button"
        class="btn-ghost text-xs"
        onclick={() => {
          pendingPaste = null;
        }}
      >
        {t("paste.keepPlain")}
      </button>
    </div>
  {/if}

  {#if mounted}
    <div
      bind:this={host}
      class="nl-editor rounded-md border border-hairline bg-white px-3 py-2"
    ></div>
  {:else}
    <!--
      Unfocused sections are static HTML. `focusin` and a keyboard-reachable
      button both promote them, so the lazy mount is never a keyboard trap.
    -->
    <button
      type="button"
      class="nl-editor w-full rounded-md border border-hairline bg-white px-3 py-2 text-left focus-ring"
      aria-label={t("section.body")}
      onfocusin={() => {
        mounted = true;
      }}
      onclick={() => {
        mounted = true;
      }}
    >
      {@html staticHtml}
    </button>
  {/if}
</div>

<style>
  .nl-editor :global(p) {
    margin: 0 0 0.5rem;
  }

  .nl-editor :global(p:last-child) {
    margin-bottom: 0;
  }

  .nl-editor :global(ul),
  .nl-editor :global(ol) {
    margin: 0 0 0.5rem;
    padding-left: 1.4rem;
  }

  .nl-editor :global(li) {
    margin-bottom: 0.2rem;
  }

  .nl-editor :global(a) {
    color: var(--c-brand-mid);
    text-decoration: underline;
  }

  .nl-editor :global(.nl-editor-surface) {
    outline: none;
    min-height: 3.5rem;
  }

  .nl-editor :global(.nl-editor-surface p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    float: left;
    height: 0;
    color: var(--c-muted);
    opacity: 0.7;
    pointer-events: none;
  }
</style>
