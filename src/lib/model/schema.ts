import { z } from "zod";
import { SCHEMA_VERSION } from "./types";

/**
 * The storage boundary — docs/PLAN.md §16.3.
 *
 * Drafts are versioned data read back from IndexedDB across releases, so a
 * corrupt or stale value must become a recoverable error rather than a crash in
 * the workspace. This schema is the only place Zod is used; nothing on the hot
 * path validates.
 */

const inlineMarkSchema = z.enum(["bold", "italic"]);

const inlineSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    text: z.string(),
    marks: z.array(inlineMarkSchema).optional(),
  }),
  z.object({
    kind: z.literal("link"),
    href: z.string(),
    text: z.string(),
    marks: z.array(inlineMarkSchema).optional(),
  }),
  z.object({ kind: z.literal("break") }),
]);

const richTextSchema = z.array(inlineSchema);

const confidenceSchema = z.enum(["high", "medium", "low"]);

const blockBase = {
  id: z.string(),
  confidence: confidenceSchema.optional(),
  sourceRuleId: z.string().optional(),
};

const headingLevelSchema = z.union([z.literal(2), z.literal(3)]);

const blockSchema = z.discriminatedUnion("type", [
  z.object({
    ...blockBase,
    type: z.literal("heading"),
    level: headingLevelSchema,
    text: z.string(),
  }),
  z.object({ ...blockBase, type: z.literal("paragraph"), content: richTextSchema }),
  z.object({
    ...blockBase,
    type: z.literal("list"),
    ordered: z.boolean(),
    items: z.array(richTextSchema),
  }),
  z.object({
    ...blockBase,
    type: z.literal("agenda"),
    title: z.string().optional(),
    items: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        presenter: z.string().optional(),
        minutes: z.number().optional(),
      }),
    ),
  }),
  z.object({
    ...blockBase,
    type: z.literal("decisions"),
    title: z.string().optional(),
    items: z.array(richTextSchema),
  }),
  z.object({
    ...blockBase,
    type: z.literal("actions"),
    title: z.string().optional(),
    items: z.array(
      z.object({
        id: z.string(),
        task: richTextSchema,
        owner: z.string().optional(),
        due: z.string().optional(),
      }),
    ),
  }),
  z.object({
    ...blockBase,
    type: z.literal("notice"),
    tone: z.enum(["info", "important"]),
    title: z.string().optional(),
    content: richTextSchema,
  }),
  z.object({
    ...blockBase,
    type: z.literal("quote"),
    content: richTextSchema,
    attribution: z.string().optional(),
  }),
  z.object({
    ...blockBase,
    type: z.literal("contact"),
    title: z.string().optional(),
    entries: z.array(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        role: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        url: z.string().optional(),
      }),
    ),
  }),
  z.object({
    ...blockBase,
    type: z.literal("closing"),
    content: richTextSchema,
    signature: z.array(z.string()).optional(),
  }),
]);

const sectionSchema = z.object({
  id: z.string(),
  heading: z.object({ text: z.string(), level: headingLevelSchema }).optional(),
  blocks: z.array(blockSchema),
  confidence: confidenceSchema.optional(),
});

export const newsletterDocSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  docLang: z.enum(["da", "en"]),
  docLangExplicit: z.boolean(),
  meta: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    date: z.string().optional(),
    timeStart: z.string().optional(),
    timeEnd: z.string().optional(),
    location: z.string().optional(),
    organisation: z.string().optional(),
    footerNote: z.string().optional(),
  }),
  intro: richTextSchema.optional(),
  sections: z.array(sectionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** The shape every persisted value has before migration: a version and a body. */
export const versionedSchema = z.object({ schemaVersion: z.number() }).loose();

export const draftIndexSchema = z.array(
  z.object({ id: z.string(), name: z.string(), updatedAt: z.string() }),
);

export const backupFileSchema = z.object({
  kind: z.literal("nyhedsbrev-backup"),
  version: z.literal(1),
  exportedAt: z.string(),
  drafts: z.array(z.object({ id: z.string(), name: z.string(), doc: newsletterDocSchema })),
});

export type BackupFile = z.infer<typeof backupFileSchema>;
