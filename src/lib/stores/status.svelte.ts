/**
 * Save status and screen-reader announcements — docs/PLAN.md §17.6.
 *
 * One polite region for status, one assertive region for errors, and nothing
 * else. Announcements are re-set through a nulled value first so that repeating
 * the same message still reaches assistive technology, which ignores a live
 * region whose text has not changed.
 */

export type SaveState = "idle" | "saving" | "saved" | "failed" | "unavailable";

export class StatusStore {
  saveState = $state<SaveState>("idle");
  savedAt = $state<string | null>(null);
  polite = $state("");
  assertive = $state("");

  markSaving(): void {
    this.saveState = "saving";
  }

  markSaved(at: string = new Date().toISOString()): void {
    this.saveState = "saved";
    this.savedAt = at;
  }

  markFailed(): void {
    this.saveState = "failed";
  }

  markUnavailable(): void {
    this.saveState = "unavailable";
  }

  announce(message: string): void {
    this.polite = "";
    queueMicrotask(() => {
      this.polite = message;
    });
  }

  error(message: string): void {
    this.assertive = "";
    queueMicrotask(() => {
      this.assertive = message;
    });
  }
}
