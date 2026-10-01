/**
 * Zod schemas for JSON database columns — Phase 90.4
 *
 * Provides type-safe validation for all Json? columns in the Prisma schema.
 * Usage:
 *   import { GameFilesSchema, ExploreFilesSchema } from "@/lib/json-schemas";
 *   const parsed = GameFilesSchema.safeParse(game.files);
 *   if (!parsed.success) { / handle invalid data / }
 *   // parsed.data is typed as Record<string, string>
 */

import { z } from "zod";

// ============================================================
// Game + ExploreProject: files column
// Shape: { "index.html": "<base64>", "main.js": "<base64>", ... }
// ============================================================

export const FilesMapSchema = z.record(z.string()).nullable();

export type FilesMap = z.infer<typeof FilesMapSchema>;

// ============================================================
// Game + ExploreProject: files column (with storage metadata)
// New format (Phase 90): { path: { url, storedIn, size } }
// Old format: { path: base64string }
// ============================================================

export const StoredFileSchema = z.object({
  url: z.string(),
  storedIn: z.enum(["blob", "database"]),
  size: z.number().optional(),
});

export const FilesMapV2Schema = z.record(
  z.union([z.string(), StoredFileSchema])
).nullable();

export type FilesMapV2 = z.infer<typeof FilesMapV2Schema>;

// ============================================================
// CourseKnowledge: topics column
// Shape: [{ title, description, keyConcepts: [] }]
// ============================================================

export const CourseTopicSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  keyConcepts: z.array(z.string()).optional(),
});

export const CourseTopicsSchema = z.array(CourseTopicSchema).nullable();

export type CourseTopics = z.infer<typeof CourseTopicsSchema>;

// ============================================================
// ExamPaper: questions column (ai_template type)
// Shape: [{ question, options[], correctIndex, explanation, subject, topic }]
// ============================================================

export const ExamQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).nullable().optional(),
  correctIndex: z.number().nullable().optional(),
  correctAnswer: z.string().nullable().optional(),
  explanation: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  topic: z.string().nullable().optional(),
  marks: z.number().optional().default(1),
});

export const ExamQuestionsSchema = z.array(ExamQuestionSchema).nullable();

export type ExamQuestions = z.infer<typeof ExamQuestionsSchema>;

// ============================================================
// ChatMessage: attachments column
// Shape: [{ type: 'image'|'video'|'graph'|'conceptmap'|'source'|'quiz'|'draw_task', url, caption }]
// ============================================================

export const ChatAttachmentSchema = z.object({
  type: z.enum([
    "image", "video", "graph", "conceptmap", "source",
    "quiz", "draw_task", "computer_workspace",
  ]),
  url: z.string().nullable(),
  caption: z.string(),
});

export const ChatAttachmentsSchema = z.array(ChatAttachmentSchema).nullable();

export type ChatAttachments = z.infer<typeof ChatAttachmentsSchema>;

// ============================================================
// Badge: criteria column
// Shape: { xp?, streakDays?, type?, subject?, accuracy? }
// ============================================================

export const BadgeCriteriaSchema = z.object({
  xp: z.number().optional(),
  streakDays: z.number().optional(),
  type: z.string().optional(),
  subject: z.string().optional(),
  accuracy: z.number().optional(),
}).nullable();

export type BadgeCriteria = z.infer<typeof BadgeCriteriaSchema>;

// ============================================================
// Plan: features column
// Shape: { model?, tokenLimit?, maxProjects?, etc. }
// ============================================================

export const PlanFeaturesSchema = z.record(z.any()).nullable();

export type PlanFeatures = z.infer<typeof PlanFeaturesSchema>;

// ============================================================
// PathItem: completionCriteria column
// Shape: { minAccuracy?, minTimeSec?, minQuestions? }
// ============================================================

export const CompletionCriteriaSchema = z.object({
  minAccuracy: z.number().optional(),
  minTimeSec: z.number().optional(),
  minQuestions: z.number().optional(),
}).nullable();

export type CompletionCriteria = z.infer<typeof CompletionCriteriaSchema>;

// ============================================================
// AdminLog: details column
// Shape: arbitrary JSON (admin email + action details)
// ============================================================

export const AdminLogDetailsSchema = z.record(z.any()).nullable();

// ============================================================
// Helper: safely parse a JSON column value
// Returns parsed data if valid, null if invalid or null
// ============================================================

export function safeParseJson<T>(
  value: unknown,
  schema: z.ZodType<T>
): T | null {
  if (value === null || value === undefined) return null;
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

// ============================================================
// Helper: validate a JSON column value (throws on invalid)
// ============================================================

export function validateJson<T>(
  value: unknown,
  schema: z.ZodType<T>,
  columnName: string
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    console.error(`[json-schemas] Invalid JSON in column ${columnName}:`, result.error.issues);
    throw new Error(`Invalid data in ${columnName}: ${result.error.issues[0]?.message}`);
  }
  return result.data;
}
