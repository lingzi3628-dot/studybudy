/**
 * QuizLab tests — Phase G7
 *
 * Run: npx vitest run src/components/studybuddy/screens/tutor/__tests__/QuizLab.test.tsx
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QuizLab } from "../QuizLab";

afterEach(() => {
  cleanup();
});

const QUIZ_SPEC = {
  title: "Quick Quiz: Photosynthesis",
  questions: [
    {
      id: "q1",
      type: "mcq" as const,
      question: "What gas do plants absorb during photosynthesis?",
      options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"],
      correctIndex: 1,
      explanation: "Plants absorb CO2 from the air.",
    },
    {
      id: "q2",
      type: "mcq" as const,
      question: "Which part of the plant contains chlorophyll?",
      options: ["Roots", "Stem", "Leaves", "Flowers"],
      correctIndex: 2,
      explanation: "Chlorophyll is in the leaves.",
    },
  ],
};

// Helper: click an answer option by its full text (e.g. "B. Carbon dioxide")
function clickOption(text: string) {
  const el = screen.getByText(text);
  fireEvent.click(el);
}

describe("QuizLab — Answer tab", () => {
  it("renders the activity objective", () => {
    render(<QuizLab spec={QUIZ_SPEC as any} />);
    expect(screen.getByText(/Answer 2 questions/i)).toBeInTheDocument();
  });

  it("renders all questions", () => {
    render(<QuizLab spec={QUIZ_SPEC as any} />);
    expect(screen.getAllByText(/What gas do plants absorb/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Which part of the plant/i).length).toBeGreaterThan(0);
  });

  it("submit is disabled until all answered", () => {
    render(<QuizLab spec={QUIZ_SPEC as any} />);
    expect(screen.getByText(/Answer all 2 questions first/)).toBeDisabled();
  });

  it("enables submit after all answered", () => {
    render(<QuizLab spec={QUIZ_SPEC as any} />);
    clickOption("B. Carbon dioxide");
    expect(screen.getByText(/Answer all 2 questions first/)).toBeDisabled();
    clickOption("C. Leaves");
    expect(screen.getByText("Submit Answers")).not.toBeDisabled();
  });

  it("switches to Review after submit with perfect score", () => {
    render(<QuizLab spec={QUIZ_SPEC as any} />);
    clickOption("B. Carbon dioxide");
    clickOption("C. Leaves");
    fireEvent.click(screen.getByText("Submit Answers"));
    expect(screen.getByText(/2 \/ 2/)).toBeInTheDocument();
    expect(screen.getByText(/Perfect/i)).toBeInTheDocument();
  });
});

describe("QuizLab — Review tab", () => {
  it("shows score 1/2 when one wrong", () => {
    render(<QuizLab spec={QUIZ_SPEC as any} />);
    clickOption("A. Oxygen"); // wrong
    clickOption("C. Leaves"); // correct
    fireEvent.click(screen.getByText("Submit Answers"));
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
  });

  it("shows retry button when wrong answers exist", () => {
    render(<QuizLab spec={QUIZ_SPEC as any} />);
    clickOption("A. Oxygen");
    clickOption("C. Leaves");
    fireEvent.click(screen.getByText("Submit Answers"));
    expect(screen.getByText(/Retry wrong answers/i)).toBeInTheDocument();
  });

  it("does NOT show retry when all correct", () => {
    render(<QuizLab spec={QUIZ_SPEC as any} />);
    clickOption("B. Carbon dioxide");
    clickOption("C. Leaves");
    fireEvent.click(screen.getByText("Submit Answers"));
    expect(screen.queryByText(/Retry wrong answers/i)).not.toBeInTheDocument();
  });

  it("shows practice disclaimer", () => {
    render(<QuizLab spec={QUIZ_SPEC as any} />);
    clickOption("B. Carbon dioxide");
    clickOption("C. Leaves");
    fireEvent.click(screen.getByText("Submit Answers"));
    expect(screen.getByText(/practice questions/i)).toBeInTheDocument();
    expect(screen.getByText(/don't affect your progress score/i)).toBeInTheDocument();
  });
});

describe("QuizLab — Retry tab", () => {
  it("shows only wrong questions on retry", () => {
    render(<QuizLab spec={QUIZ_SPEC as any} />);
    clickOption("A. Oxygen"); // wrong
    clickOption("C. Leaves"); // correct
    fireEvent.click(screen.getByText("Submit Answers"));
    fireEvent.click(screen.getByText(/Retry wrong answers/i));
    expect(screen.getByText(/What gas do plants absorb/i)).toBeInTheDocument();
    expect(screen.queryByText(/Which part of the plant/i)).not.toBeInTheDocument();
  });

  it("updates score after correct retry", () => {
    render(<QuizLab spec={QUIZ_SPEC as any} />);
    clickOption("A. Oxygen"); // wrong
    clickOption("C. Leaves"); // correct
    fireEvent.click(screen.getByText("Submit Answers"));
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Retry wrong answers/i));
    clickOption("B. Carbon dioxide"); // correct now
    fireEvent.click(screen.getByText(/Check retry answers/i));
    expect(screen.getByText(/2 \/ 2/)).toBeInTheDocument();
  });
});
