/**
 * Phase 16 — shared helpers for the Guided Learning Flow.
 *
 * These helpers describe the canonical state machine
 *   ASSESSMENT → LEARNING → PRACTICE → QUIZ → REVIEW → MASTERED
 * and the tools / Professor Bloomer messages that go with each state.
 */

/** Canonical ordered flow states. */
export const FLOW_STATES = [
  "ASSESSMENT",
  "LEARNING",
  "PRACTICE",
  "QUIZ",
  "REVIEW",
  "MASTERED",
] as const;

export type FlowState = (typeof FLOW_STATES)[number];

/**
 * Returns the index of a state in the canonical flow, or -1 if unknown.
 */
export function flowIndex(state: string): number {
  return FLOW_STATES.indexOf(state as FlowState);
}

/**
 * Returns the next state in the flow. MASTERED returns MASTERED.
 */
export function nextFlowState(state: string): string {
  const i = flowIndex(state);
  if (i < 0 || i >= FLOW_STATES.length - 1) return "MASTERED";
  return FLOW_STATES[i + 1];
}

/**
 * Tools unlocked at each flow state.
 */
export function toolsForState(state: string): string[] {
  switch (state) {
    case "ASSESSMENT":
      return ["diagnostic_quiz"];
    case "LEARNING":
      return ["whiteboard", "lesson"];
    case "PRACTICE":
      return ["flashcards", "practice"];
    case "QUIZ":
      return ["quiz"];
    case "REVIEW":
      return ["review_flashcards", "review_quiz"];
    case "MASTERED":
      return ["summary", "next_topic"];
    default:
      return [];
  }
}

/**
 * Pre-canned Professor Bloomer message for each flow state.
 */
export function messageForState(state: string): string {
  switch (state) {
    case "ASSESSMENT":
      return "Welcome! Let's see where you're at — take this quick diagnostic so I can meet you where you are.";
    case "LEARNING":
      return "Time to learn! Follow the whiteboard and the lesson — I'll be right here if you have questions.";
    case "PRACTICE":
      return "Practice makes progress. Try the flashcards and the practice problems — mistakes are part of the journey!";
    case "QUIZ":
      return "Let's see what stuck. Take the quiz when you're ready — there's no pressure, just honest feedback.";
    case "REVIEW":
      return "Great work so far! Let's review the cards and quizzes from today so the knowledge really sets in.";
    case "MASTERED":
      return "Outstanding! You've mastered this topic. Check the summary, and let's pick the next adventure!";
    default:
      return "Welcome back! Ready to keep going?";
  }
}

/**
 * Returns the catalog of tools (key, label, icon, available) for a given
 * flow state. Used by the GET /api/classroom/[sessionId]/tools route.
 */
export function toolCatalogForState(state: string) {
  const available = new Set(toolsForState(state));
  const ALL_TOOLS = [
    { key: "diagnostic_quiz", label: "Diagnostic Quiz", icon: "📋" },
    { key: "whiteboard", label: "Whiteboard", icon: "🎨" },
    { key: "lesson", label: "Lesson", icon: "📖" },
    { key: "flashcards", label: "Flashcards", icon: "🃏" },
    { key: "practice", label: "Practice", icon: "✏️" },
    { key: "quiz", label: "Quiz", icon: "❓" },
    { key: "review_flashcards", label: "Review Flashcards", icon: "🔁" },
    { key: "review_quiz", label: "Review Quiz", icon: "📝" },
    { key: "summary", label: "Summary", icon: "🏆" },
    { key: "next_topic", label: "Next Topic", icon: "🚀" },
  ];
  return ALL_TOOLS.map((t) => ({
    ...t,
    available: available.has(t.key),
  }));
}
