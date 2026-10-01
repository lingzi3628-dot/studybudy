/**
 * rag (tutor) tests — Phase 93
 *
 * Tests the pure parts of src/lib/tutor/rag.ts:
 *   - isRagEnabled (feature flag)
 *   - formatRetrievedKnowledgeBlock (prompt formatter)
 *
 * The TF.js + DB-touching functions (embedTexts, ingestCourseKnowledge,
 * retrieveTopK) are integration territory — they're exercised via the
 * context-builder integration tests with mocked deps.
 *
 * Run: npx vitest run src/lib/tutor/__tests__/rag.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @/lib/db so the module imports cleanly
vi.mock("@/lib/db", () => ({
  db: {
    courseKnowledge: {
      findUnique: vi.fn(),
    },
    courseKnowledgeChunk: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock @/lib/rag-engine (pure chunking + cosine) — re-export the real ones
// since they're already tested in rag-engine.test.ts
vi.mock("@/lib/rag-engine", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rag-engine")>("@/lib/rag-engine");
  return {
    chunkText: actual.chunkText,
    cosineSimilarity: actual.cosineSimilarity,
  };
});

import {
  isRagEnabled,
  formatRetrievedKnowledgeBlock,
  type RetrievedChunk,
} from "../rag";

// ============================================================
// Helpers
// ============================================================

function makeChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    chunkId: "chunk-1",
    courseKnowledgeId: "ck-1",
    chunkIndex: 0,
    chunkText: "Sample chunk text about photosynthesis.",
    score: 0.78,
    sourceTitle: "Biology Notes",
    sourceType: "notes",
    subject: "Biology",
    course: null,
    track: "k12",
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe("isRagEnabled", () => {
  const original = process.env.TUTOR_RAG_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.TUTOR_RAG_ENABLED;
    else process.env.TUTOR_RAG_ENABLED = original;
  });

  it("returns true when env var is unset (default enabled)", () => {
    delete process.env.TUTOR_RAG_ENABLED;
    expect(isRagEnabled()).toBe(true);
  });

  it("returns true when env var is 'true'", () => {
    process.env.TUTOR_RAG_ENABLED = "true";
    expect(isRagEnabled()).toBe(true);
  });

  it("returns false when env var is 'false'", () => {
    process.env.TUTOR_RAG_ENABLED = "false";
    expect(isRagEnabled()).toBe(false);
  });

  it("returns false when env var is '0' or 'off'", () => {
    process.env.TUTOR_RAG_ENABLED = "0";
    expect(isRagEnabled()).toBe(false);
    process.env.TUTOR_RAG_ENABLED = "off";
    expect(isRagEnabled()).toBe(false);
  });
});

describe("formatRetrievedKnowledgeBlock", () => {
  it("returns empty string for an empty chunks array", () => {
    expect(formatRetrievedKnowledgeBlock([])).toBe("");
  });

  it("formats a single chunk with all metadata", () => {
    const chunk = makeChunk({
      score: 0.78,
      sourceTitle: "LLB Course Outline",
      sourceType: "outline",
      subject: "Law",
      course: "Bachelor of Laws (LLB)",
      track: "university",
      chunkText: "Consideration in contract law refers to something of value exchanged between parties.",
    });
    const block = formatRetrievedKnowledgeBlock([chunk]);
    expect(block).toContain("=== RETRIEVED KNOWLEDGE");
    expect(block).toContain("top 1 chunks");
    expect(block).toContain("[1]");
    expect(block).toContain("(similarity 78%)");
    expect(block).toContain('"LLB Course Outline"');
    expect(block).toContain("Source: outline");
    expect(block).toContain("Subject: Law");
    expect(block).toContain("Course: Bachelor of Laws (LLB)");
    expect(block).toContain("Consideration in contract law refers to");
    expect(block).toContain("=== END RETRIEVED KNOWLEDGE ===");
  });

  it("formats multiple chunks with sequential indices", () => {
    const chunks = [
      makeChunk({ chunkId: "c1", sourceTitle: "Source A", chunkText: "Text A", score: 0.85 }),
      makeChunk({ chunkId: "c2", sourceTitle: "Source B", chunkText: "Text B", score: 0.72 }),
      makeChunk({ chunkId: "c3", sourceTitle: "Source C", chunkText: "Text C", score: 0.65 }),
    ];
    const block = formatRetrievedKnowledgeBlock(chunks);
    expect(block).toContain("top 3 chunks");
    expect(block).toContain("[1]");
    expect(block).toContain("[2]");
    expect(block).toContain("[3]");
    expect(block).toContain("Source A");
    expect(block).toContain("Source B");
    expect(block).toContain("Source C");
  });

  it("omits the Course line when course is null (K-12 / secondary)", () => {
    const chunk = makeChunk({ course: null });
    const block = formatRetrievedKnowledgeBlock([chunk]);
    expect(block).not.toContain("Course:");
  });

  it("includes the Course line when course is set (higher-ed)", () => {
    const chunk = makeChunk({ course: "Medicine" });
    const block = formatRetrievedKnowledgeBlock([chunk]);
    expect(block).toContain("Course: Medicine");
  });

  it("rounds similarity score to whole percent", () => {
    const chunk = makeChunk({ score: 0.7234 });
    const block = formatRetrievedKnowledgeBlock([chunk]);
    expect(block).toContain("(similarity 72%)");
  });

  it("handles score of 1.0 (perfect match)", () => {
    const chunk = makeChunk({ score: 1.0 });
    const block = formatRetrievedKnowledgeBlock([chunk]);
    expect(block).toContain("(similarity 100%)");
  });

  it("includes the citation instruction", () => {
    const block = formatRetrievedKnowledgeBlock([makeChunk()]);
    expect(block).toContain("Cite each chunk by its source title");
    expect(block).toContain("PRIMARY CONTEXT");
  });

  it("includes the 'chunks don't fully answer' fallback instruction", () => {
    const block = formatRetrievedKnowledgeBlock([makeChunk()]);
    expect(block).toContain("If the chunks don't fully answer the question");
  });

  it("always wraps with === RETRIEVED KNOWLEDGE === / === END RETRIEVED KNOWLEDGE ===", () => {
    const block = formatRetrievedKnowledgeBlock([makeChunk()]);
    expect(block.startsWith("\n\n=== RETRIEVED KNOWLEDGE")).toBe(true);
    expect(block.endsWith("=== END RETRIEVED KNOWLEDGE ===\n")).toBe(true);
  });

  it("preserves chunk text verbatim (no escaping)", () => {
    const chunkText = "This chunk has special chars: $y = mx + b$ and **bold** markdown.";
    const chunk = makeChunk({ chunkText });
    const block = formatRetrievedKnowledgeBlock([chunk]);
    expect(block).toContain(chunkText);
  });
});
