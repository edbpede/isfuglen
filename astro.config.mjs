// @ts-check
import svelte from "@astrojs/svelte";
import { defineConfig } from "astro/config";
import UnoCSS from "unocss/astro";

// There is no adapter, no SSR, no middleware and no API route in this project.
// The absence of a server is a product guarantee (docs/PLAN.md §16), so it has
// to be visible here: `output: "static"` and nothing that could weaken it.
export default defineConfig({
  output: "static",
  site: "https://nyhedsbrev.example.org",
  /**
   * The privacy guarantee, enforced rather than asserted (docs/PLAN.md §16.4).
   *
   * Astro generates the policy and hashes its own inline hydration scripts and
   * the one preference-writing script on the static pages, which is why this is
   * configured here rather than hand-written as a `<meta>` tag: a hand-written
   * `script-src 'self'` blocks island hydration outright.
   *
   * `frame-ancestors` is deliberately absent. It is ignored when delivered via
   * `<meta>`, and a directive that silently does nothing is worse than none —
   * it belongs in a response header set by the host.
   */
  security: {
    csp: {
      algorithm: "SHA-256",
      directives: [
        "default-src 'self'",
        "connect-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ],
      /**
       * Scripts stay hash-locked. Styles do not, and cannot: Paged.js injects
       * the stylesheet it has rewritten as a `<style>` element at run time, and
       * no build-time hash can cover output that does not exist until the
       * preview paginates. A CSP that silently disabled pagination would be a
       * worse outcome than a permissive `style-src`, which is not an
       * exfiltration path here — `default-src 'self'` still governs every URL a
       * stylesheet could reference.
       *
       * `'unsafe-inline'` is ignored by browsers whenever a hash is present in
       * the same directive, which is why `build.inlineStylesheets` is set to
       * `never` below: with no inline `<style>` in the output, Astro emits no
       * style hashes and this actually takes effect.
       */
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
  build: {
    inlineStylesheets: "never",
  },
  i18n: {
    defaultLocale: "da",
    locales: ["da", "en"],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [UnoCSS({ injectReset: true }), svelte()],
  vite: {
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          /**
           * Everything named here is dynamically imported and must never enter
           * the initial workspace chunk (docs/PLAN.md §6.4): the paginator, the
           * DOCX writer, the editor (mounted on first focus) and the draft
           * schema (read only at the storage boundary).
           *
           * Naming them makes that visible in `dist/`, lets
           * `scripts/check-bundle.ts` measure the budget rather than estimate
           * it, and gives the fallback test a stable request to block when it
           * exercises the "Paged.js fails to load" branch of §13.2.
           */
          manualChunks(id) {
            if (id.includes("node_modules/pagedjs")) return "pagedjs";
            if (id.includes("node_modules/docx") || id.includes("node_modules/jszip")) {
              return "docx";
            }
            if (id.includes("node_modules/@tiptap") || id.includes("node_modules/prosemirror")) {
              return "editor";
            }
            if (id.includes("node_modules/zod")) return "schema";
            return undefined;
          },
        },
      },
    },
  },
});
