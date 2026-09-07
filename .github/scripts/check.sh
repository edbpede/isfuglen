#!/usr/bin/env bash
set -euo pipefail
bunx --bun biome ci .
bun run check
bun run build:assets
bun test
bun run build
bun run scripts/check-bundle.ts
