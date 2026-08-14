import type { BackupFile } from "../model/schema";
import type { NewsletterDoc } from "../model/types";
import { type DraftMeta, listDrafts, loadDraft, saveDraft } from "./documents";

/**
 * File export and import — docs/PLAN.md §16.5.
 *
 * Not a nice-to-have. Safari's Intelligent Tracking Prevention deletes all
 * script-writable storage after seven days without interaction, private windows
 * discard everything on close, and some school-managed browsers clear site data
 * on sign-out. This file is the only durable backup the user has, so it is a v1
 * requirement.
 */

export const BACKUP_MIME = "application/json";

export interface BackupEntry {
  id: string;
  name: string;
  doc: NewsletterDoc;
}

export function buildBackup(entries: BackupEntry[]): BackupFile {
  return {
    kind: "nyhedsbrev-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    drafts: entries,
  };
}

export async function collectBackup(): Promise<BackupFile> {
  const index = await listDrafts();
  const entries: BackupEntry[] = [];
  for (const meta of index) {
    const result = await loadDraft(meta.id);
    if (result.ok) entries.push({ id: meta.id, name: meta.name, doc: result.doc });
  }
  return buildBackup(entries);
}

export function backupFilename(now = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return `nyhedsbrev-kladder-${stamp}.json`;
}

export type ImportOutcome = { ok: true; imported: DraftMeta[] } | { ok: false; detail: string };

/**
 * Validated against the same schema the storage layer uses, so a truncated,
 * hand-edited or entirely unrelated JSON file is a message rather than a
 * corrupted workspace.
 */
export async function importBackup(text: string): Promise<ImportOutcome> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, detail: `Not valid JSON: ${String(error)}` };
  }

  // Imported here, not at module scope: validation belongs to this boundary and
  // must not sit in the initial workspace payload (§6.4).
  const { backupFileSchema } = await import("../model/schema");
  const parsed = backupFileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, detail: parsed.error.message };

  const imported: DraftMeta[] = [];
  for (const entry of parsed.data.drafts) {
    imported.push(await saveDraft(entry.id, entry.name, entry.doc));
  }
  return { ok: true, imported };
}
