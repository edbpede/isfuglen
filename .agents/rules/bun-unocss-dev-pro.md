---
type: "agent_requested"
description: "Bun + Astro + UnoCSS + Svelte + shadcn coding guidelines"
---

# Bun + Astro 7 + UnoCSS + Svelte 5 + shadcn: The Islands Stack Reference

This stack is a **static-first, zero-JS-by-default islands architecture** running on Bun as the sole runtime and toolchain. Astro renders everything to HTML at build time (or on demand via an adapter); Svelte 5 components become interactive "islands" hydrated only where you explicitly opt in; UnoCSS generates atomic CSS on demand; and shadcn supplies copy-in component source you own. Optimize for **shipping as little client JavaScript as possible**: keep logic in `.astro` frontmatter (runs at build/request time on the server), reach for a Svelte island only when a region needs genuine interactivity, and pick the cheapest `client:*` directive that works.

The biggest way agents write wrong-but-plausible code here is by **importing habits from adjacent ecosystems**. Do not treat `.astro` files as React/JSX (no `useState`, no client-side data fetching in a component body). Do not write Svelte 4 (`export let`, `$:`, `on:click`, `new Component()`) — this is a runes-only stack. Do not assume a `tailwind.config.js` drives styling — UnoCSS is the engine and `uno.config.ts` is the source of truth. Do not run `npm`/`pnpm`/`npx` — this is a Bun project (`bun`, `bunx`, `bun --bun`). And critically: **the official `shadcn` CLI's Astro template scaffolds React + Tailwind, not Svelte + UnoCSS** — getting shadcn components into Svelte islands styled by UnoCSS requires a specific, different toolchain documented below.

## Bun: runtime, package manager, and test runner

Bun (1.3.14) is the runtime, installer, script runner, and test runner. There is no separate Node, npm, or Jest in this stack.

**Commands you actually use:**

```bash
# Create the project (Bun runs the wizard and installs with Bun)
bun create astro@latest my-app

# Install dependencies (writes bun.lock, a text lockfile)
bun install

# Add / remove
bun add nanostores @nanostores/persistent
bun add -d unocss @unocss/reset
bun remove some-pkg

# Run package.json scripts
bun run dev
bun run build

# Run a CLI with the Bun runtime instead of Node.
# Without --bun, bunx/bun run execute the tool's Node shebang.
bunx --bun astro dev
bun --bun run astro build
```

**Critical insight on `--bun`:** `bunx astro dev` runs Astro's CLI under Node (Astro ships a `#!/usr/bin/env node` shebang). `bunx --bun astro dev` forces the Bun runtime. Prefer `--bun` for speed, but if an integration hits a Node-compat rough edge, dropping `--bun` (running under Node) is the escape hatch — Astro's official "Use Bun with Astro" recipe warns plainly: "Using Bun with Astro may reveal rough edges. Some integrations may not work as expected."

**`bunfig.toml`** is the canonical config (equivalent to `.npmrc` + test config). Commit it:

```toml
# bunfig.toml
[install]
# "isolated" is the default linker for NEW workspaces (pnpm-style, no phantom deps).
# "hoisted" is default for single-package projects.
linker = "isolated"
exact = true

[install.scopes]
"@mycompany" = { url = "https://npm.mycompany.com/", token = "$NPM_TOKEN" }

[test]
coverage = true
coverageReporter = ["text", "lcov"]
preload = ["./test/setup.ts"]

[run]
# Load .env automatically for `bun run`
dotenv = ".env"
```

**Monorepo:** use native workspaces plus catalogs to pin shared versions once.

```jsonc
// package.json (root)
{
  "name": "monorepo",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "catalog": {
    "astro": "^7.2.0",
    "svelte": "^5.39.0"
  }
}
```

```jsonc
// apps/web/package.json — reference the catalog version
{ "dependencies": { "astro": "catalog:", "svelte": "catalog:" } }
```

```bash
bun install
bun run --filter '@myorg/web' build   # one workspace
bun run --filter '*' test              # all workspaces
```

**Testing** with the built-in runner (`bun test`, Jest-compatible). Bun v1.3.13 added `--parallel`, `--isolate`, `--shard`, and `--changed`; the `--shard` flag matches the syntax used by Jest, Vitest, and Playwright, and test files are sorted by path for determinism and distributed round-robin across shards.

```ts
// src/lib/slug.test.ts
import { expect, test, describe } from "bun:test";
import { slugify } from "./slug";

describe("slugify", () => {
  test("lowercases and hyphenates", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });
});
```

```bash
bun test                    # all tests
bun test --changed          # only files affected by git changes
bun test --parallel --shard 1/3
```

Use `bun test` for unit/logic tests. For component and end-to-end browser tests, use **Playwright** (`bunx --bun playwright test`) — it is the current standard for testing rendered Astro pages and hydrated islands. Do not reach for Jest or Mocha; they are redundant here.

## Astro configuration and rendering modes

Astro 7 (current line, 7.2.x) is a full Rust-compiler rewrite on Vite 8 / Rolldown. `astro.config.mjs` wires integrations and picks the rendering strategy.

```js
// astro.config.mjs
import { defineConfig, envField } from "astro/config";
import svelte from "@astrojs/svelte";
import UnoCSS from "unocss/astro";
import node from "@astrojs/node";

export default defineConfig({
  // "static" (default): prerender everything to HTML.
  // "server": on-demand render everything; opt pages back into static with `export const prerender = true`.
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [
    UnoCSS({ injectReset: true }), // UnoCSS must be present for styles to generate
    svelte(),
  ],
  env: {
    schema: {
      PUBLIC_SITE_NAME: envField.string({ context: "client", access: "public" }),
      DATABASE_URL: envField.string({ context: "server", access: "secret" }),
    },
  },
});
```

**Rendering-mode decision table:**

| Goal | Setting | Where |
| --- | --- | --- |
| Fully static site (blog, marketing, docs) | `output: "static"` (default), no adapter | config |
| Mixed: mostly static, a few dynamic routes | `output: "static"` + `export const prerender = false` on dynamic pages | per page |
| Mostly dynamic app, few static pages | `output: "server"` + adapter + `export const prerender = true` on static pages | per page |
| Personalized fragment on an otherwise static page | `server:defer` (server island) | per component |

**Critical insight:** `output` is a floor, not a wall. Set `output: "static"` and flip individual routes with `export const prerender = false`; you do **not** need `output: "server"` just because one page is dynamic. On-demand rendering (SSR) requires an adapter.

Astro 7's Rust compiler **no longer auto-corrects HTML**. Per the official Astro 7.0 release post: "Unclosed tags like `<div>Hello` and unterminated attributes like `<div class="Hello >` now produce errors instead of being silently corrected." Whitespace between inline elements is also collapsed JSX-style. Write valid, explicitly-closed markup.

**File-based routing** lives in `src/pages/`. Dynamic segments use brackets; API routes are `.ts` files exporting HTTP verb handlers.

```ts
// src/pages/api/posts/[id].ts
import type { APIRoute } from "astro";

export const GET: APIRoute = ({ params }) => {
  return Response.json({ id: params.id });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  return new Response(JSON.stringify(body), { status: 201 });
};
```

## Islands and hydration directives

Framework components render to static HTML by default — **zero JS shipped**. Interactivity requires an explicit `client:*` directive. This is the single most important performance lever in the stack.

```astro
---
// src/pages/index.astro — runs at build/request time on the server
import Layout from "../layouts/Layout.astro";
import Counter from "../components/Counter.svelte";
import Chart from "../components/Chart.svelte";
import SearchBox from "../components/SearchBox.svelte";
import Widget from "../components/Widget.svelte";
---
<Layout>
  <Counter client:load />                    <!-- hydrate immediately (above-the-fold interactivity) -->
  <Chart client:visible />                    <!-- hydrate when scrolled into view -->
  <SearchBox client:idle />                   <!-- hydrate when main thread is idle -->
  <Widget client:media="(min-width: 768px)" /><!-- hydrate only when media query matches -->
  <Counter client:only="svelte" />            <!-- skip SSR entirely; client-render only -->
</Layout>
```

**Directive decision table:**

| Directive | Hydrates | Use for |
| --- | --- | --- |
| `client:load` | Immediately on page load | Critical above-the-fold interactivity |
| `client:idle` | When main thread idle (`requestIdleCallback`) | Low-priority UI (menus, non-urgent widgets) |
| `client:visible` | When element enters viewport | Below-the-fold islands (charts, carousels) — the default choice |
| `client:media="..."` | When CSS media query matches | Responsive-only widgets (mobile drawer) |
| `client:only="svelte"` | Client only, no SSR | Components that break in SSR (access `window`, browser-only libs). **Must name the framework.** |

**Critical gotchas:**
- Props passed to islands must be JSON-serializable. Functions cannot cross the server→client boundary.
- `client:only` **requires the framework value** (`client:only="svelte"`), otherwise Astro cannot ship the right runtime.
- Prefer `client:visible` as the default and reserve `client:load` for genuinely above-the-fold interactivity — every `client:load` is JS in the critical path.

**Server islands** defer rendering of a server-rendered component so the shell can be cached/static while a personalized fragment streams in. Requires an adapter.

```astro
---
// src/components/UserGreeting.astro
const user = await getUserFromCookie(Astro.request);
---
<p>Welcome back, {user.name}</p>
```

```astro
---
import UserGreeting from "../components/UserGreeting.astro";
---
<UserGreeting server:defer>
  <p slot="fallback">Loading…</p>
</UserGreeting>
```

Server-island props must be serializable (plain objects, `number`, `string`, `Array`, `Map`, `Set`, `RegExp`, `Date`, `BigInt`, `URL`, typed arrays, `Infinity`); functions and circular objects are rejected.

## Content collections and the Content Layer API

Structured content (Markdown, MDX, JSON, YAML, or remote data) belongs in **content collections** defined in `src/content.config.ts` with the Content Layer API and loaders. Do not fetch content client-side that could be resolved at build time.

```ts
// src/content.config.ts
import { defineCollection, reference, z } from "astro:content";
import { glob, file } from "astro/loaders";

const blog = defineCollection({
  // glob(): one entry per file — best for pages
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      pubDate: z.coerce.date(),
      heroImage: image().optional(),
      author: reference("authors"),
      draft: z.boolean().default(false),
    }),
});

const authors = defineCollection({
  // file(): many entries from one file — best for structured data
  loader: file("src/data/authors.json"),
  schema: z.object({ id: z.string(), name: z.string(), bio: z.string() }),
});

export const collections = { blog, authors };
```

Query in a page:

```astro
---
import { getCollection, getEntry, render } from "astro:content";

const posts = (await getCollection("blog", ({ data }) => !data.draft))
  .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

const first = await getEntry("blog", posts[0].id);
const { Content } = await render(first);
---
{posts.map((p) => <a href={`/blog/${p.id}`}>{p.data.title}</a>)}
<Content />
```

**Do not use `Astro.glob()`** — it is a removed legacy API. Use the Content Layer (`glob()`/`file()` loaders from `astro/loaders`) for content, and `import.meta.glob` for raw module globbing.

## Astro Actions, middleware, and type-safe server logic

**Actions** are the idiomatic way to call server logic from the client with automatic Zod validation and typed results — use them instead of hand-rolling `fetch` to bespoke API routes for form/mutation logic.

```ts
// src/actions/index.ts
import { defineAction } from "astro:actions";
import { z } from "astro:schema";

export const server = {
  subscribe: defineAction({
    accept: "form",
    input: z.object({ email: z.string().email() }),
    handler: async ({ email }) => {
      await addSubscriber(email);
      return { ok: true, email };
    },
  }),
};
```

Call it from a Svelte island or a script — the result is `{ data, error }`, fully typed:

```svelte
<script lang="ts">
  import { actions } from "astro:actions";
  let email = $state("");
  async function submit() {
    const { data, error } = await actions.subscribe({ email });
    if (!error) console.log("subscribed", data.email);
  }
</script>
<input bind:value={email} />
<button onclick={submit}>Subscribe</button>
```

**Middleware** runs on every on-demand request — use it for auth, headers, and populating `locals`.

```ts
// src/middleware.ts
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = await getUser(context.cookies);
  const response = await next();
  response.headers.set("X-Frame-Options", "DENY");
  return response;
});
```

## Type-safe environment variables with astro:env

Define an explicit env schema; import validated variables from `astro:env/client` or `astro:env/server`. This prevents leaking secrets to the client at type-check time.

```js
// astro.config.mjs (env block)
env: {
  schema: {
    PUBLIC_ANALYTICS_ID: envField.string({ context: "client", access: "public" }),
    STRIPE_SECRET: envField.string({ context: "server", access: "secret" }),
    API_PORT: envField.number({ context: "server", access: "secret", default: 7000 }),
  },
}
```

```ts
// server-side only — importing this client-side throws
import { STRIPE_SECRET, getSecret } from "astro:env/server";
// client-safe
import { PUBLIC_ANALYTICS_ID } from "astro:env/client";

const dynamic = getSecret("SOME_UNDECLARED_VAR"); // string | undefined
```

Prefer `getSecret()` over `process.env` for variables not in the schema. `context: "client"` + `access: "secret"` is impossible by design — there is no safe way to ship a secret to the browser.

## Svelte 5 in Astro: runes, snippets, and islands

This is a **runes-only Svelte 5 stack** (via `@astrojs/svelte`, which requires Svelte 5 for its current major). Svelte 4 idioms are errors or bugs here.

**Reactivity with runes:**

```svelte
<!-- src/components/Counter.svelte -->
<script lang="ts">
  interface Props { start?: number; step?: number; }
  // ONE $props() call; defaults in the destructure
  let { start = 0, step = 1 }: Props = $props();

  let count = $state(start);          // reactive value
  let doubled = $derived(count * 2);  // computed — prefer over $effect for syncing

  // $effect is an escape hatch for side effects (DOM, network, subscriptions), NOT for deriving state
  $effect(() => {
    document.title = `Count: ${count}`;
    return () => { /* cleanup */ };
  });
</script>

<button onclick={() => (count += step)}>{count} (×2 = {doubled})</button>
```

**Rules that separate idiomatic from naive Svelte 5:**
- `onclick`, not `on:click`. Event handlers are plain props/attributes now.
- Never `export let` — that is Svelte 4 and errors in runes mode.
- Never set the same state inside an `$effect` that reads it (infinite loop → `effect_update_depth_exceeded`). Use `$derived` to compute.
- Two-way binding uses `$bindable()`:

```svelte
<!-- Input.svelte -->
<script lang="ts">
  let { value = $bindable("") }: { value?: string } = $props();
</script>
<input bind:value />
<!-- Parent: <Input bind:value={text} /> -->
```

**Snippets replace slots** (`{@render}` + `{#snippet}`):

```svelte
<!-- Card.svelte -->
<script lang="ts">
  import type { Snippet } from "svelte";
  let { header, children }: { header?: Snippet; children: Snippet } = $props();
</script>
<div class="card">
  {#if header}<div class="card-header">{@render header()}</div>{/if}
  <div class="card-body">{@render children()}</div>
</div>
```

```svelte
<Card>
  {#snippet header()}<h2>Title</h2>{/snippet}
  <p>Body content</p>
</Card>
```

**Reactive state outside components** goes in `.svelte.ts` modules — runes work there too. Use a class or a factory for shared logic.

```ts
// src/lib/cart.svelte.ts
class Cart {
  items = $state<{ id: string; qty: number }[]>([]);
  get total() { return this.items.reduce((n, i) => n + i.qty, 0); }
  add(id: string) {
    const found = this.items.find((i) => i.id === id);
    if (found) found.qty++;
    else this.items.push({ id, qty: 1 });
  }
}
export const cart = new Cart();
```

**Critical:** never mount Svelte components with `new Component()` — that is Svelte 4 and removed. Astro's integration handles mounting via `client:*`; if you ever mount manually (outside Astro), use `mount`/`unmount` from `svelte`.

## Cross-island state with nanostores

Each island is an isolated component tree, so ordinary module state does **not** reliably share across islands or survive page navigation. Astro's official recommendation for shared client state is **nanostores**. Per Astro's "Share state between islands" docs: "They're lightweight. Nano Stores ship the bare minimum JS you'll need (less than 1 KB) with zero dependencies. They're framework-agnostic." That size matters because it ships to the client.

```ts
// src/stores/cart.ts
import { atom, computed } from "nanostores";

export const $items = atom<{ id: string; price: number }[]>([]);
export const $total = computed($items, (items) =>
  items.reduce((sum, i) => sum + i.price, 0)
);
export function addItem(item: { id: string; price: number }) {
  $items.set([...$items.get(), item]);
}
```

Consume in a Svelte island with the `$` auto-subscription (nanostores implements the Svelte store contract):

```svelte
<script lang="ts">
  import { $items as items, addItem } from "../stores/cart";
</script>
<p>{$items.length} items</p>
<button onclick={() => addItem({ id: "x", price: 9 })}>Add</button>
```

For state that must survive full page loads (cart, theme), use `@nanostores/persistent`:

```ts
import { persistentAtom } from "@nanostores/persistent";
export const $theme = persistentAtom<"light" | "dark">("theme", "light");
```

Use nanostores for **cross-island / cross-framework** state; use plain Svelte `$state` (or a `.svelte.ts` class) for state that lives inside a single island.

## UnoCSS as the styling engine

UnoCSS (66.x) is the CSS engine via the `unocss/astro` integration — **not Tailwind**. There is no `tailwind.config.js`; `uno.config.ts` is the single source of truth. Use **`presetWind4`**, the current Tailwind-v4-compatible preset. `presetUno` and `presetWind3` are the superseded predecessors — do not reach for them in new code.

```ts
// uno.config.ts
import {
  defineConfig,
  presetWind4,
  presetAttributify,
  presetIcons,
  presetTypography,
  transformerDirectives,
  transformerVariantGroup,
} from "unocss";

export default defineConfig({
  presets: [
    presetWind4(),        // Tailwind-v4-compatible utilities; reset built in
    presetAttributify(),  // group utilities as HTML attributes
    presetIcons({ scale: 1.2 }), // any icon as a class: <div class="i-lucide-menu" />
    presetTypography(),   // prose classes
  ],
  transformers: [
    transformerDirectives(),   // enables @apply / @screen in <style>
    transformerVariantGroup(), // hover:(bg-red-600 text-lg)
  ],
  shortcuts: {
    "flex-center": "flex items-center justify-center",
    "btn": "px-4 py-2 rounded bg-primary text-white hover:bg-primary/90 transition",
  },
  theme: {
    colors: { primary: "#6d28d9" },
  },
});
```

`presetWind4` includes its own reset internally, but the Astro integration reset is controlled separately — enable it via `UnoCSS({ injectReset: true })` in `astro.config.mjs` (or install `@unocss/reset` and point at a reset file). Do not double-inject resets.

**Icons preset** is the idiomatic way to use icons — pure CSS, no component runtime. Install an icon set (`bun add -d @iconify-json/lucide`) and use `class="i-lucide-search"`. This is preferable to shipping an icon component library into an island.

**Attributify and variant groups** keep long class lists readable:

```astro
<!-- attributify -->
<button text="sm white" bg="primary hover:primary/80" p="x-4 y-2">Save</button>
<!-- variant group -->
<button class="p-3 hover:(bg-red-600 text-lg scale-105) transition">Delete</button>
```

**Critical:** UnoCSS only generates classes it finds by scanning source. Do not construct class names dynamically at runtime (`` `text-${color}-500` ``) — they won't be generated. If you must, add them to `safelist` in `uno.config.ts`.

## shadcn on this stack: the honest path

**This is where agents go most wrong.** The stack's stated init command — `bunx --bun shadcn@latest init --preset [CODE] --template astro` — invokes the **official shadcn CLI (v4.x)**, whose `--template astro` path scaffolds **React components (Base UI / Radix primitives) styled with Tailwind CSS**. It does **not** produce Svelte components, and it does **not** target UnoCSS. Per shadcn/ui's official installation docs, the supported templates are "next, vite, start, react-router, and astro" — there is no Svelte target; Vercel's guide confirms "The official project targets React frameworks: Next.js, Vite, TanStack Start, React Router, Astro with React integration, and Laravel," with community ports only "for Vue, Svelte, and Flutter."

So there are two coherent ways to use "shadcn" on an Astro project, and you must pick deliberately:

| Approach | Tool | Components | Styling | Use when |
| --- | --- | --- | --- | --- |
| Official shadcn CLI | `shadcn@latest init --template astro` | **React** (Base UI/Radix), hydrated as React islands | Tailwind v4 | You want the canonical registry and are willing to add `@astrojs/react` and ship React islands |
| Community Svelte port | `shadcn-svelte@latest` (bits-ui based) | **Svelte 5** components you own | Tailwind v4 **or** UnoCSS via preset | You want shadcn-style components inside your Svelte islands — **the right fit for this stack** |

Because this stack's interactive layer is **Svelte 5**, the correct choice for Svelte islands is **`shadcn-svelte`** (built on `bits-ui`), and to keep UnoCSS (not Tailwind) as the engine you bridge it with **`unocss-preset-shadcn`**. Do **not** drop React shadcn components into a Svelte island — they are different frameworks and will not interoperate.

**Wiring shadcn-svelte components to render under UnoCSS:**

The critical rule: **do not run `shadcn-svelte init`** when using UnoCSS — that scaffolds Tailwind. Instead configure `unocss-preset-shadcn` (v1.x, which defaults to `presetWind4`) and add components manually.

```ts
// uno.config.ts (shadcn-svelte + UnoCSS)
import { defineConfig, presetWind4 } from "unocss";
import presetAnimations from "unocss-preset-animations";
import { presetShadcn } from "unocss-preset-shadcn";

export default defineConfig({
  presets: [
    presetWind4(),
    presetAnimations(),
    presetShadcn(), // generates the shadcn theme tokens / color-variable utilities
  ],
  // shadcn-svelte keeps class strings (e.g. buttonVariants) in .ts files,
  // which UnoCSS does NOT scan by default — you MUST include them:
  content: {
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        "(components|src)/**/*.{js,ts}",
      ],
    },
  },
});
```

The **`cn()` utility** shadcn components import is identical across variants and still uses `clsx` + `tailwind-merge` even under UnoCSS:

```ts
// src/lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

```bash
bun add clsx tailwind-merge tailwind-variants
bun add -d unocss-preset-shadcn unocss-preset-animations @unocss/reset
```

**Theming and dark mode:** shadcn's tokens are CSS variables consumed by utility classes (`bg-background`, `text-foreground`, `border-border`). `presetShadcn` wires these up. Dark mode uses the `.dark` class convention (`@custom-variant dark (&:is(.dark *))` in Tailwind projects); toggle by adding/removing `.dark` on `<html>`, ideally driven by a persistent nanostore.

**Animations:** for the UnoCSS path use **`unocss-preset-animations`** (`presetAnimations()`), **not** `tw-animate-css` and **not** `tailwindcss-animate`. `tailwindcss-animate` is deprecated (replaced by `tw-animate-css` in the *Tailwind* shadcn path), and loading it alongside the UnoCSS preset causes duplicate animation rules. Pick one animation source: `unocss-preset-animations` for this stack.

**components.json (shadcn-svelte, Tailwind-v4 / Svelte-5 schema):** the current schema uses `$schema` = `https://shadcn-svelte.com/schema.json`, `tailwind.css` (e.g. `src/app.css`) and `tailwind.baseColor` (`gray | neutral | slate | stone | zinc`, immutable after init), aliases (`lib` = `$lib`, `utils` = `$lib/utils`, `components` = `$lib/components`, `ui` = `$lib/components/ui`, `hooks` = `$lib/hooks`), `typescript`, and `registry` = `https://shadcn-svelte.com/registry`. Path aliases must also be set in `svelte.config.js`.

**Version-drift warning:** `unocss-preset-shadcn`'s README code sample still shows a `presetWind3` import and a Tailwind-v3-style `components.json` (with `style` and `tailwind.config` fields); ignore those — v1.0+ targets `presetWind4`, and for `components.json` follow the current shadcn-svelte schema above (no `tailwind.config`/`style` fields).

## Images, assets, and view transitions

Use Astro's `<Image>` / `<Picture>` from `astro:assets` for optimized, lazy, correctly-sized images. Import local images so Astro can process them at build time.

```astro
---
import { Image } from "astro:assets";
import hero from "../assets/hero.png";
---
<Image src={hero} alt="Hero" width={800} height={400} loading="eager" />
```

For SPA-like navigation with animations, add `<ClientRouter />` (the current name; the old `ViewTransitions` name is deprecated) to a shared `<head>`.

```astro
---
import { ClientRouter } from "astro:transitions";
---
<head>
  <ClientRouter />
</head>
```

Note that `<ClientRouter />` turns the MPA into a pseudo-SPA and requires you to re-initialize scripts after navigation; use `transition:persist` to keep island state across pages. For pure cross-document animation without client routing, native browser view transitions may suffice.

## TypeScript configuration

Extend an Astro tsconfig preset. Use `strict` for most projects, `strictest` for new codebases. Always include `.astro/types.d.ts`.

```jsonc
// tsconfig.json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "$lib": ["src/lib"],
      "$lib/*": ["src/lib/*"]
    }
  }
}
```

Astro presets enable `verbatimModuleSyntax`, so use `import type` for type-only imports. The dev server does **not** type-check for performance; run `bunx --bun astro check` (install `@astrojs/check`) in CI to type-check `.astro` files. Plain `tsc` ignores `.astro` files entirely.

```bash
bun add -d @astrojs/check typescript
bunx --bun astro check
```

## Linting and formatting

**Biome (2.5.x)** is the only linter and formatter in this project — one `biome.json`, Rust-fast, covering JS/TS/CSS/JSON. As of 2.5, Biome lints inside `.astro` and `.svelte` files (JS/TS in `<script>` and CSS in `<style>`), with framework-file rule coverage still expanding. Do not add a second linter or formatter alongside it.

```jsonc
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/2.5.2/schema.json",
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "double" } }
}
```

```bash
bunx --bun biome check --write .
```

**The honest caveat:** Biome 2.5 does not parse Astro/Svelte *template* syntax (the `.astro` markup, Svelte `{#if}` control flow), and it has no Markdown support at all. This project accepts that: template markup and Markdown are not formatted by anything. Biome still lints the frontmatter and the `<script>`/`<style>` blocks in `.astro`/`.svelte` and sorts their imports, but its formatter is disabled for those files in the `biome.json` override — it strips the indentation off the whole `<script>` block. `noUnusedVariables`, `noUnusedImports` and `useConst` are off there for the same reason: Biome cannot see the template markup, so it reports every symbol used only there as unused.

## Deployment adapters

For SSR (`output: "server"` or `"hybrid"`), install an adapter matching your target. `@astrojs/node` (`mode: "standalone"`) runs anywhere Bun/Node runs and is the simplest default; `@astrojs/vercel`, `@astrojs/netlify`, and `@astrojs/cloudflare` target those platforms. Community Bun-native adapters exist that run the built server through `Bun.serve` (e.g. serving `dist/server/entry.mjs` via `bun run`), but for stability prefer the first-party `@astrojs/node` adapter and run it under Bun. Static builds (`output: "static"`) need no adapter — deploy the `dist/` folder to any static host.

## Anti-patterns to avoid

```svelte
<!-- ❌ Svelte 4 — errors or misbehaves in this runes-only stack -->
<script>
  export let name;
  let count = 0;
  $: doubled = count * 2;
</script>
<button on:click={() => count++}>{count}</button>

<!-- ✅ Svelte 5 runes -->
<script lang="ts">
  let { name }: { name: string } = $props();
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
<button onclick={() => count++}>{count}</button>
```

- **❌ Treating `.astro` like React.** No `useState`, no hooks, no client-side `fetch` in a component body. `.astro` frontmatter runs on the server; put interactivity in a Svelte island.
- **❌ Over-hydrating.** `client:load` on everything ships needless JS. Default to `client:visible`; render static where no interactivity is needed.
- **❌ `client:only` without a framework.** Always `client:only="svelte"`.
- **❌ Using `npm`/`pnpm`/`npx`.** Use `bun`, `bunx`, and `bunx --bun` / `bun --bun` to run CLIs under the Bun runtime.
- **❌ Expecting a `tailwind.config.js`.** UnoCSS is the engine; configure `uno.config.ts`. Use `presetWind4`, not `presetUno`/`presetWind3`.
- **❌ Dynamic class strings** (`` `text-${c}-500` ``) — UnoCSS can't scan them; use `safelist` or full literal classes.
- **❌ `Astro.glob()`** — removed. Use Content Layer `glob()`/`file()` loaders or `import.meta.glob`.
- **❌ Client-side fetching of build-time data.** Resolve content in frontmatter / content collections; reserve client fetches for genuinely dynamic data (and prefer Astro Actions).
- **❌ Dropping React shadcn components into Svelte islands.** Use `shadcn-svelte` (bits-ui) for Svelte; the official `shadcn` CLI's Astro template is React + Tailwind.
- **❌ Running `shadcn-svelte init` when using UnoCSS.** That scaffolds Tailwind; configure `unocss-preset-shadcn` and add components manually instead.
- **❌ `new Component()` to mount Svelte.** Removed in Svelte 5; Astro's `client:*` handles mounting (or `mount`/`unmount` outside Astro).

## Version & compatibility

| Component | Version (research basis) | Notes |
| --- | --- | --- |
| Bun | 1.3.14 | Runtime + installer + test runner; `bun.lock` text lockfile; isolated linker default for new workspaces |
| Astro | 7.2.x | Rust compiler, Vite 8 / Rolldown, queued rendering, Advanced Routing (`src/fetch.ts`), route caching stable |
| `@astrojs/svelte` | 9.x | Svelte 5 support since v6; enables SSR + hydration for Svelte islands |
| Svelte | 5.x | Runes-only (`$state`/`$derived`/`$effect`/`$props`/`$bindable`); snippets replace slots |
| UnoCSS | 66.x | `unocss/astro` integration; `presetWind4` current (`presetWind3`/`presetUno` superseded) |
| shadcn (official CLI) | 4.x | `--template astro` = **React + Tailwind**; no Svelte target |
| shadcn-svelte | 1.x | Community Svelte 5 port on `bits-ui`; requires Svelte 5 + Tailwind 4 |
| unocss-preset-shadcn | 1.x | Bridges shadcn tokens to UnoCSS; defaults to `presetWind4` |
| bits-ui | 2.x | Headless Svelte primitives underpinning shadcn-svelte |
| Biome | 2.5.x | Recommended lint+format; Astro/Svelte template parsing still maturing |

- **Research date:** August 14, 2026
- **Research basis:** current official docs, release notes, specifications, changelogs, and primary repositories.

