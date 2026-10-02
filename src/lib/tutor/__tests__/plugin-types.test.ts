/**
 * plugin-types tests — Phase AC2
 *
 * Pure type-level tests + helper function tests. Verifies the type guards
 * and the LEARNER_STATUS constant.
 */
import { describe, it, expect } from "vitest";
import {
  isReady,
  isClarification,
  isUnsupported,
  isFailed,
  LEARNER_STATUS,
  type ToolResult,
  type WorkspaceArtifact,
} from "../plugin-types";

describe("plugin-types — type guards", () => {
  it("isReady returns true for ready results", () => {
    const result: ToolResult = {
      status: "ready",
      artifact: sampleArtifact(),
      tutorSummary: { shortMessage: "Your bar graph is ready." },
    };
    expect(isReady(result)).toBe(true);
    expect(isClarification(result)).toBe(false);
    expect(isUnsupported(result)).toBe(false);
    expect(isFailed(result)).toBe(false);
  });

  it("isClarification returns true for clarification_required results", () => {
    const result: ToolResult = {
      status: "clarification_required",
      question: "What values should I use for each bar?",
    };
    expect(isReady(result)).toBe(false);
    expect(isClarification(result)).toBe(true);
  });

  it("isUnsupported returns true for unsupported results", () => {
    const result: ToolResult = {
      status: "unsupported",
      reasonCode: "ROUTING_MISMATCH",
      alternatives: ["graph.bar"],
    };
    expect(isUnsupported(result)).toBe(true);
  });

  it("isFailed returns true for failed results", () => {
    const result: ToolResult = {
      status: "failed",
      errorCode: "ADAPTER_NOT_WIRED",
      safeMessage: "The bar graph plugin is not yet wired into the chat flow.",
    };
    expect(isFailed(result)).toBe(true);
  });
});

describe("plugin-types — LEARNER_STATUS", () => {
  it("does not expose plugin IDs, schemas, or routing internals", () => {
    const allValues = Object.values(LEARNER_STATUS).join(" ");
    expect(allValues).not.toMatch(/graph\.bar|diagram\.flowchart|plugin|registry|routing/i);
    expect(allValues).not.toMatch(/JSON|schema|errorCode|reasonCode/i);
  });

  it("includes preparing messages for each plugin family", () => {
    expect(LEARNER_STATUS.preparingGraph).toMatch(/Preparing your graph/i);
    expect(LEARNER_STATUS.preparingFlowchart).toMatch(/Preparing your flowchart/i);
    expect(LEARNER_STATUS.preparingCode).toMatch(/Preparing your code/i);
    expect(LEARNER_STATUS.preparingQuiz).toMatch(/Preparing your quiz/i);
  });

  it("includes a ready message that does NOT mention plugins", () => {
    expect(LEARNER_STATUS.ready).toMatch(/ready/i);
    expect(LEARNER_STATUS.ready).not.toMatch(/plugin|adapter|registry/i);
  });

  it("provides safe fallback messages for unsupported + failed", () => {
    expect(LEARNER_STATUS.unsupportedDefault.length).toBeGreaterThan(10);
    expect(LEARNER_STATUS.failedDefault.length).toBeGreaterThan(10);
    expect(LEARNER_STATUS.unsupportedDefault).not.toMatch(/stack|trace|error code/i);
    expect(LEARNER_STATUS.failedDefault).not.toMatch(/stack|trace|error code/i);
  });
});

describe("plugin-types — WorkspaceArtifact shape", () => {
  it("requires artifactId, plugin, title, status, source, payload", () => {
    const artifact: WorkspaceArtifact = sampleArtifact();
    expect(artifact.artifactId).toMatch(/^graph\.bar-/);
    expect(artifact.plugin.id).toBe("graph.bar");
    expect(artifact.plugin.version).toBe(1);
    expect(artifact.artifactVersion).toBe(1);
    expect(artifact.title).toBe("Test Graph");
    expect(artifact.status).toBe("ready");
    expect(artifact.source.conversationId).toBe("conv-1");
    expect(artifact.source.messageId).toBe("msg-1");
    expect(artifact.payload).toBeDefined();
  });

  it("allows status transitions: draft → ready → submitted → completed", () => {
    const valid: WorkspaceArtifact["status"][] = ["draft", "ready", "submitted", "completed"];
    for (const s of valid) {
      const a: WorkspaceArtifact = { ...sampleArtifact(), status: s };
      expect(valid).toContain(a.status);
    }
  });
});

function sampleArtifact(): WorkspaceArtifact {
  return {
    artifactId: "graph.bar-test-1",
    plugin: { id: "graph.bar", version: 1 },
    artifactVersion: 1,
    title: "Test Graph",
    status: "ready",
    source: { conversationId: "conv-1", messageId: "msg-1" },
    payload: { categories: ["A", "B"], values: [4, 6] },
  };
}
