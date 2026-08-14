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

  export class Previewer {
    constructor(options?: Record<string, unknown>);
    /**
     * `stylesheets` may be a list of URLs or a record of `{ name: cssText }`.
     * Passing it explicitly matters: given `undefined`, Paged.js strips every
     * `<style>` and `<link>` out of the document head and adopts them.
     */
    preview(
      content: Element | DocumentFragment | string,
      stylesheets: Record<string, string> | string[],
      renderTo: Element,
    ): Promise<PagedFlow>;
  }

  export class Handler {}
  export function registerHandlers(...handlers: unknown[]): void;
}
