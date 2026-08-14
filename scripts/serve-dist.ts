import { existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

/**
 * A static file server for `dist/`, used by the Playwright suite.
 *
 * `astro preview` manages a background daemon, which makes "did the server
 * start" ambiguous for a test runner and leaves a process behind between runs.
 * This serves the same directory in the foreground, exits with the runner, and —
 * because it sets no headers of its own — keeps the privacy test honest about
 * what the built site actually requests.
 */

const ROOT = join(import.meta.dir, "..", "dist");
const PORT = Number(process.env.PORT ?? 4321);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function resolve(pathname: string): string | undefined {
  const decoded = decodeURIComponent(pathname);
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const direct = join(ROOT, safe);

  if (existsSync(direct) && statSync(direct).isFile()) return direct;

  const indexed = join(direct, "index.html");
  if (existsSync(indexed)) return indexed;

  const withHtml = `${direct}.html`;
  if (existsSync(withHtml)) return withHtml;

  return undefined;
}

Bun.serve({
  port: PORT,
  fetch(request) {
    const url = new URL(request.url);
    const file = resolve(url.pathname);
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(Bun.file(file), {
      headers: { "content-type": TYPES[extname(file)] ?? "application/octet-stream" },
    });
  },
});

console.log(`serve-dist: http://localhost:${PORT} → ${ROOT}`);
