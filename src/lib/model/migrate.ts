import { newsletterDocSchema, versionedSchema } from "./schema";
import type { NewsletterDoc } from "./types";
import { SCHEMA_VERSION } from "./types";

/**
 * Draft migration — docs/PLAN.md §10.1, §16.3.
 *
 * A draft saved by an older release must open in a newer one. The chain is a
 * map from source version to a step that produces the next version. Version 1
 * is the first shipped schema, so the chain is currently empty — but the
 * machinery is here, tested, and the place a v2 step goes is not a question.
 */

export type UnknownDoc = Record<string, unknown>;

type MigrationStep = (input: UnknownDoc) => UnknownDoc;

/** Keyed by the version the step migrates *from*. */
const steps: Record<number, MigrationStep> = {};

export type MigrateResult =
  | { ok: true; doc: NewsletterDoc; migratedFrom?: number }
  | { ok: false; reason: "unreadable" | "too-new" | "invalid"; detail: string };

export function migrateDoc(raw: unknown): MigrateResult {
  const versioned = versionedSchema.safeParse(raw);
  if (!versioned.success) {
    return { ok: false, reason: "unreadable", detail: "Value is not a versioned document." };
  }

  const from = versioned.data.schemaVersion;
  if (from > SCHEMA_VERSION) {
    return {
      ok: false,
      reason: "too-new",
      detail: `Draft schema v${from} is newer than this release (v${SCHEMA_VERSION}).`,
    };
  }

  let current = versioned.data as UnknownDoc;
  let version = from;
  while (version < SCHEMA_VERSION) {
    const step = steps[version];
    if (!step) {
      return {
        ok: false,
        reason: "invalid",
        detail: `No migration step from schema v${version}.`,
      };
    }
    current = step(current);
    version += 1;
  }

  const parsed = newsletterDocSchema.safeParse(current);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", detail: parsed.error.message };
  }

  return from === SCHEMA_VERSION
    ? { ok: true, doc: parsed.data }
    : { ok: true, doc: parsed.data, migratedFrom: from };
}
