import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * The dependency budget of docs/PLAN.md §6.4, enforced.
 *
 * "Initial workspace payload under 160 KB gz excluding fonts", with `pagedjs`
 * and `docx` dynamically imported so neither enters that number. A budget that
 * is only written down is a budget that drifts, so this fails the build instead.
 *
 *   bun run scripts/check-bundle.ts
 */

const DIST = join(import.meta.dir, "..", "dist");
const ASSETS = join(DIST, "_astro");

/** Kilobytes, gzipped, of everything the workspace route loads up front. */
const INITIAL_BUDGET_KB = 160;

/** Chunks that must stay lazy. Their names come from `manualChunks`. */
const LAZY = ["pagedjs", "docx", "editor", "schema"];

interface Chunk {
  name: string;
  gzipKb: number;
}

async function gzipKb(path: string): Promise<number> {
  const bytes = await readFile(path);
  return Math.round((gzipSync(bytes).byteLength / 1024) * 10) / 10;
}

const entries = await readdir(ASSETS);
const scripts = entries.filter((name) => name.endsWith(".js"));

const chunks: Chunk[] = [];
for (const name of scripts) {
  chunks.push({ name, gzipKb: await gzipKb(join(ASSETS, name)) });
}

const lazy = chunks.filter((chunk) => LAZY.some((prefix) => chunk.name.startsWith(`${prefix}.`)));
const initial = chunks.filter((chunk) => !lazy.includes(chunk));

const initialTotal = Math.round(initial.reduce((sum, chunk) => sum + chunk.gzipKb, 0) * 10) / 10;
const lazyTotal = Math.round(lazy.reduce((sum, chunk) => sum + chunk.gzipKb, 0) * 10) / 10;

console.log("Initial workspace payload (gzipped, excluding fonts):");
for (const chunk of [...initial].sort((a, b) => b.gzipKb - a.gzipKb)) {
  console.log(`  ${chunk.gzipKb.toFixed(1).padStart(7)} KB  ${chunk.name}`);
}
console.log(`  ${initialTotal.toFixed(1).padStart(7)} KB  TOTAL (budget ${INITIAL_BUDGET_KB} KB)`);

console.log("\nLazily imported, outside the budget:");
for (const chunk of [...lazy].sort((a, b) => b.gzipKb - a.gzipKb)) {
  console.log(`  ${chunk.gzipKb.toFixed(1).padStart(7)} KB  ${chunk.name}`);
}
console.log(`  ${lazyTotal.toFixed(1).padStart(7)} KB  TOTAL`);

const problems: string[] = [];

if (lazy.length < LAZY.length) {
  problems.push(
    `Expected a named chunk for each of ${LAZY.join(", ")}; found ${lazy.length}. ` +
      "A lazy dependency that has been folded into the initial bundle is a budget failure, " +
      "not a naming detail.",
  );
}

if (initialTotal > INITIAL_BUDGET_KB) {
  problems.push(
    `Initial payload is ${initialTotal} KB gz, over the ${INITIAL_BUDGET_KB} KB budget.`,
  );
}

if (problems.length > 0) {
  console.error(`\n${problems.map((problem) => `✗ ${problem}`).join("\n")}`);
  process.exit(1);
}

console.log("\n✓ Within budget.");
