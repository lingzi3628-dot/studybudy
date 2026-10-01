/**
 * context-builder tests — Phase 91
 *
 * Covers the 6 track × course branches that buildTutorSystemPrompt()
 * must handle correctly. These are the branches that previous phases
 * (84, 88.1) got wrong and that we explicitly want to pin down so
 * Phase 92+ learner-state changes don't regress them.
 *
 * Strategy: mock the DB + the curriculum + the aware-engine + the
 * buddy registry, then assert that the system prompt contains the
 * expected track-aware + course-aware sections.
 *
 * Run: npx vitest run src/lib/tutor/__tests__/context-builder.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------
// Mocks — must be set up BEFORE importing the module under test.
// ---------------------------------------------------------------

// 1. Mock @/lib/db — return [] for CourseKnowledge, null for CurriculumGrade.
vi.mock("@/lib/db", () => ({
  db: {
    courseKnowledge: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    curriculumGrade: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

// 2. Mock @/lib/aware-engine — return a minimal TeachingProfile so we don't
//    need the full grade-band switch logic.
vi.mock("@/lib/aware-engine", () => ({
  buildTeachingProfile: vi.fn((gradeName: string) => ({
    level: "test",
    levelLabel: `Test (${gradeName})`,
    maxSentenceLength: 20,
    vocabularyLevel: "intermediate",
    useAnalogies: false,
    useParentAssist: false,
    studySessionMin: 30,
    breakMin: 5,
    popUpQuizInterval: 15,
    explanationDepth: "moderate",
    systemPromptSuffix: `[TEST TEACHING PROFILE for ${gradeName}]`,
    parentPrompts: [],
  })),
}));

// 3. Mock @/lib/curriculum-engine — return a deterministic context string.
vi.mock("@/lib/curriculum-engine", () => ({
  buildCurriculumContextResolved: vi.fn((grade: string) =>
    `[TEST CURRICULUM CONTEXT for ${grade}]`,
  ),
}));

// 4. Mock @/lib/buddies/registry — return a stub Buddy. The function under
//    test doesn't call getBuddy() itself (the route passes the Buddy in),
//    but the module imports it for re-export.
vi.mock("@/lib/buddies/registry", () => ({
  getBuddy: vi.fn(),
  isValidBuddyId: vi.fn((id: string) => id === "study"),
  DEFAULT_BUDDY_ID: "study",
}));

// 5. Phase 92 — Mock ./learner-state so context-builder tests don't hit DB.
//    We expose getLearnerStatePromptBlock as a spy so individual tests can
//    override its return value via mockResolvedValueOnce(...).
vi.mock("../learner-state", () => ({
  getLearnerStatePromptBlock: vi.fn().mockResolvedValue({ text: "", state: null }),
  isLearnerStateEnabled: vi.fn(() => true),
}));

// 6. Phase 93 — Mock ./rag so context-builder tests don't load TF.js.
vi.mock("../rag", () => ({
  getRetrievedKnowledgePromptBlock: vi.fn().mockResolvedValue({ text: "", retrievedChunks: [], usedFallback: false }),
  isRagEnabled: vi.fn(() => true),
  ingestCourseKnowledge: vi.fn().mockResolvedValue(0),
  retrieveTopK: vi.fn().mockResolvedValue(null),
  embedTexts: vi.fn().mockResolvedValue(null),
}));

// 7. Phase 95 — Mock ./lesson-controller so context-builder tests don't hit DB.
vi.mock("../lesson-controller", () => ({
  getLessonStatePromptBlock: vi.fn().mockResolvedValue({ text: "", state: null }),
  isLessonControllerEnabled: vi.fn(() => true),
  getLessonState: vi.fn().mockResolvedValue(null),
  startLesson: vi.fn().mockResolvedValue(null),
  advanceLessonState: vi.fn().mockResolvedValue(null),
  endLesson: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------
// Import the module under test AFTER mocks are registered.
// ---------------------------------------------------------------
import { buildTutorSystemPrompt } from "../context-builder";
import { getLearnerStatePromptBlock } from "../learner-state";
import { getRetrievedKnowledgePromptBlock } from "../rag";
import { getLessonStatePromptBlock } from "../lesson-controller";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const BASE_OPTS = {
  buddyId: "study",
  userMessage: "What is photosynthesis?",
  dataSaver: false,
  imageDataUrl: null,
  searchContext: "",
  learningMode: "standard" as const,
  clientPlatform: "web" as const,
};

// Stub Buddy object — only used when buddyId !== "study"
const STUB_BUDDY: any = {
  id: "dev",
  buildSystemPrompt: vi.fn(() => "STUB BUDDY PROMPT"),
};

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe("buildTutorSystemPrompt — 6 track × course branches (Phase 91)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Branch 1: K-12 + Grade
  it("branch 1: K-12 + Grade 4 → loads CBC curriculum + grade context", async () => {
    const { systemContent, teachingProfile, curriculumContext } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
    });

    expect(teachingProfile.levelLabel).toBe("Test (Grade 4)");
    expect(curriculumContext).toBe("[TEST CURRICULUM CONTEXT for Grade 4]");
    expect(systemContent).toContain("You are StudyBuddy");
    expect(systemContent).toContain("[TEST TEACHING PROFILE for Grade 4]");
    expect(systemContent).toContain("[TEST CURRICULUM CONTEXT for Grade 4]");
    expect(systemContent).toContain("K-12 — Grade 4");
    expect(systemContent).toContain("Kenyan CBC curriculum for Grade 4");
    expect(systemContent).toContain("PROACTIVE TEACHING MODE");
  });

  // Branch 2: Secondary + Grade (Form 3)
  it("branch 2: Secondary + Form 3 → loads CBC curriculum + secondary context", async () => {
    const { systemContent, curriculumContext } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Form 3", track: "secondary", course: null },
      buddy: STUB_BUDDY,
    });

    expect(curriculumContext).toBe("[TEST CURRICULUM CONTEXT for Form 3]");
    expect(systemContent).toContain("SECONDARY — Form 3");
    expect(systemContent).toContain("Kenyan Form 3 curriculum");
  });

  // Branch 3: University + Course (Medicine) — Phase 88.1 critical fix
  it("branch 3: University + Medicine → NO K-12 curriculum + course-aware context", async () => {
    const { systemContent, curriculumContext } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: null, track: "university", course: "Bachelor of Medicine & Surgery" },
      buddy: STUB_BUDDY,
    });

    // Phase 88.1 fix: higher-ed MUST NOT receive K-12 curriculum context
    expect(curriculumContext).toBe("");
    expect(systemContent).not.toContain("[TEST CURRICULUM CONTEXT");
    expect(systemContent).toContain("UNIVERSITY — Bachelor of Medicine & Surgery");
    expect(systemContent).toContain("Do NOT assume they are in a Kenyan secondary school grade");
    expect(systemContent).toContain("Bachelor of Medicine & Surgery curriculum");
  });

  // Branch 4: College + Course
  it("branch 4: College + Business → NO K-12 curriculum + course-aware context", async () => {
    const { systemContent, curriculumContext } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: null, track: "college", course: "Diploma in Business Management" },
      buddy: STUB_BUDDY,
    });

    expect(curriculumContext).toBe("");
    expect(systemContent).toContain("COLLEGE — Diploma in Business Management");
    expect(systemContent).toContain("Diploma in Business Management curriculum");
  });

  // Branch 5: TVET + Course
  it("branch 5: TVET + Electrical Installation → NO K-12 curriculum + course-aware context", async () => {
    const { systemContent, curriculumContext } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: null, track: "tvet", course: "Electrical Installation" },
      buddy: STUB_BUDDY,
    });

    expect(curriculumContext).toBe("");
    expect(systemContent).toContain("TVET — Electrical Installation");
    expect(systemContent).toContain("Electrical Installation curriculum");
  });

  // Branch 6: Legacy "mixed" track + Course → treated as higher-ed (Phase 88.1)
  it("branch 6: Mixed (legacy) + Course → treated as higher-ed (no K-12 curriculum)", async () => {
    const { systemContent, curriculumContext } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: null, track: "mixed", course: "Law" },
      buddy: STUB_BUDDY,
    });

    expect(curriculumContext).toBe("");
    expect(systemContent).toContain("MIXED — Law");
  });
});

describe("buildTutorSystemPrompt — non-buddy features (Phase 91)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("learningMode=explain appends the explain-mode instruction", async () => {
    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      learningMode: "explain",
    });
    expect(systemContent).toContain("LEARNER-SELECTED TUTOR MODE (explain)");
    expect(systemContent).toContain("Teach this clearly in small numbered steps");
  });

  it("learningMode=practice appends the practice-mode instruction", async () => {
    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      learningMode: "practice",
    });
    expect(systemContent).toContain("LEARNER-SELECTED TUTOR MODE (practice)");
  });

  it("dataSaver=true appends the DATA SAVER MODE block", async () => {
    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      dataSaver: true,
    });
    expect(systemContent).toContain("DATA SAVER MODE is ON");
    expect(systemContent).toContain("max ~150 words");
  });

  it("dataSaver=false does NOT add the DATA SAVER block", async () => {
    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      dataSaver: false,
    });
    expect(systemContent).not.toContain("DATA SAVER MODE is ON");
  });

  it("mobile clientPlatform includes the computer_workspace offer schema", async () => {
    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      clientPlatform: "mobile",
    });
    expect(systemContent).toContain("mobile client");
    expect(systemContent).toContain("computer_workspace");
    expect(systemContent).toContain("MANDATORY MOBILE FALLBACK");
  });

  it("web clientPlatform includes the workspace offer but no mobile fallback", async () => {
    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      clientPlatform: "web",
    });
    expect(systemContent).toContain("web client");
    expect(systemContent).toContain("MANDATORY MOBILE FALLBACK"); // block is always added
    expect(systemContent).toContain("On a web client, do not offer a device switch");
  });

  it("searchContext with WEB SEARCH RESULTS adds the SOURCE CITATIONS block", async () => {
    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      searchContext: "WEB SEARCH RESULTS for photosynthesis:\n- Example (https://example.com)\n  desc",
    });
    expect(systemContent).toContain("SOURCE CITATIONS");
    expect(systemContent).toContain("Markdown link");
  });

  it("empty searchContext does NOT add the SOURCE CITATIONS block", async () => {
    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      searchContext: "",
    });
    expect(systemContent).not.toContain("SOURCE CITATIONS");
  });

  it("toolResults present appends the TUTOR TOOL RESULTS note", async () => {
    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      toolResults: "[Tutor tool: calculator; success]\n42",
    });
    expect(systemContent).toContain("TUTOR TOOL RESULTS");
    expect(systemContent).toContain("preserve exact calculation/code output");
  });

  it("studyContext is concatenated with searchContext into the complete context", async () => {
    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      searchContext: "WEB SEARCH RESULTS",
      studyContext: "LEARNER'S ACTIVE STUDY ROOM: Math — Fractions",
    });
    expect(systemContent).toContain("LEARNER'S ACTIVE STUDY ROOM");
  });
});

describe("buildTutorSystemPrompt — knowledge-gap upload prompt (Phase 84)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("higher-ed with no CourseKnowledge emits the KNOWLEDGE GAP block", async () => {
    // Default mock returns [] — i.e. no knowledge entries
    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: null, track: "university", course: "Bachelor of Laws (LLB)" },
      buddy: STUB_BUDDY,
    });
    expect(systemContent).toContain("KNOWLEDGE GAP");
    expect(systemContent).toContain("Bachelor of Laws (LLB)");
    expect(systemContent).toContain("📎");
  });

  it("K-12 with no CourseKnowledge emits the K-12 KNOWLEDGE GAP block", async () => {
    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
    });
    expect(systemContent).toContain("KNOWLEDGE GAP");
    expect(systemContent).toContain("k12");
    expect(systemContent).toContain("Grade 4");
  });

  it("when CourseKnowledge exists, NO KNOWLEDGE GAP block is added", async () => {
    // Override the mock for this test
    const { db } = await import("@/lib/db");
    (db.courseKnowledge.findMany as any).mockResolvedValueOnce([
      {
        title: "Test Outline",
        sourceType: "outline",
        createdAt: new Date("2024-01-01"),
        summary: "A summary that is long enough to be sliced by the 500-char cutoff without issues.",
        topics: [{ title: "Topic A", description: "desc", keyConcepts: ["c1"] }],
        rawText: "raw text content here that is at least long enough to pass the slice.",
      },
    ]);

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
    });

    expect(systemContent).toContain("COURSE KNOWLEDGE BASE");
    expect(systemContent).not.toContain("KNOWLEDGE GAP");
  });
});

describe("buildTutorSystemPrompt — non-study buddy delegation (Phase 47)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buddyId='dev' delegates to buddy.buildSystemPrompt + appends track context", async () => {
    const devBuddy: any = {
      id: "dev",
      buildSystemPrompt: vi.fn(() => "DEV BUDDY PROMPT BODY"),
    };

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null },
      buddy: devBuddy,
      buddyId: "dev",
    });

    expect(devBuddy.buildSystemPrompt).toHaveBeenCalledOnce();
    expect(systemContent.startsWith("DEV BUDDY PROMPT BODY")).toBe(true);
    // Phase 84 — track + course + knowledge context still appended for non-study buddies
    expect(systemContent).toContain("K-12 — Grade 4");
  });
});

describe("buildTutorSystemPrompt — Phase 91 byte-identical contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("produces a stable, deterministic output for the same inputs", async () => {
    const opts = {
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
    };
    const a = await buildTutorSystemPrompt(opts);
    const b = await buildTutorSystemPrompt(opts);
    expect(a.systemContent).toBe(b.systemContent);
    expect(a.curriculumContext).toBe(b.curriculumContext);
    expect(a.teachingProfile.levelLabel).toBe(b.teachingProfile.levelLabel);
  });

  it("always emits the proactive-teaching rules block", async () => {
    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: null, track: "university", course: "Bachelor of Medicine & Surgery" },
      buddy: STUB_BUDDY,
    });
    // The proactive teaching rules are present in every prompt, regardless of track
    expect(systemContent).toContain("PROACTIVE TEACHING MODE");
    expect(systemContent).toContain("You are the TEACHER");
    expect(systemContent).toContain("mathgraph");
    expect(systemContent).toContain("examgen");
    expect(systemContent).toContain("quiz");
    expect(systemContent).toContain("draw_task");
  });
});

// ============================================================
// Phase 92 — Learner-state injection integration tests
// ============================================================

describe("buildTutorSystemPrompt — Phase 92 learner-state injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: learner-state returns empty (Phase 91 behavior)
    vi.mocked(getLearnerStatePromptBlock).mockResolvedValue({ text: "", state: null });
  });

  it("does NOT emit LEARNER STATE block when user.id is missing (Phase 91 compat)", async () => {
    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { grade: "Grade 4", track: "k12", course: null }, // no id
      buddy: STUB_BUDDY,
    });
    expect(systemContent).not.toContain("LEARNER STATE");
    expect(getLearnerStatePromptBlock).not.toHaveBeenCalled();
  });

  it("does NOT emit LEARNER STATE block when skipLearnerState=true", async () => {
    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      skipLearnerState: true,
    });
    expect(systemContent).not.toContain("LEARNER STATE");
    expect(getLearnerStatePromptBlock).not.toHaveBeenCalled();
  });

  it("does NOT emit LEARNER STATE block when learner-state returns empty text", async () => {
    vi.mocked(getLearnerStatePromptBlock).mockResolvedValue({ text: "", state: null });

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
    });
    expect(getLearnerStatePromptBlock).toHaveBeenCalledWith("user-123");
    expect(systemContent).not.toContain("LEARNER STATE");
  });

  it("emits LEARNER STATE block when learner-state returns text", async () => {
    vi.mocked(getLearnerStatePromptBlock).mockResolvedValue({
      text: `\n\n=== LEARNER STATE ===\nStreak: 7 days | Level: 5 (240 XP)\nWeakest topics:\n  • Mathematics → Fractions — mastery 35%\n=== END LEARNER STATE ===\n`,
      state: null,
    });

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
    });
    expect(getLearnerStatePromptBlock).toHaveBeenCalledWith("user-123");
    expect(systemContent).toContain("=== LEARNER STATE ===");
    expect(systemContent).toContain("Streak: 7 days");
    expect(systemContent).toContain("Mathematics → Fractions");
    expect(systemContent).toContain("=== END LEARNER STATE ===");
  });

  it("positions LEARNER STATE BEFORE the proactive teaching rules", async () => {
    vi.mocked(getLearnerStatePromptBlock).mockResolvedValue({
      text: `\n\n=== LEARNER STATE ===\nStreak: 1 day\n=== END LEARNER STATE ===\n`,
      state: null,
    });

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
    });
    const learnerIdx = systemContent.indexOf("=== LEARNER STATE ===");
    const proactiveIdx = systemContent.indexOf("PROACTIVE TEACHING MODE");
    expect(learnerIdx).toBeGreaterThan(-1);
    expect(proactiveIdx).toBeGreaterThan(-1);
    expect(learnerIdx).toBeLessThan(proactiveIdx);
  });

  it("emits LEARNER STATE for non-study buddies too (after trackContext)", async () => {
    vi.mocked(getLearnerStatePromptBlock).mockResolvedValue({
      text: `\n\n=== LEARNER STATE ===\nStreak: 3 days\n=== END LEARNER STATE ===\n`,
      state: null,
    });

    const devBuddy: any = {
      id: "dev",
      buildSystemPrompt: vi.fn(() => "DEV BUDDY PROMPT BODY"),
    };

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: devBuddy,
      buddyId: "dev",
    });
    expect(systemContent).toContain("=== LEARNER STATE ===");
    expect(systemContent).toContain("Streak: 3 days");
  });

  it("continues to work if learner-state throws (Phase 91 byte-identical fallback)", async () => {
    vi.mocked(getLearnerStatePromptBlock).mockRejectedValue(new Error("network down"));

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
    });
    // Block is omitted on error — no regression to the rest of the prompt
    expect(systemContent).not.toContain("LEARNER STATE");
    expect(systemContent).toContain("PROACTIVE TEACHING MODE");
    expect(systemContent).toContain("K-12 — Grade 4");
  });

  it("emits the NEW LEARNER block for a brand-new student", async () => {
    vi.mocked(getLearnerStatePromptBlock).mockResolvedValue({
      text: `\n\n=== LEARNER STATE ===\nThis is a NEW LEARNER with no quiz history yet. Greet them warmly and suggest\na starting topic from their curriculum. Do NOT assume prior knowledge.\n=== END LEARNER STATE ===\n`,
      state: null,
    });

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      user: { id: "new-user", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
    });
    expect(systemContent).toContain("NEW LEARNER");
    expect(systemContent).toContain("Greet them warmly");
  });
});

// ============================================================
// Phase 93 — Semantic RAG integration tests
// ============================================================

describe("buildTutorSystemPrompt — Phase 93 semantic RAG", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: both learner-state and RAG return empty
    vi.mocked(getLearnerStatePromptBlock).mockResolvedValue({ text: "", state: null });
    vi.mocked(getRetrievedKnowledgePromptBlock).mockResolvedValue({ text: "", retrievedChunks: [], usedFallback: false });
  });

  it("does NOT call RAG when userMessage is empty", async () => {
    await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "",
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
    });
    expect(getRetrievedKnowledgePromptBlock).not.toHaveBeenCalled();
  });

  it("does NOT call RAG when userMessage is too short (<3 chars)", async () => {
    await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "hi",
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
    });
    expect(getRetrievedKnowledgePromptBlock).not.toHaveBeenCalled();
  });

  it("does NOT call RAG when skipRag=true", async () => {
    await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "What is contract law?",
      user: { id: "user-123", grade: null, track: "university", course: "Bachelor of Laws (LLB)" },
      buddy: STUB_BUDDY,
      skipRag: true,
    });
    expect(getRetrievedKnowledgePromptBlock).not.toHaveBeenCalled();
  });

  it("calls RAG with the user's message + track + course for higher-ed", async () => {
    await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "What is consideration in contract law?",
      user: { id: "user-123", grade: null, track: "university", course: "Bachelor of Laws (LLB)" },
      buddy: STUB_BUDDY,
    });
    expect(getRetrievedKnowledgePromptBlock).toHaveBeenCalledWith({
      userMessage: "What is consideration in contract law?",
      track: "university",
      course: "Bachelor of Laws (LLB)",
      grade: null,
    });
  });

  it("calls RAG with track + grade for K-12 students", async () => {
    await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "What is photosynthesis?",
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
    });
    expect(getRetrievedKnowledgePromptBlock).toHaveBeenCalledWith({
      userMessage: "What is photosynthesis?",
      track: "k12",
      course: null,
      grade: "Grade 4",
    });
  });

  it("emits RETRIEVED KNOWLEDGE block when RAG returns chunks", async () => {
    vi.mocked(getRetrievedKnowledgePromptBlock).mockResolvedValue({
      text: `\n\n=== RETRIEVED KNOWLEDGE (semantic RAG, top 2 chunks) ===\nThe following chunks are the most semantically relevant...\n\n[1] (similarity 78%) — "LLB Course Outline"\nSource: outline | Subject: Law\nConsideration in contract law refers to...\n\n=== END RETRIEVED KNOWLEDGE ===\n`,
      retrievedChunks: [],
      usedFallback: false,
    });

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "What is consideration?",
      user: { id: "user-123", grade: null, track: "university", course: "Bachelor of Laws (LLB)" },
      buddy: STUB_BUDDY,
    });
    expect(systemContent).toContain("=== RETRIEVED KNOWLEDGE");
    expect(systemContent).toContain("Consideration in contract law refers to");
    expect(systemContent).toContain("=== END RETRIEVED KNOWLEDGE ===");
  });

  it("does NOT emit RETRIEVED KNOWLEDGE block when RAG returns empty", async () => {
    vi.mocked(getRetrievedKnowledgePromptBlock).mockResolvedValue({
      text: "",
      retrievedChunks: [],
      usedFallback: false,
    });

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "What is photosynthesis?",
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
    });
    expect(systemContent).not.toContain("RETRIEVED KNOWLEDGE");
  });

  it("continues to work if RAG throws (Phase 92 byte-identical fallback)", async () => {
    vi.mocked(getRetrievedKnowledgePromptBlock).mockRejectedValue(new Error("TF.js failed to load"));

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "What is photosynthesis?",
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
    });
    expect(systemContent).not.toContain("RETRIEVED KNOWLEDGE");
    expect(systemContent).toContain("PROACTIVE TEACHING MODE");
  });

  it("positions RETRIEVED KNOWLEDGE block right after courseKnowledgeContext", async () => {
    vi.mocked(getRetrievedKnowledgePromptBlock).mockResolvedValue({
      text: `\n\n=== RETRIEVED KNOWLEDGE (top 1) ===\nchunk text\n=== END RETRIEVED KNOWLEDGE ===\n`,
      retrievedChunks: [],
      usedFallback: false,
    });

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "test query",
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
    });
    const ragIdx = systemContent.indexOf("=== RETRIEVED KNOWLEDGE");
    const proactiveIdx = systemContent.indexOf("PROACTIVE TEACHING MODE");
    expect(ragIdx).toBeGreaterThan(-1);
    expect(proactiveIdx).toBeGreaterThan(-1);
    expect(ragIdx).toBeLessThan(proactiveIdx);
  });

  it("emits RETRIEVED KNOWLEDGE for non-study buddies too", async () => {
    vi.mocked(getRetrievedKnowledgePromptBlock).mockResolvedValue({
      text: `\n\n=== RETRIEVED KNOWLEDGE (top 1) ===\nchunk text\n=== END RETRIEVED KNOWLEDGE ===\n`,
      retrievedChunks: [],
      usedFallback: false,
    });

    const devBuddy: any = {
      id: "dev",
      buildSystemPrompt: vi.fn(() => "DEV BUDDY PROMPT"),
    };

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "test query",
      user: { id: "user-123", grade: null, track: "university", course: "Computer Science" },
      buddy: devBuddy,
      buddyId: "dev",
    });
    expect(systemContent).toContain("=== RETRIEVED KNOWLEDGE");
  });
});

// ============================================================
// Phase 95 — Lesson controller integration tests
// ============================================================

describe("buildTutorSystemPrompt — Phase 95 lesson controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all enrichment blocks return empty
    vi.mocked(getLearnerStatePromptBlock).mockResolvedValue({ text: "", state: null });
    vi.mocked(getRetrievedKnowledgePromptBlock).mockResolvedValue({ text: "", retrievedChunks: [], usedFallback: false });
    vi.mocked(getLessonStatePromptBlock).mockResolvedValue({ text: "", state: null });
  });

  it("does NOT call lesson-controller when conversationId is missing", async () => {
    await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "test",
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      // no conversationId
    });
    expect(getLessonStatePromptBlock).not.toHaveBeenCalled();
  });

  it("does NOT call lesson-controller when skipLessonState=true", async () => {
    await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "test",
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      conversationId: "conv-1",
      skipLessonState: true,
    });
    expect(getLessonStatePromptBlock).not.toHaveBeenCalled();
  });

  it("calls lesson-controller with conversationId + userId", async () => {
    await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "test",
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      conversationId: "conv-1",
    });
    expect(getLessonStatePromptBlock).toHaveBeenCalledWith("conv-1", "user-123");
  });

  it("emits LESSON STATE block when lesson is active", async () => {
    vi.mocked(getLessonStatePromptBlock).mockResolvedValue({
      text: `\n\n=== LESSON STATE ===\nActive lesson: "Fractions" (stage: EXPLAIN)\n\nSTAGE GUIDANCE — EXPLAIN:\nTeach the concept in 2-3 short paragraphs.\n=== END LESSON STATE ===\n`,
      state: null,
    });

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "test",
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      conversationId: "conv-1",
    });
    expect(systemContent).toContain("=== LESSON STATE ===");
    expect(systemContent).toContain("Fractions");
    expect(systemContent).toContain("stage: EXPLAIN");
    expect(systemContent).toContain("=== END LESSON STATE ===");
  });

  it("does NOT emit LESSON STATE block when no lesson is active", async () => {
    vi.mocked(getLessonStatePromptBlock).mockResolvedValue({ text: "", state: null });

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "test",
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      conversationId: "conv-1",
    });
    expect(systemContent).not.toContain("LESSON STATE");
  });

  it("continues to work if lesson-controller throws (Phase 94 byte-identical fallback)", async () => {
    vi.mocked(getLessonStatePromptBlock).mockRejectedValue(new Error("DB down"));

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "test",
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      conversationId: "conv-1",
    });
    expect(systemContent).not.toContain("LESSON STATE");
    expect(systemContent).toContain("PROACTIVE TEACHING MODE");
  });

  it("positions LESSON STATE block AFTER learner state, BEFORE proactive teaching rules", async () => {
    vi.mocked(getLearnerStatePromptBlock).mockResolvedValue({
      text: `\n\n=== LEARNER STATE ===\nStreak: 1 day\n=== END LEARNER STATE ===\n`,
      state: null,
    });
    vi.mocked(getLessonStatePromptBlock).mockResolvedValue({
      text: `\n\n=== LESSON STATE ===\nActive lesson: "Fractions"\n=== END LESSON STATE ===\n`,
      state: null,
    });

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "test",
      user: { id: "user-123", grade: "Grade 4", track: "k12", course: null },
      buddy: STUB_BUDDY,
      conversationId: "conv-1",
    });
    const learnerIdx = systemContent.indexOf("=== LEARNER STATE ===");
    const lessonIdx = systemContent.indexOf("=== LESSON STATE ===");
    const proactiveIdx = systemContent.indexOf("PROACTIVE TEACHING MODE");
    expect(learnerIdx).toBeGreaterThan(-1);
    expect(lessonIdx).toBeGreaterThan(learnerIdx);
    expect(proactiveIdx).toBeGreaterThan(lessonIdx);
  });

  it("emits LESSON STATE for non-study buddies too", async () => {
    vi.mocked(getLessonStatePromptBlock).mockResolvedValue({
      text: `\n\n=== LESSON STATE ===\nActive lesson: "Fractions"\n=== END LESSON STATE ===\n`,
      state: null,
    });

    const devBuddy: any = {
      id: "dev",
      buildSystemPrompt: vi.fn(() => "DEV BUDDY PROMPT"),
    };

    const { systemContent } = await buildTutorSystemPrompt({
      ...BASE_OPTS,
      userMessage: "test",
      user: { id: "user-123", grade: null, track: "university", course: "Computer Science" },
      buddy: devBuddy,
      buddyId: "dev",
      conversationId: "conv-1",
    });
    expect(systemContent).toContain("=== LESSON STATE ===");
  });
});
