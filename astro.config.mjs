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
    },
  },
  i18n: {
    defaultLocale: "da",
    locales: ["da", "en"],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [UnoCSS({ injectReset: true }), svelte()],
  vite: {
    build: {
      // pagedjs and docx are dynamically imported; keep them out of the
      // initial workspace chunk (docs/PLAN.md §6.4).
      chunkSizeWarningLimit: 900,
    },
  },
});
