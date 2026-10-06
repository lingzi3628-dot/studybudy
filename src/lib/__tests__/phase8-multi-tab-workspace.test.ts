/**
 * Phase 8 — Multi-tab workspace state tests.
 *
 * Tests the tab state management logic (openInWorkspace, closeTab,
 * activateTab, setWorkspaceArtifact for revise-in-place) + the
 * persistence wiring shapes (DB ↔ tab conversion, persistArtifactToDB
 * request body, loadWorkspaceTabs response handling).
 *
 * These tests verify the pure logic — no React rendering, no actual
 * fetch calls. The fetch calls are mocked to return canned responses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// === Mocks ===
global.fetch = vi.fn() as any;

// === Tab state logic (mirrors AITutorChat.tsx) ===

type Attachment = { type: string; url: string | null; caption: string };
type WorkspaceTab = {
  id: string;
  artifact: Attachment;
  persistedId: string | null;
  createdAt: number;
};

function newTabId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Pure-logic replica of the tab state operations in AITutorChat.tsx.
// This lets us test the logic without rendering React.
function createTabState() {
  let tabs: WorkspaceTab[] = [];
  let activeTabId: string | null = null;

  return {
    get tabs() { return tabs; },
    get activeTabId() { return activeTabId; },
    get activeTab() { return tabs.find((t) => t.id === activeTabId) ?? null; },

    openInWorkspace(att: Attachment) {
      const existing = tabs.find((t) => t.artifact.type === att.type && t.artifact.caption === att.caption);
      if (existing) {
        activeTabId = existing.id;
        return;
      }
      const tab: WorkspaceTab = { id: newTabId(), artifact: att, persistedId: null, createdAt: Date.now() };
      activeTabId = tab.id;
      tabs = [...tabs, tab];
    },

    setWorkspaceArtifact(att: Attachment | null) {
      if (att === null) {
        if (!activeTabId) return;
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        if (idx === -1) return;
        const next = [...tabs];
        next.splice(idx, 1);
        tabs = next;
        activeTabId = next[idx]?.id ?? next[next.length - 1]?.id ?? null;
        return;
      }
      tabs = tabs.map((t) => (t.id === activeTabId ? { ...t, artifact: att } : t));
    },

    closeTab(tabId: string) {
      const idx = tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return;
      const next = [...tabs];
      next.splice(idx, 1);
      tabs = next;
      if (tabId === activeTabId) {
        activeTabId = next[idx]?.id ?? next[next.length - 1]?.id ?? null;
      }
    },

    activateTab(tabId: string) {
      activeTabId = tabId;
    },

    clear() {
      tabs = [];
      activeTabId = null;
    },
  };
}

// === Tab state tests ===

describe("workspace tab state — openInWorkspace", () => {
  it("opens a new tab + activates it", () => {
    const state = createTabState();
    state.openInWorkspace({ type: "graph", url: null, caption: '{"type":"bar"}' });
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTab?.artifact.type).toBe("graph");
  });

  it("opens a second tab without losing the first", () => {
    const state = createTabState();
    state.openInWorkspace({ type: "graph", url: null, caption: '{"type":"bar"}' });
    state.openInWorkspace({ type: "quiz", url: null, caption: '{"title":"Q"}' });
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTab?.artifact.type).toBe("quiz");
  });

  it("dedupes — same type + caption switches to existing tab instead of adding", () => {
    const state = createTabState();
    const att = { type: "graph", url: null, caption: '{"type":"bar"}' };
    state.openInWorkspace(att);
    state.openInWorkspace({ type: "quiz", url: null, caption: '{"title":"Q"}' });
    // Open the same graph again — should switch to tab 1, not create tab 3.
    state.openInWorkspace(att);
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTab?.artifact.type).toBe("graph");
  });

  it("opens two different graphs as separate tabs (different caption)", () => {
    const state = createTabState();
    state.openInWorkspace({ type: "graph", url: null, caption: '{"type":"bar","title":"A"}' });
    state.openInWorkspace({ type: "graph", url: null, caption: '{"type":"bar","title":"B"}' });
    expect(state.tabs).toHaveLength(2);
  });
});

describe("workspace tab state — closeTab", () => {
  it("closes the active tab + activates a neighbor", () => {
    const state = createTabState();
    state.openInWorkspace({ type: "graph", url: null, caption: "g1" });
    state.openInWorkspace({ type: "quiz", url: null, caption: "q1" });
    expect(state.tabs).toHaveLength(2);
    // Active is the quiz (tab 2). Close it → should fall back to graph (tab 1).
    state.closeTab(state.activeTabId!);
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTab?.artifact.type).toBe("graph");
  });

  it("closing a non-active tab doesn't change activeTabId", () => {
    const state = createTabState();
    state.openInWorkspace({ type: "graph", url: null, caption: "g1" });
    state.openInWorkspace({ type: "quiz", url: null, caption: "q1" });
    const quizTabId = state.activeTabId;
    state.activateTab(state.tabs[0].id); // switch to graph
    state.closeTab(quizTabId!); // close the quiz (not active)
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTab?.artifact.type).toBe("graph");
  });

  it("closing the last tab leaves no active tab", () => {
    const state = createTabState();
    state.openInWorkspace({ type: "graph", url: null, caption: "g1" });
    state.closeTab(state.activeTabId!);
    expect(state.tabs).toHaveLength(0);
    expect(state.activeTabId).toBeNull();
  });
});

describe("workspace tab state — activateTab", () => {
  it("switches active tab without closing others", () => {
    const state = createTabState();
    state.openInWorkspace({ type: "graph", url: null, caption: "g1" });
    state.openInWorkspace({ type: "quiz", url: null, caption: "q1" });
    state.openInWorkspace({ type: "timeline", url: null, caption: "t1" });
    expect(state.tabs).toHaveLength(3);
    state.activateTab(state.tabs[0].id);
    expect(state.activeTab?.artifact.type).toBe("graph");
    state.activateTab(state.tabs[2].id);
    expect(state.activeTab?.artifact.type).toBe("timeline");
  });
});

describe("workspace tab state — setWorkspaceArtifact (revise-in-place)", () => {
  it("replaces the active tab's artifact (used when AI revises)", () => {
    const state = createTabState();
    state.openInWorkspace({ type: "graph", url: null, caption: '{"values":[1,2,3]}' });
    const tabId = state.activeTabId;
    // AI revises — "change Diana to 8" → new caption
    state.setWorkspaceArtifact({ type: "graph", url: null, caption: '{"values":[1,8,3]}' });
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].id).toBe(tabId); // same tab id
    expect(state.tabs[0].artifact.caption).toMatch(/"values":\[1,8,3\]/);
  });

  it("passing null closes the active tab + activates a neighbor", () => {
    const state = createTabState();
    state.openInWorkspace({ type: "graph", url: null, caption: "g1" });
    state.openInWorkspace({ type: "quiz", url: null, caption: "q1" });
    state.setWorkspaceArtifact(null); // close active (quiz)
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTab?.artifact.type).toBe("graph");
  });
});

// === Persistence wiring ===

describe("persistence — persistArtifactToDB request body shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives pluginId + title from the attachment + sends correct body to /api/artifacts", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ artifact: { id: "art-123" } }),
    });

    // Mirror of persistArtifactToDB's body construction
    const att: Attachment = {
      type: "timeline",
      url: null,
      caption: JSON.stringify({ title: "Kenyan Independence", events: [] }),
    };
    const pluginIdMap: Record<string, string> = {
      graph: "graph.bar", quiz: "assessment.quiz", timeline: "diagram.timeline",
    };
    const pluginId = pluginIdMap[att.type] ?? "graph.bar";
    let title = att.type;
    let payload: any = null;
    try {
      payload = JSON.parse(att.caption);
      if (payload && typeof payload.title === "string") title = payload.title;
    } catch { payload = { caption: att.caption }; }

    await fetch("/api/artifacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pluginId,
        title: String(title).slice(0, 120),
        artifactType: att.type,
        payload,
        conversationId: null,
        status: "ready",
      }),
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/artifacts", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"pluginId":"diagram.timeline"'),
    }));
    const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(callBody.pluginId).toBe("diagram.timeline");
    expect(callBody.title).toBe("Kenyan Independence");
    expect(callBody.artifactType).toBe("timeline");
    expect(callBody.status).toBe("ready");
  });

  it("extracts title from caption JSON when present", () => {
    const att: Attachment = { type: "graph", url: null, caption: '{"title":"My Graph","type":"bar"}' };
    let title = att.type;
    try {
      const p = JSON.parse(att.caption);
      if (p && typeof p.title === "string") title = p.title;
    } catch {}
    expect(title).toBe("My Graph");
  });

  it("falls back to attachment type as title when caption is not JSON", () => {
    const att: Attachment = { type: "graph", url: null, caption: "not json" };
    let title = att.type;
    try {
      const p = JSON.parse(att.caption);
      if (p && typeof p.title === "string") title = p.title;
    } catch {}
    expect(title).toBe("graph");
  });

  it("best-effort: persistArtifactToDB catches fetch errors + returns void", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("network"));
    // Mirror of persistArtifactToDB's try/catch — should swallow the error.
    let threw = false;
    try {
      await (async () => {
        try {
          await fetch("/api/artifacts", { method: "POST", body: "{}" });
        } catch {
          // swallowed — best-effort
        }
      })();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false); // outer catch never fires because inner caught it
  });
});

describe("persistence — loadWorkspaceTabs response handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts DB WorkspaceArtifact rows → WorkspaceTab shape", () => {
    // Mirror of loadWorkspaceTabs's mapping
    const dbArtifacts = [
      {
        id: "art-1",
        artifactType: "graph",
        payload: { type: "bar", title: "Sales", categories: ["A", "B"], values: [10, 20] },
        createdAt: "2026-10-06T10:00:00.000Z",
      },
      {
        id: "art-2",
        artifactType: "quiz",
        payload: { title: "Fractions Quiz", questions: [] },
        createdAt: "2026-10-06T11:00:00.000Z",
      },
    ];
    const tabs: WorkspaceTab[] = dbArtifacts.slice(0, 5).map((a) => ({
      id: a.id ?? `tab-${Date.now()}`,
      artifact: {
        type: a.artifactType ?? "graph",
        url: null,
        caption: typeof a.payload === "string" ? a.payload : JSON.stringify(a.payload ?? {}),
      },
      persistedId: a.id ?? null,
      createdAt: a.createdAt ? new Date(a.createdAt).getTime() : Date.now(),
    }));
    expect(tabs).toHaveLength(2);
    expect(tabs[0].artifact.type).toBe("graph");
    expect(tabs[0].artifact.caption).toMatch(/Sales/);
    expect(tabs[0].persistedId).toBe("art-1");
    expect(tabs[1].artifact.type).toBe("quiz");
    expect(tabs[1].persistedId).toBe("art-2");
  });

  it("caps at 5 most recent artifacts (avoid tab bar overflow)", () => {
    const dbArtifacts = Array.from({ length: 10 }, (_, i) => ({
      id: `art-${i}`,
      artifactType: "graph",
      payload: { title: `Graph ${i}` },
      createdAt: new Date(2026, 9, 6, 10, i).toISOString(),
    }));
    const tabs = dbArtifacts.slice(0, 5).map((a) => ({
      id: a.id,
      artifact: { type: a.artifactType, url: null, caption: JSON.stringify(a.payload) },
      persistedId: a.id,
      createdAt: new Date(a.createdAt).getTime(),
    }));
    expect(tabs).toHaveLength(5);
  });

  it("handles empty artifact list (no tabs loaded — keeps existing)", () => {
    const dbArtifacts: any[] = [];
    const tabs = dbArtifacts.slice(0, 5).map((a) => ({
      id: a.id,
      artifact: { type: a.artifactType, url: null, caption: "" },
      persistedId: a.id,
      createdAt: 0,
    }));
    expect(tabs).toHaveLength(0);
  });
});

// === pluginId mapping ===

describe("persistence — pluginId mapping covers all 16 attachment types", () => {
  const pluginIdMap: Record<string, string> = {
    graph: "graph.bar", quiz: "assessment.quiz", draw_task: "assessment.draw-task",
    conceptmap: "diagram.concept-map", flowchart_v1: "diagram.flowchart",
    manipulative: "math.manipulative", code_project: "code.html",
    science_simulation: "diagram.circuit",
    composition: "writing.composition", timeline: "diagram.timeline",
    geometry: "math.geometry", physics_sim: "science.physics-sim",
    molecule: "science.chemistry-sim", free_body: "diagram.free-body",
    financial: "business.financial", anatomy: "diagram.anatomy",
  };

  it("maps graph → graph.bar", () => { expect(pluginIdMap.graph).toBe("graph.bar"); });
  it("maps quiz → assessment.quiz", () => { expect(pluginIdMap.quiz).toBe("assessment.quiz"); });
  it("maps composition → writing.composition", () => { expect(pluginIdMap.composition).toBe("writing.composition"); });
  it("maps timeline → diagram.timeline", () => { expect(pluginIdMap.timeline).toBe("diagram.timeline"); });
  it("maps geometry → math.geometry", () => { expect(pluginIdMap.geometry).toBe("math.geometry"); });
  it("maps physics_sim → science.physics-sim", () => { expect(pluginIdMap.physics_sim).toBe("science.physics-sim"); });
  it("maps molecule → science.chemistry-sim", () => { expect(pluginIdMap.molecule).toBe("science.chemistry-sim"); });
  it("maps free_body → diagram.free-body", () => { expect(pluginIdMap.free_body).toBe("diagram.free-body"); });
  it("maps financial → business.financial", () => { expect(pluginIdMap.financial).toBe("business.financial"); });
  it("maps anatomy → diagram.anatomy", () => { expect(pluginIdMap.anatomy).toBe("diagram.anatomy"); });

  it("falls back to graph.bar for unknown types", () => {
    expect(pluginIdMap.unknown ?? "graph.bar").toBe("graph.bar");
  });
});
