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
