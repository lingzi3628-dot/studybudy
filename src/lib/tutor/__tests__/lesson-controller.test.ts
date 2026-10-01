/**
 * lesson-controller tests — Phase 95
 *
 * Tests the pure parts of src/lib/tutor/lesson-controller.ts:
 *   - isLessonControllerEnabled (feature flag)
 *   - formatLessonStateBlock (prompt formatter)
 *   - Stage guidance for each of the 4 stages
 *
 * The DB-touching functions (getLessonState, startLesson, advanceLessonState)
 * are integration territory — exercised via mocked @/lib/db.
 *
 * Run: npx vitest run src/lib/tutor/__tests__/lesson-controller.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @/lib/db
vi.mock("@/lib/db", () => ({
  db: {
    tutorLessonState: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import {
  isLessonControllerEnabled,
  formatLessonStateBlock,
  getLessonState,
  startLesson,
  advanceLessonState,
  endLesson,
  type LessonState,
} from "../lesson-controller";
import { db } from "@/lib/db";

// ============================================================
// Helpers
// ============================================================

function makeState(overrides: Partial<LessonState> = {}): LessonState {
  return {
    id: "ls-1",
    conversationId: "conv-1",
    userId: "user-1",
    currentTopic: "Fractions",
    currentStage: "explain",
    stageUpdatedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe("isLessonControllerEnabled", () => {
  const original = process.env.TUTOR_LESSON_CONTROLLER_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.TUTOR_LESSON_CONTROLLER_ENABLED;
    else process.env.TUTOR_LESSON_CONTROLLER_ENABLED = original;
  });

  it("returns true when env var is unset (default enabled)", () => {
    delete process.env.TUTOR_LESSON_CONTROLLER_ENABLED;
    expect(isLessonControllerEnabled()).toBe(true);
  });

  it("returns false when env var is 'false'", () => {
    process.env.TUTOR_LESSON_CONTROLLER_ENABLED = "false";
    expect(isLessonControllerEnabled()).toBe(false);
  });

  it("returns false when env var is '0' or 'off'", () => {
    process.env.TUTOR_LESSON_CONTROLLER_ENABLED = "0";
    expect(isLessonControllerEnabled()).toBe(false);
    process.env.TUTOR_LESSON_CONTROLLER_ENABLED = "off";
    expect(isLessonControllerEnabled()).toBe(false);
  });
});

describe("formatLessonStateBlock", () => {
  it("returns empty string for null state", () => {
    expect(formatLessonStateBlock(null)).toBe("");
  });

  it("formats the 'introduce' stage with correct guidance", () => {
    const state = makeState({ currentStage: "introduce", currentTopic: "Photosynthesis" });
    const block = formatLessonStateBlock(state);
    expect(block).toContain("=== LESSON STATE ===");
    expect(block).toContain("Photosynthesis");
    expect(block).toContain("stage: INTRODUCE");
    expect(block).toContain("STAGE GUIDANCE — INTRODUCE");
    expect(block).toContain("HOOK");
    expect(block).toContain("why it matters");
  });

  it("formats the 'explain' stage with correct guidance", () => {
    const state = makeState({ currentStage: "explain" });
    const block = formatLessonStateBlock(state);
    expect(block).toContain("stage: EXPLAIN");
    expect(block).toContain("2-3 short paragraphs");
    expect(block).toContain("mathgraph");
  });

  it("formats the 'check' stage with correct guidance", () => {
    const state = makeState({ currentStage: "check" });
    const block = formatLessonStateBlock(state);
    expect(block).toContain("stage: CHECK");
    expect(block).toContain("Quiz the learner");
    expect(block).toContain("```quiz block");
  });

  it("formats the 'advance' stage with correct guidance", () => {
    const state = makeState({ currentStage: "advance" });
    const block = formatLessonStateBlock(state);
    expect(block).toContain("stage: ADVANCE");
    expect(block).toContain("Celebrate briefly");
    expect(block).toContain("next related topic");
  });

  it("includes the 'do NOT switch topic' instruction", () => {
    const state = makeState();
    const block = formatLessonStateBlock(state);
    expect(block).toContain("Do NOT switch to a new topic");
  });

  it("includes the 'advance to next stage' instruction", () => {
    const state = makeState();
    const block = formatLessonStateBlock(state);
    expect(block).toContain("advance to the next stage");
  });

  it("always wraps with === LESSON STATE === / === END LESSON STATE ===", () => {
    const state = makeState();
    const block = formatLessonStateBlock(state);
    expect(block.startsWith("\n\n=== LESSON STATE ===")).toBe(true);
    expect(block.endsWith("=== END LESSON STATE ===\n")).toBe(true);
  });
});

describe("getLessonState — DB integration (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.tutorLessonState.findUnique).mockResolvedValue(null);
    process.env.TUTOR_LESSON_CONTROLLER_ENABLED = "true";
  });

  it("returns null when conversationId is null", async () => {
    const result = await getLessonState(null, "user-1");
    expect(result).toBeNull();
  });

  it("returns null when userId is empty", async () => {
    const result = await getLessonState("conv-1", "");
    expect(result).toBeNull();
  });

  it("returns null when feature flag is off", async () => {
    process.env.TUTOR_LESSON_CONTROLLER_ENABLED = "false";
    const result = await getLessonState("conv-1", "user-1");
    expect(result).toBeNull();
  });

  it("returns null when no lesson state row exists", async () => {
    vi.mocked(db.tutorLessonState.findUnique).mockResolvedValue(null);
    const result = await getLessonState("conv-1", "user-1");
    expect(result).toBeNull();
  });

  it("returns a populated LessonState when row exists", async () => {
    vi.mocked(db.tutorLessonState.findUnique).mockResolvedValue({
      id: "ls-1",
      conversationId: "conv-1",
      userId: "user-1",
      currentTopic: "Fractions",
      currentStage: "explain",
      stageUpdatedAt: new Date(),
      createdAt: new Date(),
    } as any);
    const result = await getLessonState("conv-1", "user-1");
    expect(result).not.toBeNull();
    expect(result!.currentTopic).toBe("Fractions");
    expect(result!.currentStage).toBe("explain");
  });

  it("returns null when DB throws (fail-safe)", async () => {
    vi.mocked(db.tutorLessonState.findUnique).mockRejectedValue(new Error("DB down") as any);
    const result = await getLessonState("conv-1", "user-1");
    expect(result).toBeNull();
  });
});

describe("startLesson — DB integration (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TUTOR_LESSON_CONTROLLER_ENABLED = "true";
  });

  it("returns null when topic is empty", async () => {
    const result = await startLesson("conv-1", "user-1", "");
    expect(result).toBeNull();
  });

  it("returns null when feature flag is off", async () => {
    process.env.TUTOR_LESSON_CONTROLLER_ENABLED = "false";
    const result = await startLesson("conv-1", "user-1", "Fractions");
    expect(result).toBeNull();
  });

  it("calls upsert with the correct data", async () => {
    vi.mocked(db.tutorLessonState.upsert).mockResolvedValue({
      id: "ls-1",
      conversationId: "conv-1",
      userId: "user-1",
      currentTopic: "Fractions",
      currentStage: "introduce",
      stageUpdatedAt: new Date(),
      createdAt: new Date(),
    } as any);
    const result = await startLesson("conv-1", "user-1", "Fractions");
    expect(result).not.toBeNull();
    expect(result!.currentTopic).toBe("Fractions");
    expect(result!.currentStage).toBe("introduce");
    expect(db.tutorLessonState.upsert).toHaveBeenCalledWith({
      where: { conversationId: "conv-1" },
      create: expect.objectContaining({
        conversationId: "conv-1",
        userId: "user-1",
        currentTopic: "Fractions",
        currentStage: "introduce",
      }),
      update: expect.objectContaining({
        currentTopic: "Fractions",
        currentStage: "introduce",
      }),
    });
  });
});

describe("advanceLessonState — DB integration (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TUTOR_LESSON_CONTROLLER_ENABLED = "true";
  });

  it("returns null when no lesson exists for the conversation", async () => {
    vi.mocked(db.tutorLessonState.findUnique).mockResolvedValue(null);
    const result = await advanceLessonState("conv-1", "user-1");
    expect(result).toBeNull();
  });

  it("advances introduce → explain", async () => {
    vi.mocked(db.tutorLessonState.findUnique).mockResolvedValue({
      id: "ls-1", conversationId: "conv-1", userId: "user-1",
      currentTopic: "Fractions", currentStage: "introduce",
      stageUpdatedAt: new Date(), createdAt: new Date(),
    } as any);
    vi.mocked(db.tutorLessonState.update).mockResolvedValue({
      id: "ls-1", conversationId: "conv-1", userId: "user-1",
      currentTopic: "Fractions", currentStage: "explain",
      stageUpdatedAt: new Date(), createdAt: new Date(),
    } as any);
    const result = await advanceLessonState("conv-1", "user-1");
    expect(result).not.toBeNull();
    expect(result!.currentStage).toBe("explain");
  });

  it("advances explain → check", async () => {
    vi.mocked(db.tutorLessonState.findUnique).mockResolvedValue({
      id: "ls-1", conversationId: "conv-1", userId: "user-1",
      currentTopic: "Fractions", currentStage: "explain",
      stageUpdatedAt: new Date(), createdAt: new Date(),
    } as any);
    vi.mocked(db.tutorLessonState.update).mockResolvedValue({
      id: "ls-1", conversationId: "conv-1", userId: "user-1",
      currentTopic: "Fractions", currentStage: "check",
      stageUpdatedAt: new Date(), createdAt: new Date(),
    } as any);
    const result = await advanceLessonState("conv-1", "user-1");
    expect(result!.currentStage).toBe("check");
  });

  it("advances check → advance", async () => {
    vi.mocked(db.tutorLessonState.findUnique).mockResolvedValue({
      id: "ls-1", conversationId: "conv-1", userId: "user-1",
      currentTopic: "Fractions", currentStage: "check",
      stageUpdatedAt: new Date(), createdAt: new Date(),
    } as any);
    vi.mocked(db.tutorLessonState.update).mockResolvedValue({
      id: "ls-1", conversationId: "conv-1", userId: "user-1",
      currentTopic: "Fractions", currentStage: "advance",
      stageUpdatedAt: new Date(), createdAt: new Date(),
    } as any);
    const result = await advanceLessonState("conv-1", "user-1");
    expect(result!.currentStage).toBe("advance");
  });

  it("completes the lesson (deletes row) when advancing from 'advance'", async () => {
    vi.mocked(db.tutorLessonState.findUnique).mockResolvedValue({
      id: "ls-1", conversationId: "conv-1", userId: "user-1",
      currentTopic: "Fractions", currentStage: "advance",
      stageUpdatedAt: new Date(), createdAt: new Date(),
    } as any);
    vi.mocked(db.tutorLessonState.delete).mockResolvedValue({} as any);
    const result = await advanceLessonState("conv-1", "user-1");
    expect(result).toBeNull();  // lesson complete — state deleted
    expect(db.tutorLessonState.delete).toHaveBeenCalledWith({
      where: { conversationId: "conv-1" },
    });
  });
});

describe("endLesson — DB integration (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TUTOR_LESSON_CONTROLLER_ENABLED = "true";
  });

  it("calls delete with the correct where clause", async () => {
    vi.mocked(db.tutorLessonState.delete).mockResolvedValue({} as any);
    await endLesson("conv-1");
    expect(db.tutorLessonState.delete).toHaveBeenCalledWith({
      where: { conversationId: "conv-1" },
    });
  });

  it("is idempotent (silent on missing row)", async () => {
    vi.mocked(db.tutorLessonState.delete).mockRejectedValue(new Error("Row not found") as any);
    // Should not throw
    await endLesson("conv-1");
  });
});
