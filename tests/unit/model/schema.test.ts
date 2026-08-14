import { describe, expect, test } from "bun:test";
import {
  createBlankDoc,
  createDoc,
  inlineToPlain,
  isRichTextEmpty,
  rich,
} from "../../../src/lib/model/factory";
import { migrateDoc } from "../../../src/lib/model/migrate";
import { backupFileSchema, newsletterDocSchema } from "../../../src/lib/model/schema";
import { SCHEMA_VERSION } from "../../../src/lib/model/types";
import { everyBlockDoc } from "../helpers/document";

/** docs/PLAN.md §10, §16.3 — the storage boundary. */

describe("schema", () => {
  test("accepts a document containing every block type", () => {
    expect(newsletterDocSchema.safeParse(everyBlockDoc("da")).success).toBe(true);
    expect(newsletterDocSchema.safeParse(everyBlockDoc("en")).success).toBe(true);
  });

  test("survives a JSON round trip unchanged", () => {
    const doc = everyBlockDoc("da");
    const parsed = newsletterDocSchema.parse(JSON.parse(JSON.stringify(doc)));
    expect(parsed).toEqual(doc);
  });

  test("rejects a malformed draft rather than letting it into the workspace", () => {
    const doc = JSON.parse(JSON.stringify(everyBlockDoc("da")));
    doc.sections[0].blocks[0].type = "marquee";
    expect(newsletterDocSchema.safeParse(doc).success).toBe(false);
  });

  test("rejects a document with no version", () => {
    expect(newsletterDocSchema.safeParse({ id: "x" }).success).toBe(false);
  });
});

describe("migration", () => {
  test("a current-version draft passes straight through", () => {
    const doc = everyBlockDoc("da");
    const result = migrateDoc(JSON.parse(JSON.stringify(doc)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc).toEqual(doc);
      expect(result.migratedFrom).toBeUndefined();
    }
  });

  test("a draft from a newer release is a recoverable error, not a crash", () => {
    const doc = { ...everyBlockDoc("da"), schemaVersion: SCHEMA_VERSION + 1 };
    const result = migrateDoc(JSON.parse(JSON.stringify(doc)));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too-new");
  });

  test("a value that is not a versioned document is reported as unreadable", () => {
    expect(migrateDoc(null)).toMatchObject({ ok: false, reason: "unreadable" });
    expect(migrateDoc("nonsense")).toMatchObject({ ok: false, reason: "unreadable" });
    expect(migrateDoc({ hello: "world" })).toMatchObject({ ok: false, reason: "unreadable" });
  });

  test("a corrupt draft at the current version is reported as invalid", () => {
    const doc = JSON.parse(JSON.stringify(everyBlockDoc("da")));
    doc.sections = "not an array";
    expect(migrateDoc(doc)).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("backup file", () => {
  test("validates the shape the drafts panel writes", () => {
    const file = {
      kind: "nyhedsbrev-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      drafts: [{ id: "a", name: "Klubmøde", doc: everyBlockDoc("da") }],
    };
    expect(backupFileSchema.safeParse(file).success).toBe(true);
  });

  test("rejects an unrelated JSON file", () => {
    expect(backupFileSchema.safeParse({ kind: "something-else" }).success).toBe(false);
  });
});

describe("factory", () => {
  test("a new document is valid and empty", () => {
    const doc = createDoc();
    expect(newsletterDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.sections).toEqual([]);
    expect(doc.docLang).toBe("da");
    expect(doc.docLangExplicit).toBe(false);
  });

  test("a blank document has exactly one empty section", () => {
    const doc = createBlankDoc();
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]?.blocks).toHaveLength(1);
  });

  test("ids are unique", () => {
    const doc = everyBlockDoc("da");
    const ids = JSON.stringify(doc).match(/"id":"[^"]+"/g) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("rich text helpers agree about emptiness", () => {
    expect(isRichTextEmpty(rich(""))).toBe(true);
    expect(isRichTextEmpty(rich("   "))).toBe(true);
    expect(isRichTextEmpty(rich("x"))).toBe(false);
    expect(
      inlineToPlain([{ kind: "text", text: "a" }, { kind: "break" }, { kind: "text", text: "b" }]),
    ).toBe("a\nb");
  });
});
