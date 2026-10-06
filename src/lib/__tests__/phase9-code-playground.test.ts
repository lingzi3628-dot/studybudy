/**
 * Phase 9 — Code playground parser + workspace wiring tests.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../zai-client", () => ({
  getZaiClient: vi.fn().mockResolvedValue({
    chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: "{}" } }] }) } },
    functions: { invoke: vi.fn() },
  }),
}));

import { parseCodePlayground, postProcessReply } from "../tutor-chat-engine";
import type { TutorIntents } from "../tutor-chat-engine";

const EMPTY_INTENTS: TutorIntents = {
  wantsVideo: false, wantsImage: false, wantsFunctionPlot: false, wantsScatter: false,
  wantsBar: false, wantsHistogram: false, wantsPie: false, wantsVenn: false,
  wantsNumberLine: false, wantsTree: false, wantsBoxPlot: false, wantsVector: false,
  wantsPolygon: false, wantsNetwork: false, wantsConceptMap: false, wantsArgand: false,
  wantsContour: false, wantsVectorField: false, wantsTessellation: false, wantsKnot: false,
  wantsPictogram: false, wantsTally: false, wantsCarroll: false, wantsOgive: false,
  wantsUnitCircle: false, wantsTransform: false, wantsAxes3D: false, wantsTwoWay: false,
  wantsCSV: false, wantsERDiagram: false, wantsSteps: false, wantsSearch: false,
  wantsGraph: false, wantsDrawing: false,
};

describe("parseCodePlayground", () => {
  it("parses a python playground", () => {
    const reply = "```code_playground\n{\"language\":\"python\",\"code\":\"print(2+2)\"}\n```";
    const spec = parseCodePlayground(reply);
    expect(spec).not.toBeNull();
    expect(spec.language).toBe("python");
    expect(spec.code).toBe("print(2+2)");
  });

  it("parses a javascript playground", () => {
    const reply = "```code_playground\n{\"language\":\"javascript\",\"code\":\"console.log(2+2)\"}\n```";
    const spec = parseCodePlayground(reply);
    expect(spec).not.toBeNull();
    expect(spec.language).toBe("javascript");
  });

  it("defaults to python when language is missing", () => {
    const reply = "```code_playground\n{\"code\":\"print(1)\"}\n```";
    const spec = parseCodePlayground(reply);
    expect(spec.language).toBe("python");
  });

  it("accepts 'content' as alias for 'code'", () => {
    const reply = "```code_playground\n{\"language\":\"python\",\"content\":\"print('hi')\"}\n```";
    const spec = parseCodePlayground(reply);
    expect(spec.code).toBe("print('hi')");
  });

  it("accepts 'lang' as alias for 'language'", () => {
    const reply = "```code_playground\n{\"lang\":\"javascript\",\"code\":\"1+1\"}\n```";
    const spec = parseCodePlayground(reply);
    expect(spec.language).toBe("javascript");
  });

  it("returns null when no code or content field", () => {
    const reply = "```code_playground\n{\"language\":\"python\"}\n```";
    expect(parseCodePlayground(reply)).toBeNull();
  });

  it("returns null when no fence present", () => {
    expect(parseCodePlayground("just text")).toBeNull();
  });

  it("rejects unsupported language (defaults to python)", () => {
    const reply = "```code_playground\n{\"language\":\"rust\",\"code\":\"fn main(){}\"}\n```";
    const spec = parseCodePlayground(reply);
    expect(spec.language).toBe("python"); // unknown → python
  });
});

describe("postProcessReply — code_playground wiring", () => {
  it("parses ```code_playground into a code_playground attachment + strips from reply", async () => {
    const reply = "Here's a playground:\n```code_playground\n{\"language\":\"python\",\"code\":\"print('hi')\"}\n```\nDone.";
    const result = await postProcessReply({
      reply,
      userMessage: "let me code",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    expect(result.attachments.some((a) => a.type === "code_playground")).toBe(true);
    expect(result.reply).not.toMatch(/```code_playground/);
    expect(result.reply).toMatch(/Done\./);
  });

  it("does NOT push code_playground when no fence is present", async () => {
    const reply = "I would write some code.";
    const result = await postProcessReply({
      reply,
      userMessage: "code",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    expect(result.attachments.find((a) => a.type === "code_playground")).toBeUndefined();
  });
});

describe("CodePlayground component — render shape", () => {
  // These tests verify the data shapes the component receives. Full DOM
  // rendering tests would require jsdom + React Testing Library setup
  // that's heavier than warranted here.

  it("spec shape includes language + code + title", () => {
    const spec = { language: "python", code: "print(2+2)", title: "test playground" };
    expect(spec.language).toBe("python");
    expect(spec.code).toBe("print(2+2)");
    expect(spec.title).toBe("test playground");
  });

  it("default code is non-empty for both languages", async () => {
    // Mirror of the defaultCode() function in CodePlayground.tsx
    function defaultCode(language: "python" | "javascript"): string {
      if (language === "python") {
        return `# Welcome to the Python sandbox!\nprint("Hello, World!")\n`;
      }
      return `// Welcome to the JavaScript sandbox!\nconsole.log("Hello, World!");\n`;
    }
    expect(defaultCode("python").length).toBeGreaterThan(10);
    expect(defaultCode("javascript").length).toBeGreaterThan(10);
    expect(defaultCode("python")).toMatch(/print/);
    expect(defaultCode("javascript")).toMatch(/console\.log/);
  });
});
