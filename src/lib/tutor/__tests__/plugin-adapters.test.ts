/**
 * plugin-adapters tests — Phase AC2 + AC3
 *
 * AC2: registry + wrapAttachmentAsArtifact helper tests (unchanged)
 * AC3: adapter .run() now does REAL validation — tests cover:
 *   - ready when matching attachment is present
 *   - failed when no matching attachment
 *   - failed when AI reply has no code block (code.python / code.javascript)
 *   - safeMessage NEVER mentions plugin IDs / schemas / internals
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
    existingAttachments: [],
    ...overrides,
  };
}

function makeAttachment(type: string, caption: string = ""): TutorAttachment {
  return { type, url: null, caption };
}

// ---------------------------------------------------------------
// Adapter registry (AC2 — unchanged)
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
// graph.bar adapter — AC3 real validation
// ---------------------------------------------------------------

describe("plugin-adapters — graph.bar adapter (AC3)", () => {
  it("returns ready when a graph attachment is present", async () => {
    const request = makeRequest({
      existingAttachments: [
        makeAttachment("graph", '{"type":"bar","title":"Class Scores"}'),
      ],
    });
    const result = await runAdapter("graph.bar", request);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.plugin.id).toBe("graph.bar");
      expect(result.artifact.plugin.version).toBe(1);
      expect(result.artifact.status).toBe("ready");
      expect(result.artifact.title).toBe("Class Scores");
      expect(result.artifact.source.conversationId).toBe("conv-1");
      expect(result.artifact.source.messageId).toBe("msg-1");
      expect(result.tutorSummary.shortMessage).toMatch(/graph is ready/i);
    }
  });

  it("accepts bar / pie / scatter attachment types as graph variants", async () => {
    for (const type of ["bar", "pie", "scatter", "histogram", "function", "line", "conceptmap"]) {
      const request = makeRequest({
        existingAttachments: [makeAttachment(type)],
      });
      const result = await runAdapter("graph.bar", request);
      expect(result.status).toBe("ready");
    }
  });

  it("returns failed when no graph attachment exists", async () => {
    const request = makeRequest({
      existingAttachments: [makeAttachment("source"), makeAttachment("video")],
    });
    const result = await runAdapter("graph.bar", request);
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("NO_GRAPH_PRODUCED");
      expect(result.safeMessage).toMatch(/graph/i);
      // Learner-facing message must NOT mention plugin IDs, schemas, or internals
      expect(result.safeMessage).not.toMatch(/graph\.bar|diagram\.flowchart|code\.python|code\.javascript|assessment\.quiz|plugin id|adapter id|registry/i);
    }
  });

  it("returns failed when existingAttachments is empty", async () => {
    const result = await runAdapter("graph.bar", makeRequest());
    expect(result.status).toBe("failed");
  });

  it("picks the first matching attachment when multiple exist", async () => {
    const request = makeRequest({
      existingAttachments: [
        makeAttachment("source", "first"),
        makeAttachment("graph", '{"title":"Picked"}'),
        makeAttachment("graph", '{"title":"Not Picked"}'),
      ],
    });
    const result = await runAdapter("graph.bar", request);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.title).toBe("Picked");
    }
  });

  it("catches adapter errors and returns failed (never throws)", async () => {
    // Force an error by passing a malformed envelope (adapter should not throw)
    const result = await runAdapter("graph.bar", makeRequest({
      envelope: makeEnvelope({ category: null as any }),
    }));
    // Should either be ready (if existingAttachments is non-empty) or failed
    expect(["ready", "failed"]).toContain(result.status);
  });
});

// ---------------------------------------------------------------
// diagram.flowchart adapter — AC3 real validation
// ---------------------------------------------------------------

describe("plugin-adapters — diagram.flowchart adapter (AC3)", () => {
  function fcRequest(overrides: Partial<PluginRequest> = {}): PluginRequest {
    return makeRequest({
      envelope: makeEnvelope({
        category: "diagram",
        requestedType: "flowchart",
        allowedPlugins: ["diagram.flowchart"],
      }),
      ...overrides,
    });
  }

  it("returns ready when a flowchart_v1 attachment is present", async () => {
    const request = fcRequest({
      existingAttachments: [
        makeAttachment("flowchart_v1", '{"type":"flowchart_v1","title":"Login Flow"}'),
      ],
    });
    const result = await runAdapter("diagram.flowchart", request);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.plugin.id).toBe("diagram.flowchart");
      expect(result.artifact.title).toBe("Login Flow");
      expect(result.tutorSummary.shortMessage).toMatch(/flowchart is ready/i);
    }
  });

  it("returns failed when no flowchart_v1 attachment exists", async () => {
    const request = fcRequest({
      existingAttachments: [makeAttachment("graph")], // wrong type
    });
    const result = await runAdapter("diagram.flowchart", request);
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("NO_FLOWCHART_PRODUCED");
      expect(result.safeMessage).toMatch(/flowchart/i);
      expect(result.safeMessage).not.toMatch(/diagram\.flowchart|plugin id/i);
    }
  });

  it("returns failed when existingAttachments is empty", async () => {
    const result = await runAdapter("diagram.flowchart", fcRequest());
    expect(result.status).toBe("failed");
  });
});

// ---------------------------------------------------------------
// code.python adapter — AC3 real validation
// ---------------------------------------------------------------

describe("plugin-adapters — code.python adapter (AC3)", () => {
  function pyRequest(overrides: Partial<PluginRequest> = {}): PluginRequest {
    return makeRequest({
      envelope: makeEnvelope({
        category: "code",
        requestedType: "python",
        allowedPlugins: ["code.python"],
      }),
      ...overrides,
    });
  }

  it("returns ready when the AI reply contains a ```python block", async () => {
    const request = pyRequest({
      aiReply: "Here is the code:\n```python\nprint('hello')\n```\nDone.",
    });
    const result = await runAdapter("code.python", request);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.plugin.id).toBe("code.python");
      expect(result.artifact.title).toBe("Python Code");
      expect(result.artifact.status).toBe("draft");
      const payload = result.artifact.payload as any;
      expect(payload.language).toBe("python");
      expect(payload.code).toMatch(/print\('hello'\)/);
      expect(payload.files[0].name).toBe("main.py");
      expect(result.tutorSummary.shortMessage).toMatch(/python code is ready/i);
    }
  });

  it("accepts ```py as an alias for ```python", async () => {
    const request = pyRequest({
      aiReply: "```py\nx = 1\n```",
    });
    const result = await runAdapter("code.python", request);
    expect(result.status).toBe("ready");
  });

  it("returns failed when the AI reply has no Python code block", async () => {
    const request = pyRequest({
      aiReply: "I would write Python like this: print('hello')", // no fence
    });
    const result = await runAdapter("code.python", request);
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("NO_PYTHON_CODE_FOUND");
      expect(result.safeMessage).not.toMatch(/code\.python|plugin id/i);
    }
  });

  it("returns failed when only a ```javascript block is present (not python)", async () => {
    const request = pyRequest({
      aiReply: "```javascript\nconsole.log('hi')\n```",
    });
    const result = await runAdapter("code.python", request);
    expect(result.status).toBe("failed");
  });
});

// ---------------------------------------------------------------
// code.javascript adapter — AC3 real validation
// ---------------------------------------------------------------

describe("plugin-adapters — code.javascript adapter (AC3)", () => {
  function jsRequest(overrides: Partial<PluginRequest> = {}): PluginRequest {
    return makeRequest({
      envelope: makeEnvelope({
        category: "code",
        requestedType: "javascript",
        allowedPlugins: ["code.javascript"],
      }),
      ...overrides,
    });
  }

  it("returns ready when the AI reply contains a ```javascript block", async () => {
    const request = jsRequest({
      aiReply: "Here:\n```javascript\nconsole.log('hi')\n```",
    });
    const result = await runAdapter("code.javascript", request);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.plugin.id).toBe("code.javascript");
      expect(result.artifact.title).toBe("JavaScript Code");
      const payload = result.artifact.payload as any;
      expect(payload.language).toBe("javascript");
      expect(payload.code).toMatch(/console\.log/);
      expect(payload.files[0].name).toBe("main.js");
    }
  });

  it("accepts ```js as an alias for ```javascript", async () => {
    const request = jsRequest({
      aiReply: "```js\nconst x = 1;\n```",
    });
    const result = await runAdapter("code.javascript", request);
    expect(result.status).toBe("ready");
  });

  it("returns failed when the AI reply has no JavaScript code block", async () => {
    const request = jsRequest({
      aiReply: "I would use console.log to print",
    });
    const result = await runAdapter("code.javascript", request);
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("NO_JAVASCRIPT_CODE_FOUND");
      expect(result.safeMessage).not.toMatch(/code\.javascript|plugin id/i);
    }
  });

  it("returns failed when only a ```python block is present (not javascript)", async () => {
    const request = jsRequest({
      aiReply: "```python\nprint('hi')\n```",
    });
    const result = await runAdapter("code.javascript", request);
    expect(result.status).toBe("failed");
  });
});

// ---------------------------------------------------------------
// assessment.quiz adapter — AC3 real validation
// ---------------------------------------------------------------

describe("plugin-adapters — assessment.quiz adapter (AC3)", () => {
  function quizRequest(overrides: Partial<PluginRequest> = {}): PluginRequest {
    return makeRequest({
      envelope: makeEnvelope({
        category: "assessment",
        requestedType: "quiz",
        allowedPlugins: ["assessment.quiz"],
      }),
      ...overrides,
    });
  }

  it("returns ready when a quiz attachment is present", async () => {
    const request = quizRequest({
      existingAttachments: [
        makeAttachment("quiz", '{"title":"Fractions Quiz","questions":[]}'),
      ],
    });
    const result = await runAdapter("assessment.quiz", request);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.plugin.id).toBe("assessment.quiz");
      expect(result.artifact.title).toBe("Fractions Quiz");
      expect(result.tutorSummary.shortMessage).toMatch(/quiz is ready/i);
    }
  });

  it("returns failed when no quiz attachment exists", async () => {
    const request = quizRequest({
      existingAttachments: [makeAttachment("graph")],
    });
    const result = await runAdapter("assessment.quiz", request);
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("NO_QUIZ_PRODUCED");
      expect(result.safeMessage).toMatch(/quiz/i);
      expect(result.safeMessage).not.toMatch(/assessment\.quiz|plugin id/i);
    }
  });
});

// ---------------------------------------------------------------
// runAdapter fallback — unsupported when plugin not registered
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

  it("safeMessage never exposes stack traces or internals", async () => {
    const result = await runAdapter("graph.bar", makeRequest());
    if (result.status === "failed") {
      expect(result.safeMessage).not.toMatch(/stack|trace|at \//i);
      expect(result.safeMessage).not.toMatch(/errorCode|reasonCode/i);
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
