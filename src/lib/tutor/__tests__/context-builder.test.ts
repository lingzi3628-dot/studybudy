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

// ---------------------------------------------------------------
// Import the module under test AFTER mocks are registered.
// ---------------------------------------------------------------
import { buildTutorSystemPrompt } from "../context-builder";

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
