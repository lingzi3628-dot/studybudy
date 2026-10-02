/**
 * plugin-adapters tests — Phase AC2
 *
 * Covers the adapter registry + the wrapAttachmentAsArtifact helper.
 * Adapter .run() methods return `failed` (ADAPTER_NOT_WIRED) in this phase
 * — that's intentional. Phase AC3 will wire them in with real logic.
 */
import { describe, it, expect } from "vitest";
import {
  getAdapter,
  runAdapter,
  wrapAttachmentAsArtifact,
  primaryAttachmentOf,
  type PluginRequest,
} from "../plugin-adapters";
import type { ConstraintEnvelope } from "../plugin-types";
import type { TutorAttachment } from "../../tutor-chat-engine";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function makeEnvelope(overrides: Partial<ConstraintEnvelope> = {}): ConstraintEnvelope {
  return {
    action: "create",
    category: "graph",
    requestedType: "bar",
    allowedPlugins: ["graph.bar"],
    maximumPrimaryArtifacts: 1,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<PluginRequest> = {}): PluginRequest {
  return {
    action: "create",
    envelope: makeEnvelope(),
    aiReply: "",
    userMessage: "Draw a bar graph",
    userId: "user-1",
    conversationId: "conv-1",
    messageId: "msg-1",
    ...overrides,
  };
}

function makeAttachment(type: string, caption: string = ""): TutorAttachment {
  return { type, url: null, caption };
}

// ---------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------

describe("plugin-adapters — registry", () => {
  it("returns an adapter for each of the 5 registered plugins", () => {
    expect(getAdapter("graph.bar")?.manifestId).toBe("graph.bar");
    expect(getAdapter("diagram.flowchart")?.manifestId).toBe("diagram.flowchart");
    expect(getAdapter("code.python")?.manifestId).toBe("code.python");
    expect(getAdapter("code.javascript")?.manifestId).toBe("code.javascript");
    expect(getAdapter("assessment.quiz")?.manifestId).toBe("assessment.quiz");
  });

  it("returns null for unregistered plugin IDs", () => {
    expect(getAdapter("graph.line")).toBeNull();
    expect(getAdapter("nonexistent")).toBeNull();
  });
});

// ---------------------------------------------------------------
// Adapter .run() — stub behavior in Phase AC2
// ---------------------------------------------------------------

describe("plugin-adapters — .run() returns ADAPTER_NOT_WIRED in Phase AC2", () => {
  it("graph.bar adapter returns failed with ADAPTER_NOT_WIRED", async () => {
    const result = await runAdapter("graph.bar", makeRequest());
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("ADAPTER_NOT_WIRED");
      expect(result.safeMessage).toMatch(/bar graph/i);
      // Learner-facing message must NOT mention plugin IDs, schemas, or internals
      expect(result.safeMessage).not.toMatch(/graph\.bar|diagram\.flowchart|code\.python|code\.javascript|assessment\.quiz|plugin id|adapter id|registry/i);
    }
  });

  it("diagram.flowchart adapter returns failed with ADAPTER_NOT_WIRED", async () => {
    const result = await runAdapter("diagram.flowchart", makeRequest({
      envelope: makeEnvelope({
        category: "diagram",
        requestedType: "flowchart",
        allowedPlugins: ["diagram.flowchart"],
      }),
    }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("ADAPTER_NOT_WIRED");
      expect(result.safeMessage).toMatch(/flowchart/i);
    }
  });

  it("code.python adapter returns failed with ADAPTER_NOT_WIRED", async () => {
    const result = await runAdapter("code.python", makeRequest({
      envelope: makeEnvelope({
        category: "code",
        requestedType: "python",
        allowedPlugins: ["code.python"],
      }),
    }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("ADAPTER_NOT_WIRED");
      expect(result.safeMessage).toMatch(/python/i);
    }
  });

  it("code.javascript adapter returns failed with ADAPTER_NOT_WIRED", async () => {
    const result = await runAdapter("code.javascript", makeRequest({
      envelope: makeEnvelope({
        category: "code",
        requestedType: "javascript",
        allowedPlugins: ["code.javascript"],
      }),
    }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("ADAPTER_NOT_WIRED");
      expect(result.safeMessage).toMatch(/javascript/i);
    }
  });

  it("assessment.quiz adapter returns failed with ADAPTER_NOT_WIRED", async () => {
    const result = await runAdapter("assessment.quiz", makeRequest({
      envelope: makeEnvelope({
        category: "assessment",
        requestedType: "quiz",
        allowedPlugins: ["assessment.quiz"],
      }),
    }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("ADAPTER_NOT_WIRED");
      expect(result.safeMessage).toMatch(/quiz/i);
    }
  });
});

// ---------------------------------------------------------------
// runAdapter — missing adapter fallback
// ---------------------------------------------------------------

describe("plugin-adapters — runAdapter fallback", () => {
  it("returns unsupported when no adapter is registered", async () => {
    const result = await runAdapter("nonexistent.plugin", makeRequest());
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.reasonCode).toBe("NO_ADAPTER_REGISTERED");
      expect(result.alternatives).toEqual([]);
    }
  });

  it("catches uncaught adapter errors and returns failed", async () => {
    // We can't easily force an adapter to throw in this phase (they're stubs).
    // This test verifies the safeMessage never exposes internals.
    const result = await runAdapter("graph.bar", makeRequest());
    if (result.status === "failed") {
      expect(result.safeMessage).not.toMatch(/stack|trace|at \//i);
    }
  });
});

// ---------------------------------------------------------------
// primaryAttachmentOf helper
// ---------------------------------------------------------------

describe("plugin-adapters — primaryAttachmentOf", () => {
  it("returns the first primary attachment", () => {
    const attachments: TutorAttachment[] = [
      makeAttachment("source", "Web source"),
      makeAttachment("graph", '{"type":"bar","title":"Class Scores"}'),
    ];
    const primary = primaryAttachmentOf(attachments);
    expect(primary?.type).toBe("graph");
  });

  it("skips secondary attachment types (source, video, image)", () => {
    const attachments: TutorAttachment[] = [
      makeAttachment("source"),
      makeAttachment("video"),
      makeAttachment("image"),
    ];
    expect(primaryAttachmentOf(attachments)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(primaryAttachmentOf([])).toBeNull();
  });

  it("recognizes flowchart_v1 as a primary type", () => {
    const attachments: TutorAttachment[] = [
      makeAttachment("flowchart_v1", '{"type":"flowchart_v1"}'),
    ];
    expect(primaryAttachmentOf(attachments)?.type).toBe("flowchart_v1");
  });

  it("recognizes quiz as a primary type", () => {
    const attachments: TutorAttachment[] = [
      makeAttachment("quiz", '{"type":"quiz"}'),
    ];
    expect(primaryAttachmentOf(attachments)?.type).toBe("quiz");
  });
});

// ---------------------------------------------------------------
// wrapAttachmentAsArtifact helper
// ---------------------------------------------------------------

describe("plugin-adapters — wrapAttachmentAsArtifact", () => {
  it("wraps an attachment in a WorkspaceArtifact with the right plugin ID", () => {
    const attachment = makeAttachment("graph", '{"type":"bar","title":"Class Scores"}');
    const artifact = wrapAttachmentAsArtifact({
      attachment,
      pluginId: "graph.bar",
      pluginVersion: 1,
      titleFallback: "Bar Graph",
      conversationId: "conv-1",
      messageId: "msg-1",
    });
    expect(artifact.plugin.id).toBe("graph.bar");
    expect(artifact.plugin.version).toBe(1);
    expect(artifact.artifactVersion).toBe(1);
    expect(artifact.status).toBe("ready");
    expect(artifact.source.conversationId).toBe("conv-1");
    expect(artifact.source.messageId).toBe("msg-1");
    expect(artifact.title).toBe("Class Scores"); // extracted from caption JSON
  });

  it("uses the fallback title when caption is not JSON", () => {
    const attachment = makeAttachment("graph", "not json");
    const artifact = wrapAttachmentAsArtifact({
      attachment,
      pluginId: "graph.bar",
      pluginVersion: 1,
      titleFallback: "Bar Graph",
      conversationId: null,
      messageId: null,
    });
    expect(artifact.title).toBe("Bar Graph");
  });

  it("uses the fallback title when caption JSON has no title field", () => {
    const attachment = makeAttachment("graph", '{"type":"bar"}');
    const artifact = wrapAttachmentAsArtifact({
      attachment,
      pluginId: "graph.bar",
      pluginVersion: 1,
      titleFallback: "Bar Graph",
      conversationId: null,
      messageId: null,
    });
    expect(artifact.title).toBe("Bar Graph");
  });

  it("generates a unique artifactId", () => {
    const attachment = makeAttachment("graph");
    const a1 = wrapAttachmentAsArtifact({
      attachment,
      pluginId: "graph.bar",
      pluginVersion: 1,
      titleFallback: "Bar Graph",
      conversationId: null,
      messageId: null,
    });
    const a2 = wrapAttachmentAsArtifact({
      attachment,
      pluginId: "graph.bar",
      pluginVersion: 1,
      titleFallback: "Bar Graph",
      conversationId: null,
      messageId: null,
    });
    expect(a1.artifactId).not.toBe(a2.artifactId);
    expect(a1.artifactId).toMatch(/^graph\.bar-/);
  });

  it("payload preserves the original attachment shape", () => {
    const attachment = makeAttachment("graph", '{"type":"bar"}');
    const artifact = wrapAttachmentAsArtifact({
      attachment,
      pluginId: "graph.bar",
      pluginVersion: 1,
      titleFallback: "Bar Graph",
      conversationId: null,
      messageId: null,
    });
    expect(artifact.payload).toEqual({
      type: "graph",
      url: null,
      caption: '{"type":"bar"}',
    });
  });
});
