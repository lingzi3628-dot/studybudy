/**
 * Ingestion Job Service — Phase 5
 *
 * Tracks document ingestion (chunking + embedding) as a job with status.
 * The upload route creates a job, returns immediately with the jobId,
 * and processes inline. If the function times out, the job stays
 * "processing" and can be retried.
 *
 * ALSO: duplicate detection via content hash. If a document with the
 * same hash was already ingested, the job links to the existing
 * CourseKnowledge row instead of re-ingesting.
 */

import { db } from "../db";
import { logger } from "../logger";
import { createHash } from "crypto";

// ============================================================
// Types
// ============================================================

export type IngestionJobResult = {
  id: string;
  status: string;
  progress: number;
  chunkCount: number;
  errorMessage: string | null;
  contentHash: string | null;
  courseKnowledgeId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

// ============================================================
// Create + track ingestion job
// ============================================================

/**
 * Create an ingestion job for a document upload.
 * Returns the job ID immediately — the client can poll for status.
 */
export async function createIngestionJob(opts: {
  userId: string;
  courseKnowledgeId?: string | null;
  content?: string; // raw text for hash computation
}): Promise<IngestionJobResult> {
  const contentHash = opts.content
    ? createHash("sha256").update(opts.content.slice(0, 10000)).digest("hex")
    : null;

  // Check for duplicate — if a job with the same hash already completed,
  // return it instead of creating a new one.
  if (contentHash) {
    const existing = await db.ingestionJob.findFirst({
      where: { contentHash, status: "completed" },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      logger.info("ingestion job: duplicate detected, returning existing", {
        userId: opts.userId,
        contentHash: contentHash.slice(0, 8),
        existingJobId: existing.id,
      });
      return toResult(existing);
    }
  }

  const job = await db.ingestionJob.create({
    data: {
      userId: opts.userId,
      courseKnowledgeId: opts.courseKnowledgeId ?? null,
      status: "pending",
      progress: 0,
      chunkCount: 0,
      contentHash,
    },
  });

  return toResult(job);
}

/**
 * Mark a job as processing (started).
 */
export async function startIngestionJob(jobId: string): Promise<void> {
  await db.ingestionJob.update({
    where: { id: jobId },
    data: { status: "processing", progress: 10, updatedAt: new Date() },
  }).catch(() => {});
}

/**
 * Update job progress.
 */
export async function updateIngestionProgress(jobId: string, progress: number): Promise<void> {
  await db.ingestionJob.update({
    where: { id: jobId },
    data: { progress: Math.min(100, Math.max(0, progress)), updatedAt: new Date() },
  }).catch(() => {});
}

/**
 * Mark a job as completed.
 */
export async function completeIngestionJob(jobId: string, chunkCount: number): Promise<void> {
  await db.ingestionJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      progress: 100,
      chunkCount,
      completedAt: new Date(),
      updatedAt: new Date(),
    },
  }).catch(() => {});
  logger.info("ingestion job completed", { jobId, chunkCount });
}

/**
 * Mark a job as failed.
 */
export async function failIngestionJob(jobId: string, errorMessage: string): Promise<void> {
  await db.ingestionJob.update({
    where: { id: jobId },
    data: {
      status: "failed",
      errorMessage: errorMessage.slice(0, 500),
      updatedAt: new Date(),
    },
  }).catch(() => {});
  logger.warn("ingestion job failed", { jobId, error: errorMessage });
}

/**
 * Get a job by ID (ownership-checked).
 */
export async function getIngestionJob(userId: string, jobId: string): Promise<IngestionJobResult | null> {
  const job = await db.ingestionJob.findFirst({
    where: { id: jobId, userId },
  });
  return job ? toResult(job) : null;
}

/**
 * List a user's recent ingestion jobs.
 */
export async function listIngestionJobs(userId: string, limit = 20): Promise<IngestionJobResult[]> {
  const jobs = await db.ingestionJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return jobs.map(toResult);
}

// ============================================================
// Helper
// ============================================================

function toResult(job: any): IngestionJobResult {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    chunkCount: job.chunkCount,
    errorMessage: job.errorMessage,
    contentHash: job.contentHash,
    courseKnowledgeId: job.courseKnowledgeId,
    createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : String(job.createdAt),
    updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : String(job.updatedAt),
    completedAt: job.completedAt instanceof Date ? job.completedAt.toISOString() : (job.completedAt ? String(job.completedAt) : null),
  };
}
