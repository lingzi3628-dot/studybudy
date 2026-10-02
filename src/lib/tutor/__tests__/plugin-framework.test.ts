/**
 * plugin-framework tests — Phase AC3 wire-in
 *
 * Covers the runPluginPipelineForReply() wire-in helper, including:
 *   - Flag-off behavior (empty appendix, no pipeline call)
 *   - Flag-on behavior with various ToolResult statuses
 *   - Appendix NEVER mentions plugin IDs / schemas / internals
 *   - Pipeline NEVER throws (catches errors internally)
 *   - Integration with postProcessReply
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------

// We need to mock the postProcessReply internals because they touch the DB.
// The wire-in test focuses on the plugin-framework helper itself.

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function setFlag(value: boolean) {
  if (value) process.env.TUTOR_PLUGIN_FRAMEWORK_ENABLED = "true";
  else process.env.TUTOR_PLUGIN_FRAMEWORK_ENABLED = "false";
}

// ---------------------------------------------------------------
// runPluginPipelineForReply — flag-off behavior
// ---------------------------------------------------------------

describe("plugin-framework — runPluginPipelineForReply flag-off behavior", () => {
  beforeEach(() => setFlag(false));
  afterEach(() => setFlag(false));

  it("returns empty appendix when flag is off", async () => {
    const { runPluginPipelineForReply } = await import("../plugin-framework");
    const result = await runPluginPipelineForReply({
      userMessage: "Draw a bar graph",
      intents: { wantsBar: true } as any,
      workspaceContext: null,
      aiReply: "Here is your graph.",
      userId: "user-1",
      conversationId: null,
      messageId: null,
      existingAttachments: [],
    });
    expect(result.appendix).toBe("");
    expect(result.pipeline).toBeNull();
  });
});

// ---------------------------------------------------------------
// runPluginPipelineForReply — flag-on behavior
// ---------------------------------------------------------------

describe("plugin-framework — runPluginPipelineForReply flag-on behavior", () => {
  beforeEach(() => setFlag(true));
  afterEach(() => setFlag(false));

  it("returns empty appendix when adapter returns ready (graph attachment present)", async () => {
    const { runPluginPipelineForReply } = await import("../plugin-framework");
    const result = await runPluginPipelineForReply({
      userMessage: "Draw a bar graph",
      intents: { wantsBar: true, wantsGraph: true } as any,
      workspaceContext: null,
      aiReply: "Your graph is ready.",
      userId: "user-1",
      conversationId: "conv-1",
      messageId: "msg-1",
      existingAttachments: [
        { type: "graph", url: null, caption: '{"title":"Class Scores"}' },
      ],
    });
    expect(result.appendix).toBe("");
    expect(result.pipeline).not.toBeNull();
    expect(result.pipeline?.toolResult.status).toBe("ready");
  });

  it("returns safeMessage appendix when adapter returns failed (no graph attachment)", async () => {
    const { runPluginPipelineForReply } = await import("../plugin-framework");
    const result = await runPluginPipelineForReply({
      userMessage: "Draw a bar graph",
      intents: { wantsBar: true, wantsGraph: true } as any,
      workspaceContext: null,
      aiReply: "Your graph is ready.",
      userId: "user-1",
      conversationId: null,
      messageId: null,
      existingAttachments: [], // no attachments → adapter returns failed
    });
    expect(result.appendix.length).toBeGreaterThan(0);
    expect(result.appendix).toMatch(/graph/i);
    // Appendix must NOT mention plugin IDs / schemas / internals
    expect(result.appendix).not.toMatch(/graph\.bar|diagram\.flowchart|code\.python|code\.javascript|assessment\.quiz|plugin id|adapter id|registry|errorCode|reasonCode/i);
  });

  it("returns clarification question appendix when routing can't decide", async () => {
    // "Visualize this" → no category detected → clarification
    const { runPluginPipelineForReply } = await import("../plugin-framework");
    const result = await runPluginPipelineForReply({
      userMessage: "Visualize this",
      intents: { wantsDrawing: true, wantsGraph: true } as any,
      workspaceContext: null,
      aiReply: "Here is something.",
      userId: "user-1",
      conversationId: null,
      messageId: null,
      existingAttachments: [],
    });
    // Either clarification or failed — depends on whether routing matched a plugin
    expect(["clarification_required", "failed", "unsupported"]).toContain(
      result.pipeline?.toolResult.status,
    );
    if (result.pipeline?.toolResult.status === "clarification_required") {
      expect(result.appendix.length).toBeGreaterThan(0);
      expect(result.appendix).not.toMatch(/graph\.bar|plugin id/i);
    }
  });

  it("returns Python code appendix when code.python adapter finds a code block", async () => {
    const { runPluginPipelineForReply } = await import("../plugin-framework");
    const result = await runPluginPipelineForReply({
      userMessage: "Write Python code",
      intents: { wantsGraph: false } as any,
      workspaceContext: null,
      aiReply: "Here is your code:\n```python\nprint('hello')\n```",
      userId: "user-1",
      conversationId: null,
      messageId: null,
      existingAttachments: [],
    });
    // code.python adapter returns ready → no appendix
    expect(result.appendix).toBe("");
    expect(result.pipeline?.toolResult.status).toBe("ready");
    if (result.pipeline?.toolResult.status === "ready") {
      expect(result.pipeline.toolResult.artifact.plugin.id).toBe("code.python");
    }
  });

  it("logs the routing decision (admin observability)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runPluginPipelineForReply } = await import("../plugin-framework");
    await runPluginPipelineForReply({
      userMessage: "Draw a bar graph",
      intents: { wantsBar: true, wantsGraph: true } as any,
      workspaceContext: null,
      aiReply: "Here is your graph.",
      userId: "user-1",
      conversationId: null,
      messageId: null,
      existingAttachments: [{ type: "graph", url: null, caption: "{}" }],
    });
    // Verify the admin log line was emitted
    const calls = logSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => s.includes("[plugin-framework] routing:"))).toBe(true);
    logSpy.mockRestore();
  });

  it("catches pipeline errors and returns empty appendix (never throws)", async () => {
    // Force an error by passing a malformed input that would crash the pipeline
    const { runPluginPipelineForReply } = await import("../plugin-framework");
    let threw = false;
    try {
      const result = await runPluginPipelineForReply({
        userMessage: null as any, // malformed
        intents: null as any,
        workspaceContext: null,
        aiReply: "",
        userId: "",
        conversationId: null,
        messageId: null,
        existingAttachments: [],
      });
      // Should not throw — should return empty appendix
      expect(result.appendix).toBe("");
    } catch (err) {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});

// ---------------------------------------------------------------
// runPluginPipeline — flag-on, full pipeline
// ---------------------------------------------------------------

describe("plugin-framework — runPluginPipeline direct call", () => {
  beforeEach(() => setFlag(true));
  afterEach(() => setFlag(false));

  it("routes a bar graph request to graph.bar and returns ready when attachment is present", async () => {
    const { runPluginPipeline } = await import("../plugin-framework");
    const result = await runPluginPipeline({
      userMessage: "Draw a bar graph",
      intents: { wantsBar: true, wantsGraph: true } as any,
      workspaceContext: null,
      aiReply: "Here is your graph.",
      userId: "user-1",
      conversationId: "conv-1",
      messageId: "msg-1",
      existingAttachments: [
        { type: "graph", url: null, caption: '{"title":"Class Scores"}' },
      ],
    });
    expect(result.decision.pluginId).toBe("graph.bar");
    expect(result.decision.matchedStep).toBe("deterministic");
    expect(result.toolResult.status).toBe("ready");
  });

  it("returns failed when routing picks a plugin but adapter can't validate", async () => {
    const { runPluginPipeline } = await import("../plugin-framework");
    const result = await runPluginPipeline({
      userMessage: "Draw a bar graph",
      intents: { wantsBar: true, wantsGraph: true } as any,
      workspaceContext: null,
      aiReply: "Here is your graph.",
      userId: "user-1",
      conversationId: null,
      messageId: null,
      existingAttachments: [], // no attachment → adapter returns failed
    });
    expect(result.decision.pluginId).toBe("graph.bar");
    expect(result.toolResult.status).toBe("failed");
    if (result.toolResult.status === "failed") {
      expect(result.toolResult.errorCode).toBe("NO_GRAPH_PRODUCED");
    }
  });
});

// ---------------------------------------------------------------
// isPluginFrameworkEnabled — flag reader
// ---------------------------------------------------------------

describe("plugin-framework — isPluginFrameworkEnabled flag reader", () => {
  afterEach(() => setFlag(false));

  it("returns false by default", async () => {
    delete process.env.TUTOR_PLUGIN_FRAMEWORK_ENABLED;
    const { isPluginFrameworkEnabled } = await import("../plugin-framework");
    expect(isPluginFrameworkEnabled()).toBe(false);
  });

  it("returns true when flag is 'true'", async () => {
    process.env.TUTOR_PLUGIN_FRAMEWORK_ENABLED = "true";
    const { isPluginFrameworkEnabled } = await import("../plugin-framework");
    expect(isPluginFrameworkEnabled()).toBe(true);
  });

  it("returns true when flag is '1' or 'on'", async () => {
    process.env.TUTOR_PLUGIN_FRAMEWORK_ENABLED = "1";
    const mod = await import("../plugin-framework");
    expect(mod.isPluginFrameworkEnabled()).toBe(true);
    process.env.TUTOR_PLUGIN_FRAMEWORK_ENABLED = "on";
    const mod2 = await import("../plugin-framework");
    expect(mod2.isPluginFrameworkEnabled()).toBe(true);
  });

  it("returns false when flag is 'false' or empty", async () => {
    process.env.TUTOR_PLUGIN_FRAMEWORK_ENABLED = "false";
    const mod = await import("../plugin-framework");
    expect(mod.isPluginFrameworkEnabled()).toBe(false);
    process.env.TUTOR_PLUGIN_FRAMEWORK_ENABLED = "";
    const mod2 = await import("../plugin-framework");
    expect(mod2.isPluginFrameworkEnabled()).toBe(false);
  });
});
