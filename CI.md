# Development CI

Every PR, default-branch push and manual `ci.yml` dispatch runs the same checks.
The required `ci / required` aggregate rejects failed, cancelled, missing and
skipped prerequisites. Workflow validation is read-only and rejects tracked-file
mutations. Shared guards, gate and Biome repair use versioned releases of
`engels74/automation`; all external action references use full version tags.

The quality lane runs complementary prek hygiene and stack guards, read-only
Biome, actual type checks, applicable unit tests, a static build and applicable
bundle budget. It uploads one `site-dist` artifact. HTTP smoke and browser lanes
consume those exact bytes, so they neither rebuild nor accidentally test a dev
server. Frozen installs use packageManager's Bun version and a lockfile-keyed cache.
Only `ci.yml` has development triggers; the other check workflows are callable lanes.

Derived logo/font assets precede the unit suite. Bundle limits, eight routes, CSP, privacy, accessibility, DOCX and PDF exports remain covered, including all three browser engines.

Reproduce locally: `bun install --frozen-lockfile`, then
`SKIP=no-commit-to-branch,biome,build prek run --all-files --hook-stage manual`,
`bash .github/scripts/check.sh`, and `bash .github/scripts/smoke.sh`.
Where a browser suite exists, install its Playwright browsers and run
`CI=true bun run test:e2e` after the build. Keep port 4321 free for these checks.
Prek's Biome and build hooks are skipped only because explicit CI steps cover them;
the default-branch hook applies to local commits. No existing stack guards are removed.

The shared Renovate preset includes the official Biome schema manager and isolates
Biome/TypeScript/prek groups. Biome repair computes changes without write permission,
then a separate publisher validates the allowed paths and live PR head before
committing and dispatching full CI on the new SHA. Existing template formatting
exclusions remain in force. TypeScript stays below 7 until Astro/Svelte language
tools support its compiler API.

Automerge stays off until the corrected shared policy and strict required-check
protection are activated. Pages publishing remains separate from development CI.

The Bun-only hook recognizes Renovate's `datasource=npm` metadata without
treating it as a package-manager invocation. An injected `run: npm install`
fixture was rejected by the unchanged command policy.
