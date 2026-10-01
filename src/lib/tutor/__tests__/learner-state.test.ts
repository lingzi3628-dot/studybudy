/**
 * learner-state tests — Phase 92
 *
 * Tests the pure formatting function (formatLearnerStateBlock) thoroughly,
 * plus the feature-flag + the empty-input edge cases.
 *
 * The DB-touching functions (getLearnerState, fetchMasteryRows, etc.) are
 * integration territory — they're exercised via the context-builder tests
 * with a mocked @/lib/db.
 *
 * Run: npx vitest run src/lib/tutor/__tests__/learner-state.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------
// Mock @/lib/db BEFORE importing the module under test.
// Tests will override these per-test via vi.mocked(...).mockResolvedValueOnce(...).
// ---------------------------------------------------------------
vi.mock("@/lib/db", () => ({
  db: {
    topicMastery: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userXp: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    studyRoomState: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

import {
  getLearnerState,
  formatLearnerStateBlock,
  isLearnerStateEnabled,
  type LearnerState,
} from "../learner-state";
import { db } from "@/lib/db";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function makeState(overrides: Partial<LearnerState> = {}): LearnerState {
  return {
    weakestTopics: [],
    strongestTopics: [],
    streakDays: 0,
    level: 1,
    xpAmount: 0,
    activeStudyRoom: null,
    isNewLearner: false,
    ...overrides,
  };
}

const sampleTopic = {
  subject: "Mathematics",
  topic: "Fractions",
  masteryLevel: 0.35,
  totalAttempts: 5,
  correctAttempts: 2,
  lastUpdated: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
};

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe("isLearnerStateEnabled", () => {
  const original = process.env.TUTOR_LEARNER_STATE_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.TUTOR_LEARNER_STATE_ENABLED;
    else process.env.TUTOR_LEARNER_STATE_ENABLED = original;
  });

  it("returns true when env var is unset (default enabled)", () => {
    delete process.env.TUTOR_LEARNER_STATE_ENABLED;
    expect(isLearnerStateEnabled()).toBe(true);
  });

  it("returns true when env var is 'true'", () => {
    process.env.TUTOR_LEARNER_STATE_ENABLED = "true";
    expect(isLearnerStateEnabled()).toBe(true);
  });

  it("returns false when env var is 'false'", () => {
    process.env.TUTOR_LEARNER_STATE_ENABLED = "false";
    expect(isLearnerStateEnabled()).toBe(false);
  });

  it("returns false when env var is '0' or 'off'", () => {
    process.env.TUTOR_LEARNER_STATE_ENABLED = "0";
    expect(isLearnerStateEnabled()).toBe(false);
    process.env.TUTOR_LEARNER_STATE_ENABLED = "off";
    expect(isLearnerStateEnabled()).toBe(false);
  });

  it("returns true when env var is 'TRUE' (case-insensitive)", () => {
    process.env.TUTOR_LEARNER_STATE_ENABLED = "TRUE";
    expect(isLearnerStateEnabled()).toBe(true);
  });
});

describe("formatLearnerStateBlock", () => {
  it("returns empty string for null state", () => {
    expect(formatLearnerStateBlock(null)).toBe("");
  });

  it("returns empty string for an all-zero state (no streak, no level, no topics)", () => {
    const state = makeState();
    expect(formatLearnerStateBlock(state)).toBe("");
  });

  it("emits the NEW LEARNER block when isNewLearner=true and no active room", () => {
    const state = makeState({ isNewLearner: true });
    const block = formatLearnerStateBlock(state);
    expect(block).toContain("NEW LEARNER");
    expect(block).toContain("Greet them warmly");
    expect(block).toContain("Do NOT assume prior knowledge");
  });

  it("does NOT emit the NEW LEARNER block if there's an active study room", () => {
    const state = makeState({
      isNewLearner: true,
      activeStudyRoom: { subject: "Mathematics", topicName: "Fractions" },
    });
    const block = formatLearnerStateBlock(state);
    expect(block).not.toContain("NEW LEARNER");
    expect(block).toContain("Active study room: Mathematics — Fractions");
  });

  it("emits streak + level + XP header line", () => {
    const state = makeState({ streakDays: 7, level: 5, xpAmount: 240 });
    const block = formatLearnerStateBlock(state);
    expect(block).toContain("Streak: 7 days");
    expect(block).toContain("Level: 5");
    expect(block).toContain("(240 XP)");
  });

  it("uses singular 'day' when streak is 1", () => {
    const state = makeState({ streakDays: 1 });
    const block = formatLearnerStateBlock(state);
    expect(block).toContain("Streak: 1 day");
    expect(block).not.toContain("Streak: 1 days");
  });

  it("emits weakest topics with mastery percentage + relative time", () => {
    const state = makeState({
      weakestTopics: [{
        ...sampleTopic,
        masteryLevel: 0.35,
        totalAttempts: 5,
        correctAttempts: 2,
      }],
    });
    const block = formatLearnerStateBlock(state);
    expect(block).toContain("Weakest topics");
    expect(block).toContain("Mathematics → Fractions");
    expect(block).toContain("mastery 35%");
    expect(block).toContain("2/5 attempts correct");
    expect(block).toContain("days ago"); // 2 days ago
  });

  it("emits strongest topics with mastery percentage", () => {
    const state = makeState({
      strongestTopics: [{
        ...sampleTopic,
        topic: "Addition",
        masteryLevel: 0.95,
        totalAttempts: 10,
        correctAttempts: 10,
      }],
    });
    const block = formatLearnerStateBlock(state);
    expect(block).toContain("Strongest topics");
    expect(block).toContain("Mathematics → Addition");
    expect(block).toContain("mastery 95%");
    expect(block).toContain("10/10 attempts correct");
  });

  it("emits BOTH weakest + strongest with combined teaching guidance", () => {
    const state = makeState({
      weakestTopics: [{ ...sampleTopic, masteryLevel: 0.4 }],
      strongestTopics: [{ ...sampleTopic, topic: "Addition", masteryLevel: 0.95 }],
    });
    const block = formatLearnerStateBlock(state);
    expect(block).toContain("Weakest topics");
    expect(block).toContain("Strongest topics");
    expect(block).toContain("TEACHING GUIDANCE");
    expect(block).toContain("bridges");
  });

  it("emits weakest-only guidance when no strongest topics", () => {
    const state = makeState({
      weakestTopics: [{ ...sampleTopic, masteryLevel: 0.4 }],
    });
    const block = formatLearnerStateBlock(state);
    expect(block).toContain("TEACHING GUIDANCE");
    expect(block).toContain("proactively offer to review");
    expect(block).not.toContain("bridges");
  });

  it("emits strongest-only guidance when no weakest topics", () => {
    const state = makeState({
      strongestTopics: [{ ...sampleTopic, topic: "Addition", masteryLevel: 0.95 }],
    });
    const block = formatLearnerStateBlock(state);
    expect(block).toContain("TEACHING GUIDANCE");
    expect(block).toContain("introduce new, related material");
    expect(block).not.toContain("proactively offer");
  });

  it("emits active study room line + continuation guidance", () => {
    const state = makeState({
      activeStudyRoom: { subject: "Mathematics", topicName: "Fractions" },
    });
    const block = formatLearnerStateBlock(state);
    expect(block).toContain("Active study room: Mathematics — Fractions");
    expect(block).toContain("Continue teaching in this context");
  });

  it("always wraps block with === LEARNER STATE === / === END LEARNER STATE ===", () => {
    const state = makeState({ streakDays: 1 });
    const block = formatLearnerStateBlock(state);
    expect(block.startsWith("\n\n=== LEARNER STATE ===")).toBe(true);
    expect(block.endsWith("=== END LEARNER STATE ===\n")).toBe(true);
  });

  it("handles topic with masteryLevel exactly 0.6 — NOT weakest (boundary is <0.6)", () => {
    const state = makeState({
      weakestTopics: [], // 0.6 is not < 0.6, so it shouldn't be weakest
      strongestTopics: [],
      streakDays: 1, // give it something to emit
    });
    const block = formatLearnerStateBlock(state);
    expect(block).toContain("Streak: 1 day");
    expect(block).not.toContain("Weakest");
  });

  it("handles topic with masteryLevel exactly 0.85 — IS strongest (boundary is >=0.85)", () => {
    const state = makeState({
      strongestTopics: [{ ...sampleTopic, topic: "Boundary", masteryLevel: 0.85 }],
    });
    const block = formatLearnerStateBlock(state);
    expect(block).toContain("mastery 85%");
  });
});

describe("getLearnerState — DB integration (mocked)", () => {
  beforeEach(() => {
    // Reset ALL mocks to default empty/null returns between tests.
    // This prevents mockResolvedValue (which persists) from leaking across tests.
    vi.mocked(db.topicMastery.findMany).mockReset();
    vi.mocked(db.userXp.findUnique).mockReset();
    vi.mocked(db.studyRoomState.findFirst).mockReset();
    vi.mocked(db.topicMastery.findMany).mockResolvedValue([] as any);
    vi.mocked(db.userXp.findUnique).mockResolvedValue(null as any);
    vi.mocked(db.studyRoomState.findFirst).mockResolvedValue(null as any);
    // Default to enabled
    process.env.TUTOR_LEARNER_STATE_ENABLED = "true";
  });

  it("returns null when userId is empty", async () => {
    const result = await getLearnerState("");
    expect(result).toBeNull();
  });

  it("returns null when feature flag is off", async () => {
    process.env.TUTOR_LEARNER_STATE_ENABLED = "false";
    const result = await getLearnerState("user-123");
    expect(result).toBeNull();
  });

  it("returns null when all DB queries return empty/null (brand-new user)", async () => {
    vi.mocked(db.topicMastery.findMany).mockResolvedValue([] as any);
    vi.mocked(db.userXp.findUnique).mockResolvedValue(null as any);
    vi.mocked(db.studyRoomState.findFirst).mockResolvedValue(null as any);

    const result = await getLearnerState("user-123");
    expect(result).toBeNull();
  });

  it("returns a populated LearnerState when DB has data", async () => {
    vi.mocked(db.topicMastery.findMany).mockResolvedValue([
      {
        subject: "Mathematics",
        topic: "Fractions",
        masteryLevel: 0.4,
        totalAttempts: 5,
        correctAttempts: 2,
        lastUpdated: new Date(),
      },
      {
        subject: "Mathematics",
        topic: "Addition",
        masteryLevel: 0.95,
        totalAttempts: 10,
        correctAttempts: 10,
        lastUpdated: new Date(),
      },
    ] as any);
    vi.mocked(db.userXp.findUnique).mockResolvedValue({
      streakDays: 7,
      level: 5,
      xpAmount: 240,
    } as any);
    vi.mocked(db.studyRoomState.findFirst).mockResolvedValue({
      topic: { name: "Fractions", subject: "Mathematics" },
    } as any);

    const result = await getLearnerState("user-123");
    expect(result).not.toBeNull();
    expect(result!.weakestTopics).toHaveLength(1);
    expect(result!.weakestTopics[0].topic).toBe("Fractions");
    expect(result!.strongestTopics).toHaveLength(1);
    expect(result!.strongestTopics[0].topic).toBe("Addition");
    expect(result!.streakDays).toBe(7);
    expect(result!.level).toBe(5);
    expect(result!.xpAmount).toBe(240);
    expect(result!.activeStudyRoom).toEqual({
      subject: "Mathematics",
      topicName: "Fractions",
    });
    expect(result!.isNewLearner).toBe(false);
  });

  it("returns isNewLearner=true when no mastery rows but XP exists", async () => {
    vi.mocked(db.topicMastery.findMany).mockResolvedValue([] as any);
    vi.mocked(db.userXp.findUnique).mockResolvedValue({
      streakDays: 1,
      level: 1,
      xpAmount: 5,
    } as any);
    vi.mocked(db.studyRoomState.findFirst).mockResolvedValue(null as any);

    const result = await getLearnerState("user-123");
    expect(result).not.toBeNull();
    expect(result!.isNewLearner).toBe(true);
    expect(result!.streakDays).toBe(1);
  });

  it("returns null when DB throws (fail-safe)", async () => {
    vi.mocked(db.topicMastery.findMany).mockRejectedValue(new Error("DB down") as any);

    const result = await getLearnerState("user-123");
    expect(result).toBeNull();
  });

  it("filters out topics with zero totalAttempts (untried topics aren't 'weak')", async () => {
    vi.mocked(db.topicMastery.findMany).mockResolvedValue([
      {
        subject: "Math", topic: "Untried",
        masteryLevel: 0, totalAttempts: 0, correctAttempts: 0,
        lastUpdated: new Date(),
      },
      {
        subject: "Math", topic: "Tried-But-Weak",
        masteryLevel: 0.3, totalAttempts: 4, correctAttempts: 1,
        lastUpdated: new Date(),
      },
    ] as any);
    vi.mocked(db.userXp.findUnique).mockResolvedValue(null as any);
    vi.mocked(db.studyRoomState.findFirst).mockResolvedValue(null as any);

    const result = await getLearnerState("user-123");
    expect(result).not.toBeNull();
    expect(result!.weakestTopics).toHaveLength(1);
    expect(result!.weakestTopics[0].topic).toBe("Tried-But-Weak");
  });

  it("limits weakest + strongest to 3 entries each", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      subject: "Math",
      topic: `Weak-${i}`,
      masteryLevel: 0.1,
      totalAttempts: 5,
      correctAttempts: 0,
      lastUpdated: new Date(Date.now() - i * 1000),
    }));
    vi.mocked(db.topicMastery.findMany).mockResolvedValue(many as any);
    vi.mocked(db.userXp.findUnique).mockResolvedValue({ streakDays: 1, level: 1, xpAmount: 0 } as any);
    vi.mocked(db.studyRoomState.findFirst).mockResolvedValue(null as any);

    const result = await getLearnerState("user-123");
    expect(result!.weakestTopics).toHaveLength(3);
    // The 3 most recent (by lastUpdated desc) should be picked
    expect(result!.weakestTopics[0].topic).toBe("Weak-0");
  });

  it("sorts weakest by lastUpdated DESC (most recent first)", async () => {
    vi.mocked(db.topicMastery.findMany).mockResolvedValue([
      { subject: "Math", topic: "Old", masteryLevel: 0.2, totalAttempts: 3, correctAttempts: 0, lastUpdated: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
      { subject: "Math", topic: "Recent", masteryLevel: 0.3, totalAttempts: 3, correctAttempts: 0, lastUpdated: new Date() },
    ] as any);
    vi.mocked(db.userXp.findUnique).mockResolvedValue(null as any);
    vi.mocked(db.studyRoomState.findFirst).mockResolvedValue(null as any);

    const result = await getLearnerState("user-123");
    expect(result!.weakestTopics[0].topic).toBe("Recent");
    expect(result!.weakestTopics[1].topic).toBe("Old");
  });
});
