/**
 * GraphLab tests — Phase G7
 *
 * Run: npx vitest run src/components/studybuddy/screens/tutor/__tests__/GraphLab.test.tsx
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../../GraphRenderers", () => ({
  GraphRenderer: ({ spec }: { spec: any }) => (
    <div data-testid="graph-renderer" data-type={spec.type}>
      Graph: {spec.title}
    </div>
  ),
}));

import { GraphLab } from "../GraphLab";

afterEach(() => {
  cleanup();
});

const BAR_SPEC = {
  type: "bar",
  title: "Books Read by Friends",
  categories: ["Alice", "Bob", "Charlie", "Diana"],
  values: [4, 6, 3, 5],
};

const SCATTER_SPEC = {
  type: "scatter",
  title: "Velocity vs Time",
  points: [[0, 0], [1, 5], [2, 10]],
};

// Helper: click a tab by its text content
function clickTab(tabName: string) {
  const tabs = screen.getAllByRole("tab");
  const tab = tabs.find(t => t.textContent?.includes(tabName));
  if (!tab) throw new Error(`Tab "${tabName}" not found`);
  fireEvent.click(tab);
}

describe("GraphLab — bar graph (interactive)", () => {
  it("renders the activity objective", () => {
    render(<GraphLab spec={BAR_SPEC as any} />);
    expect(screen.getByText(/Compare the 4 values/)).toBeInTheDocument();
  });

  it("renders 3 tabs", () => {
    render(<GraphLab spec={BAR_SPEC as any} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0].textContent).toContain("Explore");
    expect(tabs[1].textContent).toContain("Edit Data");
    expect(tabs[2].textContent).toContain("Questions");
  });

  it("renders the graph on Explore tab", () => {
    render(<GraphLab spec={BAR_SPEC as any} />);
    expect(screen.getByTestId("graph-renderer")).toBeInTheDocument();
    expect(screen.getByTestId("graph-renderer")).toHaveAttribute("data-type", "bar");
  });

  it("shows bar selection buttons", () => {
    render(<GraphLab spec={BAR_SPEC as any} />);
    expect(screen.getAllByText("Alice: 4").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bob: 6").length).toBeGreaterThan(0);
  });

  it("shows a text summary with highest, lowest, and total", () => {
    render(<GraphLab spec={BAR_SPEC as any} />);
    expect(screen.getByText(/highest value is Bob at 6/i)).toBeInTheDocument();
    expect(screen.getByText(/lowest is Charlie at 3/i)).toBeInTheDocument();
    expect(screen.getByText(/total of all values is 18/i)).toBeInTheDocument();
  });

  it("selects a bar when tapped", () => {
    render(<GraphLab spec={BAR_SPEC as any} />);
    const bobButtons = screen.getAllByText("Bob: 6");
    fireEvent.click(bobButtons[0]);
    expect(screen.getByText("Selected")).toBeInTheDocument();
  });

  it("shows Ask Tutor buttons", () => {
    const onAskTutor = vi.fn();
    render(<GraphLab spec={BAR_SPEC as any} onAskTutor={onAskTutor} />);
    expect(screen.getByText("Explain graph")).toBeInTheDocument();
    expect(screen.getByText("Ask me a question")).toBeInTheDocument();
  });

  it("calls onAskTutor with bounded context", () => {
    const onAskTutor = vi.fn();
    render(<GraphLab spec={BAR_SPEC as any} onAskTutor={onAskTutor} />);
    fireEvent.click(screen.getByText("Explain graph"));
    expect(onAskTutor).toHaveBeenCalledTimes(1);
    const call = onAskTutor.mock.calls[0][0];
    expect(call).toContain("Books Read by Friends");
    expect(call).toContain("explain this graph");
  });
});

describe("GraphLab — Edit Data tab", () => {
  it("shows editable table", () => {
    render(<GraphLab spec={BAR_SPEC as any} />);
    clickTab("Edit Data");
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBeGreaterThanOrEqual(4);
  });

  it("shows Add row button", () => {
    render(<GraphLab spec={BAR_SPEC as any} />);
    clickTab("Edit Data");
    expect(screen.getByText("Add row")).toBeInTheDocument();
  });

  it("shows live preview", () => {
    render(<GraphLab spec={BAR_SPEC as any} />);
    clickTab("Edit Data");
    expect(screen.getByText("Live preview")).toBeInTheDocument();
    expect(screen.getByTestId("graph-renderer")).toBeInTheDocument();
  });
});

describe("GraphLab — Questions tab", () => {
  it("shows 3 questions", () => {
    render(<GraphLab spec={BAR_SPEC as any} />);
    clickTab("Questions");
    expect(screen.getByText(/highest value/i)).toBeInTheDocument();
    expect(screen.getByText(/total of all values/i)).toBeInTheDocument();
    expect(screen.getByText(/difference between/i)).toBeInTheDocument();
  });

  it("checks Q1 correctly with Bob", () => {
    render(<GraphLab spec={BAR_SPEC as any} />);
    clickTab("Questions");
    const textInputs = screen.getAllByRole("textbox");
    fireEvent.change(textInputs[0], { target: { value: "Bob" } });
    fireEvent.click(screen.getAllByText("Check")[0]);
    expect(screen.getByText(/Correct! Bob has the highest value of 6/i)).toBeInTheDocument();
  });

  it("checks Q1 wrong answer shows correct one", () => {
    render(<GraphLab spec={BAR_SPEC as any} />);
    clickTab("Questions");
    const textInputs = screen.getAllByRole("textbox");
    fireEvent.change(textInputs[0], { target: { value: "Charlie" } });
    fireEvent.click(screen.getAllByText("Check")[0]);
    expect(screen.getByText(/Not quite/i)).toBeInTheDocument();
    expect(screen.getByText(/correct answer is Bob/i)).toBeInTheDocument();
  });

  it("shows practice disclaimer", () => {
    render(<GraphLab spec={BAR_SPEC as any} />);
    clickTab("Questions");
    expect(screen.getByText(/practice questions/i)).toBeInTheDocument();
    expect(screen.getByText(/don't affect your progress score/i)).toBeInTheDocument();
  });
});

describe("GraphLab — non-bar graphs (view-only)", () => {
  it("renders view-only for scatter (no tabs)", () => {
    render(<GraphLab spec={SCATTER_SPEC as any} />);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByTestId("graph-renderer")).toBeInTheDocument();
    expect(screen.getByTestId("graph-renderer")).toHaveAttribute("data-type", "scatter");
  });
});
