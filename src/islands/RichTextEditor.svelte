<script lang="ts">
  import { Editor } from "@tiptap/core";
  import { sectionBodyExtensions, stripAlienStyles } from "../lib/editor/schema";
  import type { Translator } from "../lib/i18n/index";
  import type { DocLang, Inline } from "../lib/model/types";
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
   */
  interface Props {
    blocks: BodyBlock[];
    docLang: DocLang;
    t: Translator;
    labelledBy?: string;
    onchange: (blocks: BodyBlock[]) => void;
  }

  let { blocks, docLang, t, labelledBy, onchange }: Props = $props();

  let host = $state<HTMLElement>();
  let editor = $state<Editor | undefined>();
  let mounted = $state(false);
  let toolbarVersion = $state(0);

  /** Static render of the unfocused state — the same markup the preview uses. */
  const staticHtml = $derived(renderStatic(blocks));

  function renderStatic(source: BodyBlock[]): string {
    return source
      .map((block) => {
        if (block.type === "paragraph") {
          return `<p>${block.content.map(runToHtml).join("") || "&nbsp;"}</p>`;
        }
        const items = block.items
          .map((item) => `<li>${item.map(runToHtml).join("")}</li>`)
          .join("");
        return block.ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
      })
      .join("");
  }

  function runToHtml(node: Inline): string {
    if (node.kind === "break") return "<br />";
    const escaped = node.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let value = escaped;
    if (node.marks?.includes("italic")) value = `<em>${value}</em>`;
    if (node.marks?.includes("bold")) value = `<strong>${value}</strong>`;
    if (node.kind === "link") value = `<a href="${node.href}">${value}</a>`;
    return value;
  }

  $effect(() => {
    if (!mounted || !host || editor) return;

    const instance = new Editor({
      element: host,
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
        handleKeyDown: (_view, event) => {
          // Escape leaves the editor rather than trapping the caret (§17.2).
          if (event.key !== "Escape") return false;
          const card = host?.closest("[data-section-card]") as HTMLElement | null;
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
    queueMicrotask(() => instance.commands.focus("end"));

    return () => {
      instance.destroy();
      editor = undefined;
    };
  });
</script>

<div class="flex flex-col gap-2">
  {#if mounted && editor}
    <EditorToolbar {t} {editor} version={toolbarVersion} />
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
