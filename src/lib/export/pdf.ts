import type { NewsletterDoc } from "../model/types";
import { printTitle } from "./filename";

/**
 * PDF — docs/PLAN.md §13.
 *
 * There is no PDF generator in this bundle, and the button says so: "Udskriv
 * eller gem som PDF". A true one-click download would require either rasterising
 * the document — which kills selectable text and logo sharpness — or hand-building
 * a typesetter, which is weeks of work and a long tail of Danish line-breaking
 * bugs. Printing keeps the text real, the fonts real and the logo vector.
 *
 * Paged.js paginates both the on-screen preview and the printed document, so the
 * preview matches the export by construction. The native print stylesheet is a
 * mandatory fallback, not a hypothetical one: if Paged.js fails to load, throws,
 * or exceeds its budget, the export still meets the degraded criteria of
 * §24.1.7 and the preview says so.
 */

/** Exceeding this is treated as a Paged.js failure, not something to wait out. */
export const PAGINATION_BUDGET_MS = 3000;

export type PaginationFailure = "load" | "error" | "timeout";

export type PaginationResult =
  | { ok: true; html: string; pages: number; durationMs: number }
  | { ok: false; reason: PaginationFailure; detail: string; durationMs: number };

export interface PaginateOptions {
  /** The document markup, exactly as the preview renders it. */
  html: string;
  /** The Paged.js stylesheet text; see `src/styles/paged.css`. */
  css: string;
  budgetMs?: number;
}

/**
 * Runs Paged.js over a detached, non-editable clone and returns the paginated
 * markup. Never touches the editor's DOM: Paged.js rewrites what it is given,
 * and typing must never fight the paginator.
 */
export async function paginate(options: PaginateOptions): Promise<PaginationResult> {
  const budget = options.budgetMs ?? PAGINATION_BUDGET_MS;
  const started = performance.now();

  if (typeof document === "undefined") {
    return { ok: false, reason: "load", detail: "No DOM", durationMs: 0 };
  }

  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.style.cssText =
    "position:fixed;left:-20000px;top:0;width:210mm;visibility:hidden;pointer-events:none;";
  document.body.appendChild(stage);

  const source = document.createElement("div");
  source.innerHTML = options.html;

  try {
    const { Previewer } = await import("pagedjs");
    const previewer = new Previewer();

    const flow = await withTimeout(
      previewer.preview(source, { "nl-paged": options.css }, stage),
      budget,
    );

    const durationMs = performance.now() - started;
    return { ok: true, html: stage.innerHTML, pages: flow.total ?? countPages(stage), durationMs };
  } catch (error) {
    const durationMs = performance.now() - started;
    const reason: PaginationFailure = error instanceof TimeoutError ? "timeout" : "error";
    return { ok: false, reason, detail: String(error), durationMs };
  } finally {
    stage.remove();
  }
}

function countPages(container: HTMLElement): number {
  return container.querySelectorAll(".pagedjs_page").length;
}

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`Exceeded ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Opens the print dialog with the document's own title in place, so the saved
 * file is named after the newsletter rather than after the app. Restored
 * afterwards, including when the user cancels.
 */
export function printNewsletter(doc: NewsletterDoc): void {
  const previous = document.title;
  document.title = printTitle(doc);

  const restore = () => {
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);

  window.print();

  // Safari does not always fire `afterprint`; the timeout is the safety net.
  setTimeout(restore, 2000);
}
