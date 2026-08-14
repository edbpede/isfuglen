<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * A labelled form field. Every input in this app has a visible `<label for>`
   * — never a placeholder as the only label — and an error is associated by
   * `aria-describedby` and says what to do about it (docs/PLAN.md §17.7).
   */
  interface Props {
    id: string;
    label: string;
    error?: string;
    hint?: string;
    class?: string;
    children: Snippet<[{ id: string; describedBy: string | undefined }]>;
  }

  let { id, label, error, hint, class: extra = "", children }: Props = $props();

  const hintId = $derived(`${id}-hint`);
  const errorId = $derived(`${id}-error`);
  const describedBy = $derived(
    [hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined,
  );
</script>

<div class="flex flex-col gap-1 {extra}">
  <label class="field-label" for={id}>{label}</label>
  {@render children({ id, describedBy })}
  {#if hint}
    <p id={hintId} class="text-xs text-muted">{hint}</p>
  {/if}
  {#if error}
    <p id={errorId} class="text-xs font-medium text-action-bar">{error}</p>
  {/if}
</div>
