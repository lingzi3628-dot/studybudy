/**
 * Plugin Registry — Phase AC2
 *
 * Developer-controlled registry of approved learning tool plugins.
 *
 * INVARIANTS:
 *   1. Only developer-approved plugins enter this registry. The AI cannot
 *      provide a module path, package name, JS to execute, remote plugin URL,
 *      or React component.
 *   2. Each plugin is keyed by its stable ID ("graph.bar", "diagram.flowchart", etc.).
 *   3. Lookups fail safely with `unsupported` if a plugin is missing or disabled.
 *   4. The registry is loaded once at module init; runtime lookups are O(1).
 *
 * NOT WIRED INTO CHAT FLOW YET — see TUTOR_PLUGIN_FRAMEWORK_ENABLED flag.
 */

import type { LearningToolManifest, ToolCategory } from "./plugin-types";

// ============================================================
// Initial manifest set (5 plugins, matching advisor's recommendation)
// ============================================================

export const GRAPH_BAR_MANIFEST: LearningToolManifest = {
  id: "graph.bar",
  version: 1,
  category: "graph",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: {
    render: true,
    edit: true,
    execute: false,
    save: true,
    offline: true,
  },
  searchTerms: [
    "bar graph",
    "bar chart",
    "column chart",
    "compare values",
    "frequency by category",
    "compare class scores",
    "visualize rainfall",
  ],
  inputRequirements: ["categories", "numeric values"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

export const DIAGRAM_FLOWCHART_MANIFEST: LearningToolManifest = {
  id: "diagram.flowchart",
  version: 1,
  category: "diagram",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: {
    render: true,
    edit: true,
    execute: false,
    save: true,
    offline: true,
  },
  searchTerms: [
    "flowchart",
    "process diagram",
    "decision flow",
    "workflow",
    "algorithm process",
    "login flow",
    "program lifecycle",
  ],
  inputRequirements: ["nodes", "edges"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

export const CODE_PYTHON_MANIFEST: LearningToolManifest = {
  id: "code.python",
  version: 1,
  category: "code",
  supportedActions: ["create", "modify", "run", "inspect"],
  capabilities: {
    render: true,
    edit: true,
    execute: true,
    save: true,
    offline: false,
  },
  searchTerms: [
    "python",
    "run python",
    "py",
    "execute python",
    "python script",
    "python code",
  ],
  inputRequirements: ["code"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

export const CODE_JAVASCRIPT_MANIFEST: LearningToolManifest = {
  id: "code.javascript",
  version: 1,
  category: "code",
  supportedActions: ["create", "modify", "run", "inspect"],
  capabilities: {
    render: true,
    edit: true,
    execute: true,
    save: true,
    offline: true,
  },
  searchTerms: [
    "javascript",
    "js",
    "run javascript",
    "node",
    "node.js",
    "js code",
    "browser script",
  ],
  inputRequirements: ["code"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

export const ASSESSMENT_QUIZ_MANIFEST: LearningToolManifest = {
  id: "assessment.quiz",
  version: 1,
  category: "assessment",
  supportedActions: ["create", "modify", "run", "review"],
  capabilities: {
    render: true,
    edit: true,
    execute: false,
    save: true,
    offline: true,
  },
  searchTerms: [
    "quiz",
    "test me",
    "multiple choice",
    "mcq",
    "check my understanding",
    "practice questions",
  ],
  inputRequirements: ["questions", "answer choices"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

// ============================================================
// Registry — manifest map + lookups
// ============================================================

const ALL_MANIFESTS: LearningToolManifest[] = [
  GRAPH_BAR_MANIFEST,
  DIAGRAM_FLOWCHART_MANIFEST,
  CODE_PYTHON_MANIFEST,
  CODE_JAVASCRIPT_MANIFEST,
  ASSESSMENT_QUIZ_MANIFEST,
];

const MANIFEST_MAP: ReadonlyMap<string, LearningToolManifest> = new Map(
  ALL_MANIFESTS.map((m) => [m.id, m]),
);

// ============================================================
// Public API
// ============================================================

/** Look up a manifest by plugin ID. Returns null if missing or disabled. */
export function getManifest(pluginId: string): LearningToolManifest | null {
  const m = MANIFEST_MAP.get(pluginId);
  if (!m) return null;
  if (!m.availability.enabled) return null;
  return m;
}

/** Return all enabled manifests. */
export function listEnabledManifests(): LearningToolManifest[] {
  return ALL_MANIFESTS.filter((m) => m.availability.enabled);
}

/** Return enabled manifests for a category. */
export function listManifestsByCategory(category: ToolCategory): LearningToolManifest[] {
  return ALL_MANIFESTS.filter(
    (m) => m.availability.enabled && m.category === category,
  );
}

/** True if a plugin ID is registered AND enabled. */
export function isPluginAvailable(pluginId: string): boolean {
  return getManifest(pluginId) !== null;
}

/** True if a plugin supports a given action. False if plugin is missing or disabled. */
export function pluginSupportsAction(pluginId: string, action: string): boolean {
  const m = getManifest(pluginId);
  if (!m) return false;
  return m.supportedActions.includes(action as any);
}

/**
 * Filter a candidate list down to enabled plugins that support the action.
 * Used by the AI shortlist step — the AI may suggest plugin IDs that don't
 * exist or aren't enabled; this filters them out safely.
 */
export function filterCandidates(
  candidateIds: string[],
  action: string,
): LearningToolManifest[] {
  const seen = new Set<string>();
  const result: LearningToolManifest[] = [];
  for (const id of candidateIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const m = getManifest(id);
    if (m && m.supportedActions.includes(action as any)) {
      result.push(m);
    }
  }
  return result;
}

/** Returns all plugin IDs (for admin tooling only — never expose to the learner). */
export function listAllPluginIds(): string[] {
  return ALL_MANIFESTS.map((m) => m.id);
}

/** Stable list of categories that have at least one enabled manifest. */
export function listEnabledCategories(): ToolCategory[] {
  const seen = new Set<ToolCategory>();
  for (const m of ALL_MANIFESTS) {
    if (m.availability.enabled) seen.add(m.category);
  }
  return Array.from(seen);
}
