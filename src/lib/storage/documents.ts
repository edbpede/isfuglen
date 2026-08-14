import { clear, del, get, set } from "idb-keyval";
import type { NewsletterDoc } from "../model/types";

/**
 * Documents — docs/PLAN.md §16.2, §16.3.
 *
 * IndexedDB, not localStorage, and for exactly one reason: autosave fires on a
 * 600 ms debounce while the user types, and a synchronous `JSON.stringify` plus
 * `localStorage.setItem` of a 60 KB document on every pause is a visible
 * stutter. Twenty drafts would also crowd the 5 MB origin cap.
 *
 * Every read goes through the migration chain, so a draft written by an older
 * release either opens or produces a recoverable error. It never crashes the
 * workspace and never silently loses content.
 */

const CURRENT_KEY = "nl.current";
const INDEX_KEY = "nl.draftIndex";
const draftKey = (id: string) => `nl.draft.${id}`;

export interface DraftMeta {
  id: string;
  name: string;
  updatedAt: string;
}

export type LoadOutcome =
  | { ok: true; doc: NewsletterDoc; migratedFrom?: number }
  | { ok: false; reason: "missing" | "unreadable" | "too-new" | "invalid"; detail: string };

/** True when IndexedDB is usable at all — private windows and some school
 *  managed profiles disable it, and the workspace must say so rather than
 *  pretend it saved (§16.5). */
export async function isStorageAvailable(): Promise<boolean> {
  try {
    await get("nl.probe");
    return true;
  } catch {
    return false;
  }
}

/**
 * Zod and the migration chain are imported here rather than at module scope.
 * They belong to the storage boundary and nowhere else, and loading them
 * eagerly would put ~40 KB gz of validation code into the initial workspace
 * payload for work that only happens when a draft is read or written (§6.4).
 */
async function validation() {
  return import("../model/migrate");
}

async function read(key: string): Promise<LoadOutcome> {
  let raw: unknown;
  try {
    raw = await get(key);
  } catch (error) {
    return { ok: false, reason: "unreadable", detail: String(error) };
  }
  if (raw === undefined) return { ok: false, reason: "missing", detail: `No value at ${key}` };
  const { migrateDoc } = await validation();
  const result = migrateDoc(raw);
  if (!result.ok) return result;
  return result.migratedFrom !== undefined
    ? { ok: true, doc: result.doc, migratedFrom: result.migratedFrom }
    : { ok: true, doc: result.doc };
}

export async function loadCurrent(): Promise<LoadOutcome> {
  return read(CURRENT_KEY);
}

export async function saveCurrent(doc: NewsletterDoc): Promise<void> {
  await set(CURRENT_KEY, structuredClone(doc));
}

export async function clearCurrent(): Promise<void> {
  await del(CURRENT_KEY);
}

export async function listDrafts(): Promise<DraftMeta[]> {
  try {
    const raw = await get(INDEX_KEY);
    const { draftIndexSchema } = await import("../model/schema");
    const parsed = draftIndexSchema.safeParse(raw ?? []);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

async function writeIndex(entries: DraftMeta[]): Promise<void> {
  await set(INDEX_KEY, entries);
}

export async function saveDraft(id: string, name: string, doc: NewsletterDoc): Promise<DraftMeta> {
  const meta: DraftMeta = { id, name, updatedAt: new Date().toISOString() };
  await set(draftKey(id), structuredClone(doc));
  const index = await listDrafts();
  const without = index.filter((entry) => entry.id !== id);
  await writeIndex([meta, ...without]);
  return meta;
}

export async function renameDraft(id: string, name: string): Promise<void> {
  const index = await listDrafts();
  await writeIndex(index.map((entry) => (entry.id === id ? { ...entry, name } : entry)));
}

export async function loadDraft(id: string): Promise<LoadOutcome> {
  return read(draftKey(id));
}

export async function deleteDraft(id: string): Promise<void> {
  await del(draftKey(id));
  const index = await listDrafts();
  await writeIndex(index.filter((entry) => entry.id !== id));
}

/** "Slet alle gemte data": one click, one confirmation, no residue. */
export async function deleteEverything(): Promise<void> {
  await clear();
}

/**
 * Best effort only. The browser grants or refuses at its own discretion, and
 * Safari's seven-day eviction is not something an origin can opt out of, so
 * nothing in the product may depend on this succeeding (§16.5).
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
