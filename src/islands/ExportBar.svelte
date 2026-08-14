<script lang="ts">
  import { renderClipboard, writeToClipboard } from "../lib/export/clipboard";
  import { docxFilename } from "../lib/export/filename";
  import { printNewsletter } from "../lib/export/pdf";
  import { formatClockTime } from "../lib/i18n/format";
  import type { Translator } from "../lib/i18n/index";
  import type { Lang } from "../lib/i18n/types";
  import { labelsFor } from "../lib/labels/index";
  import type { NewsletterDoc } from "../lib/model/types";
  import type { SaveState } from "../lib/stores/status.svelte";
  import Dialog from "./ui/Dialog.svelte";

  /**
   * Export is a persistent bar in the workspace, not a destination — the user
   * never navigates away from their document to export it (docs/PLAN.md §3.2).
   *
   * The PDF button says what actually happens. "Hent PDF" would promise a
   * download this version cannot deliver without rasterising the document, and a
   * tool that mislabels one button teaches the user to distrust every other one
   * (§13.5).
   */
  interface Props {
    doc: NewsletterDoc;
    t: Translator;
    lang: Lang;
    saveState: SaveState;
    savedAt: string | null;
    announce: (message: string) => void;
    onerror: (message: string) => void;
    onsavedraft: () => void;
  }

  let { doc, t, lang, saveState, savedAt, announce, onerror, onsavedraft }: Props = $props();

  let busy = $state(false);
  let copied = $state(false);
  let copyDialogOpen = $state(false);
  let manualHtml = $state("");
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  const status = $derived.by(() => {
    if (saveState === "saving") return t("save.saving");
    if (saveState === "failed") return t("save.failed");
    if (saveState === "unavailable") return t("storage.unavailable");
    if (saveState === "saved" && savedAt)
      return t("save.saved", { time: formatClockTime(savedAt, lang) });
    return t("save.unsaved");
  });

  async function downloadDocx(): Promise<void> {
    busy = true;
    announce(t("export.docxWorking"));
    try {
      // Dynamically imported: `docx` and jszip are ~180 KB and must never enter
      // the initial workspace bundle (§6.4).
      const [{ buildDocx, loadLogo }] = await Promise.all([import("../lib/export/docx")]);
      const logo = await loadLogo();
      const blob = await buildDocx(doc, labelsFor(doc.docLang), logo ? { logo } : {});

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = docxFilename(doc);
      anchor.click();
      URL.revokeObjectURL(url);

      announce(t("export.docxDone"));
    } catch (error) {
      onerror(`${t("export.docxFailed")} ${String(error)}`);
    } finally {
      busy = false;
    }
  }

  async function copy(): Promise<void> {
    const payload = renderClipboard(doc, labelsFor(doc.docLang));
    const outcome = await writeToClipboard(payload);

    if (outcome.ok) {
      copied = true;
      copyDialogOpen = true;
      announce(t("export.copied"));
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copied = false;
      }, 4000);
      return;
    }

    // Tier 3: show the document pre-selected with an instruction. A copy button
    // that simply fails is worse than no copy button (§15.1).
    manualHtml = payload.html;
    copyDialogOpen = true;
    onerror(t("export.copyFailed"));
  }
</script>

<div
  class="app-chrome flex flex-wrap items-center gap-3 border-t border-hairline bg-white px-4 py-3"
>
  <button type="button" class="btn-primary" onclick={() => printNewsletter(doc)}>
    {t("export.pdf")}
  </button>
  <span class="text-xs text-muted">{t("export.pdfHint")}</span>

  <button type="button" class="btn-secondary" disabled={busy} onclick={downloadDocx}>
    {busy ? t("export.docxWorking") : t("export.docx")}
  </button>

  <button type="button" class="btn-secondary" onclick={copy}>
    {#if copied}<span aria-hidden="true">✓</span>{/if}
    {copied ? t("export.copied") : t("export.copy")}
  </button>

  <div class="ml-auto flex items-center gap-3 text-xs text-muted">
    <span>{status}</span>
    <span aria-hidden="true">·</span>
    <span>{t("save.localOnly")}</span>
    <button type="button" class="btn-ghost text-xs" onclick={onsavedraft}>
      {t("save.saveAsDraft")}
    </button>
  </div>
</div>

<Dialog
  open={copyDialogOpen}
  title={t("export.copyDialog")}
  closeLabel={t("a11y.dialogClose")}
  onclose={() => {
    copyDialogOpen = false;
    manualHtml = "";
  }}
>
  {#if manualHtml}
    <p class="mb-2 text-sm font-medium text-ink">{t("export.copyManual")}</p>
    <div class="max-h-64 overflow-auto rounded-md border border-hairline p-3 text-sm">
      {@html manualHtml}
    </div>
  {:else}
    <p class="text-sm font-semibold text-decision-bar">✓ {t("export.copied")}</p>
    <p class="mt-3 text-sm">{t("export.copyBody")}</p>
    <p class="mt-3 text-sm">{t("export.copyIncluded")}</p>
    <p class="mt-1 text-sm text-muted">{t("export.copyExcluded")}</p>
  {/if}

  {#snippet footer()}
    <button
      type="button"
      class="btn-primary"
      onclick={() => {
        copyDialogOpen = false;
        manualHtml = "";
      }}
    >
      {t("export.close")}
    </button>
  {/snippet}
</Dialog>
