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

  const collected: CSSStyleSheet[] = [];
  const previous = activeSheets;
  let previewer: Awaited<ReturnType<typeof loadPreviewer>> | undefined;

  try {
    previewer = await loadPreviewer();

    const polisher = (previewer as unknown as { polisher?: PolisherLike }).polisher;
    if (polisher && supportsConstructableSheets()) {
      redirectPolisherToCssom(polisher, collected);
    }

    // `preview` spreads its second argument into `polisher.add(...)`, so it has
    // to be a list. Each entry is either a URL or a `{ name: cssText }` record;
    // passing the text directly avoids a second network request for a
    // stylesheet the bundle already contains.
    const flow = await withTimeout(
      previewer.preview(source, [{ "nl-paged": options.css }], stage),
      budget,
    );

    // The new sheets style the markup about to be swapped in, so the previous
    // run's sheets are only dropped once this one has succeeded.
    activeSheets = collected;
    dropSheets(previous);

    const durationMs = performance.now() - started;
    return { ok: true, html: stage.innerHTML, pages: flow.total ?? countPages(stage), durationMs };
  } catch (error) {
    dropSheets(collected);
    const durationMs = performance.now() - started;
    const reason: PaginationFailure = error instanceof TimeoutError ? "timeout" : "error";
    return { ok: false, reason, detail: String(error), durationMs };
  } finally {
    // The markup has already been captured, so the live pages are only holding
    // observers now. Detaching the stage without shutting them down first makes
    // them fire against a detached tree on the next resize.
    teardown(previewer);
    stage.remove();
  }
}

async function loadPreviewer() {
  const { Previewer } = await import("pagedjs");
  return new Previewer();
}

function teardown(
  previewer: { chunker?: { pages?: { destroy?: () => void }[]; stop?: () => void } } | undefined,
): void {
  if (!previewer?.chunker) return;
  try {
    previewer.chunker.stop?.();
    for (const page of previewer.chunker.pages ?? []) page.destroy?.();
  } catch {
    /* Teardown is best effort; a failure here must not fail the pagination. */
  }
}

function countPages(container: HTMLElement): number {
  return container.querySelectorAll(".pagedjs_page").length;
}

/**
 * Paged.js writes the stylesheet it has rewritten into a `<style>` element with
 * text content. The Content Security Policy hashes the inline styles that exist
 * at build time and permits nothing else, and no build-time hash can cover
 * output that does not exist until the preview paginates.
 *
 * So the polisher is redirected through the CSSOM, which CSP does not govern.
 * The alternative was a permissive `style-src`, which is impossible to combine
 * with hashes — browsers ignore `'unsafe-inline'` whenever a hash is present in
 * the same directive.
 *
 * Where constructable stylesheets are unavailable the original behaviour stands,
 * and a CSP that then blocks it takes the documented fallback path (§13.2).
 */
interface PolisherLike {
  insert?: (text: string) => unknown;
}

/** The sheets belonging to the most recent successful pagination. */
let activeSheets: CSSStyleSheet[] = [];

function supportsConstructableSheets(): boolean {
  return (
    typeof CSSStyleSheet !== "undefined" &&
    typeof CSSStyleSheet.prototype.replaceSync === "function" &&
    "adoptedStyleSheets" in Document.prototype
  );
}

function redirectPolisherToCssom(polisher: PolisherLike, collected: CSSStyleSheet[]): void {
  polisher.insert = (text: string) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    collected.push(sheet);
    // Paged.js only ever calls `.remove()` on what this returns.
    return document.createElement("style");
  };
}

function dropSheets(sheets: CSSStyleSheet[]): void {
  if (sheets.length === 0) return;
  document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
    (sheet) => !sheets.includes(sheet),
  );
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
