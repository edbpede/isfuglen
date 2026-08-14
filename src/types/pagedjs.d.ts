/**
 * Paged.js ships no type declarations. Rather than reach for `any`, this file
 * declares exactly the surface `src/lib/export/pdf.ts` uses — which is also the
 * abstraction boundary that keeps a Paged.js replacement to one file (§22 risk 1).
 */
declare module "pagedjs" {
  export interface PagedFlow {
    total: number;
    performance: number;
    pages: unknown[];
  }

  export interface PagedPage {
    destroy?: () => void;
    removeListeners?: () => void;
  }

  export interface PagedChunker {
    pages?: PagedPage[];
    stop?: () => void;
  }

  export class Previewer {
    constructor(options?: Record<string, unknown>);

    /**
     * Each rendered page installs a `ResizeObserver`. They have to be shut down
     * before the offscreen stage is removed, or they fire on a detached tree.
     */
    chunker?: PagedChunker;
    /**
     * `stylesheets` is a list whose entries are either a URL or a
     * `{ name: cssText }` record — the argument is spread into the polisher, so
     * a bare record would fail as non-iterable.
     *
     * Passing it explicitly matters: given `undefined`, Paged.js strips every
     * `<style>` and `<link>` out of the document head and adopts them.
     */
    preview(
      content: Element | DocumentFragment | string,
      stylesheets: (string | Record<string, string>)[],
      renderTo: Element,
    ): Promise<PagedFlow>;
  }

  export class Handler {}
  export function registerHandlers(...handlers: unknown[]): void;
}
