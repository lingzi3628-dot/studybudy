/**
 * NewHome component tests — Phase F0 (Dashboard redesign)
 *
 * Tests the new K-12/secondary dashboard:
 *   - Renders greeting with user name
 *   - Shows grade + track from progress
 *   - Shows "Continue Learning" with last topic
 *   - Shows "Choose a subject" when no mastery (no false recommendation)
 *   - Shows subjects chips from user.subjects
 *   - Shows due count from progress.dueCount
 *   - Shows weak topics count
 *   - Shows top 3 study sets
 *   - Does NOT show old 8-buddy grid
 *   - Does NOT show hardcoded "Today's Challenge"
 *   - Loading state shows skeleton (not blank)
 *   - Error state shows retry (not "0% progress")
 *   - "Continue" button opens tutor
 *   - Subject chip opens curriculum view
 *
 * Run: npx vitest run src/components/studybuddy/screens/__tests__/NewHome.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// ---------------------------------------------------------------
// Mocks — use vi.hoisted() so the mock fn references survive
// vitest's vi.mock hoisting (the factory runs before const declarations).
// ---------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  setScreen: vi.fn(),
  setActiveStudySetId: vi.fn(),
  setActiveTopicId: vi.fn(),
  openCreate: vi.fn(),
  getProgress: vi.fn(),
  listStudySets: vi.fn(),
  getRecommended: vi.fn(),
}));

// 1. Mock the store — selector-based (matches NewHome's usage)
vi.mock("../../store", () => ({
  useApp: (selector: (state: any) => any) => {
    const state = {
      setScreen: mocks.setScreen,
      setActiveStudySetId: mocks.setActiveStudySetId,
      setActiveTopicId: mocks.setActiveTopicId,
      openCreate: mocks.openCreate,
    };
    return selector ? selector(state) : state;
  },
}));

// 2. Mock the i18n hook
vi.mock("@/lib/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "dash.greeting.morning": "Good morning",
        "dash.greeting.afternoon": "Good afternoon",
        "dash.greeting.evening": "Good evening",
        "dash.continueLearning": "CONTINUE LEARNING",
        "dash.streak": "day streak",
      };
      return map[key] ?? key;
    },
  }),
}));

// 3. Mock the API
vi.mock("../../api", () => ({
  api: {
    getProgress: () => mocks.getProgress(),
    listStudySets: () => mocks.listStudySets(),
    getRecommended: () => mocks.getRecommended(),
  },
}));

// Import AFTER mocks are set up
import { NewHome } from "../NewHome";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function makeProgress(overrides: any = {}) {
  return {
    user: {
      name: "Achieng Otieno",
      email: "achieng@test.com",
      plan: "free" as const,
      grade: "Grade 5",
      track: "k12",
      subjects: ["Mathematics", "English", "Kiswahili", "Science", "Social Studies"],
      ...overrides.user,
    },
    xp: 240,
    level: 5,
    streak: 7,
    dueCount: 3,
    mastery: [
      {
        subject: "Mathematics",
        mastery: 0.6,
        topics: [
          { topic: "Fractions", mastery: 0.35, totalAttempts: 5, correctAttempts: 2 },
          { topic: "Addition", mastery: 0.95, totalAttempts: 10, correctAttempts: 10 },
        ],
      },
    ],
    weakAreas: [
      { subject: "Mathematics", topic: "Fractions", mastery: 0.35, totalAttempts: 5, correctAttempts: 2 },
    ],
    recentAttempts: [],
    badges: [],
    totalAttempts: 15,
    correctAttempts: 12,
    ...overrides,
  };
}

function makeSets(count: number = 2) {
  return {
    sets: Array.from({ length: count }, (_, i) => ({
      id: `set-${i}`,
      title: `Study Set ${i + 1}`,
      sourceType: "paste",
      subject: i === 0 ? "Mathematics" : "English",
      topic: null,
      createdAt: new Date().toISOString(),
      cardCount: 10 + i,
    })),
  };
}

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe("NewHome — dashboard redesign", () => {
  beforeEach(() => {
    // mockReset (not just clearAllMocks) — clears calls + results + implementation
    mocks.setScreen.mockReset();
    mocks.setActiveStudySetId.mockReset();
    mocks.setActiveTopicId.mockReset();
    mocks.openCreate.mockReset();
    mocks.getProgress.mockReset();
    mocks.listStudySets.mockReset();
    mocks.getRecommended.mockReset();
    // Default mocks
    mocks.getProgress.mockResolvedValue(makeProgress());
    mocks.listStudySets.mockResolvedValue(makeSets(2));
    mocks.getRecommended.mockResolvedValue({ cards: [], weakTopics: [] });
  });

  afterEach(() => {
    cleanup();
  });

  // ---- Loading state ----
  it("shows skeleton loading state (not blank)", () => {
    // Don't resolve the mock yet — component is in loading state
    mocks.getProgress.mockReturnValue(new Promise(() => {})); // never resolves
    mocks.listStudySets.mockReturnValue(new Promise(() => {}));
    render(<NewHome />);
    // Skeleton elements use animate-pulse
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // ---- Error state ----
  it("shows retry button on error (not '0% progress')", async () => {
    mocks.getProgress.mockRejectedValue(new Error("Network error"));
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText("Couldn't load your dashboard")).toBeInTheDocument();
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });

  // ---- Greeting ----
  it("renders greeting with user's first name", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText(/Achieng/)).toBeInTheDocument();
    });
  });

  it("shows grade + track label from progress", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText("Grade 5 · CBC")).toBeInTheDocument();
    });
  });

  it("shows streak when > 0", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText("7")).toBeInTheDocument();
    });
  });

  // ---- Continue Learning ----
  it("shows 'Continue Learning' with last studied topic", async () => {
    render(<NewHome />);
    await waitFor(() => {
      // "Fractions" appears only in the Continue Learning card
      expect(screen.getByText("Fractions")).toBeInTheDocument();
    });
  });

  it("shows 'Choose a subject' when no mastery data (new user)", async () => {
    mocks.getProgress.mockResolvedValue(makeProgress({
      mastery: [],
      weakAreas: [],
      user: { name: "New User", email: "new@test.com", plan: "free", grade: "Grade 1", track: "k12", subjects: ["Mathematics"] },
    }));
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText("Choose a subject to start")).toBeInTheDocument();
      expect(screen.queryByText("Fractions")).not.toBeInTheDocument();
    });
  });

  it("shows mastery percentage on Continue Learning card", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText("35% mastery")).toBeInTheDocument();
    });
  });

  // ---- Subjects ----
  it("shows subject chips from user.subjects", async () => {
    render(<NewHome />);
    await waitFor(() => {
      // "Kiswahili" appears only as a subject chip (no study set with that subject)
      expect(screen.getByText("Kiswahili")).toBeInTheDocument();
      // "Mathematics" appears multiple times (chip + study set subject) — use getAllByText
      expect(screen.getAllByText("Mathematics").length).toBeGreaterThan(0);
    });
  });

  // ---- Practice + progress ----
  it("shows due card count from progress.dueCount", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("cards due")).toBeInTheDocument();
    });
  });

  it("shows weak topics count", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText("topics to review")).toBeInTheDocument();
    });
  });

  it("shows 'No cards due today' when dueCount is 0", async () => {
    mocks.getProgress.mockResolvedValue(makeProgress({ dueCount: 0 }));
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText(/No cards due today/)).toBeInTheDocument();
    });
  });

  // ---- Study sets ----
  it("shows at most 3 study sets", async () => {
    mocks.listStudySets.mockResolvedValue(makeSets(5));
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText("Study Set 1")).toBeInTheDocument();
      expect(screen.getByText("Study Set 2")).toBeInTheDocument();
      expect(screen.getByText("Study Set 3")).toBeInTheDocument();
      expect(screen.queryByText("Study Set 4")).not.toBeInTheDocument();
    });
  });

  // ---- What's NOT there (removed from old Home.tsx) ----
  it("does NOT show the old 8-buddy grid", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.queryByText("Choose your buddy")).not.toBeInTheDocument();
      expect(screen.queryByText("DevBuddy")).not.toBeInTheDocument();
      expect(screen.queryByText("MLBuddy")).not.toBeInTheDocument();
    });
  });

  it("does NOT show hardcoded 'Today's Challenge' card", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.queryByText("Today's Challenge")).not.toBeInTheDocument();
      expect(screen.queryByText("5 questions on Photosynthesis")).not.toBeInTheDocument();
    });
  });

  it("does NOT show the 6-button Quick Actions grid", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.queryByText("Quick Actions")).not.toBeInTheDocument();
      expect(screen.queryByText("Upload Notes")).not.toBeInTheDocument();
      expect(screen.queryByText("Python Runner")).not.toBeInTheDocument();
      expect(screen.queryByText("Lab Simulator")).not.toBeInTheDocument();
    });
  });

  it("does NOT show Billing & Usage entry card", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.queryByText("Billing & Usage")).not.toBeInTheDocument();
    });
  });

  it("does NOT show hardcoded Browse Topics carousel", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.queryByText("Browse Topics")).not.toBeInTheDocument();
      // The hardcoded topics from old Home.tsx
      expect(screen.queryByText("Quadratic Equations")).not.toBeInTheDocument();
      expect(screen.queryByText("Swahili Greetings")).not.toBeInTheDocument();
    });
  });

  // ---- Click actions ----
  it("Continue button navigates to tutor", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText("Continue with AI tutor")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Continue with AI tutor"));
    expect(mocks.setScreen).toHaveBeenCalledWith("tutor");
  });

  it("subject chip navigates to curriculum subject view", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText("Kiswahili")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Kiswahili"));
    expect(mocks.setScreen).toHaveBeenCalledWith("curriculumSubject");
  });

  it("study set click sets active ID + navigates to flashcards", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText("Study Set 1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Study Set 1"));
    expect(mocks.setActiveStudySetId).toHaveBeenCalledWith("set-0");
    expect(mocks.setScreen).toHaveBeenCalledWith("flashcards");
  });

  it("Start review button navigates to flashcards", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText("Start review")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Start review"));
    expect(mocks.setScreen).toHaveBeenCalledWith("flashcards");
  });

  it("View progress link navigates to progress screen", async () => {
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText("View progress")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("View progress"));
    expect(mocks.setScreen).toHaveBeenCalledWith("progress");
  });

  // ---- New user nudge ----
  it("shows 'Get started' nudge for new users (no sets + no mastery)", async () => {
    mocks.getProgress.mockResolvedValue(makeProgress({
      mastery: [],
      weakAreas: [],
      user: { name: "New User", email: "new@test.com", plan: "free", grade: "Grade 1", track: "k12", subjects: ["Mathematics"] },
    }));
    mocks.listStudySets.mockResolvedValue({ sets: [] });
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.getByText("Get started")).toBeInTheDocument();
      expect(screen.getByText("Create study set")).toBeInTheDocument();
    });
  });

  it("does NOT show 'Get started' nudge when user has study sets", async () => {
    mocks.listStudySets.mockResolvedValue(makeSets(1));
    render(<NewHome />);
    await waitFor(() => {
      expect(screen.queryByText("Get started")).not.toBeInTheDocument();
    });
  });
});
