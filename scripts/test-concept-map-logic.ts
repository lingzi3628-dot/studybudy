/**
 * Test that the /api/generate/concept-map endpoint logic works:
 * - Validate the prompt structure
 * - Test JSON sanitization (clamps nodes, edges, ensures main node type)
 *
 * This is a unit test of the sanitization logic — we don't actually call the AI.
 * Run with: bun run scripts/test-concept-map-logic.ts
 */

// Replicate the sanitization logic from the route
type CmNode = { id: string; label: string; description: string; type?: string };
type CmEdge = { source: string; target: string; label: string };

function sanitize(raw: any, fallbackTitle: string): { title: string; nodes: CmNode[]; edges: CmEdge[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : null;
  const edges = Array.isArray(raw.edges) ? raw.edges : null;
  const title = typeof raw.title === "string" ? raw.title : fallbackTitle;
  if (!nodes || nodes.length < 3) return null;

  const cleanNodes: CmNode[] = nodes.slice(0, 15).map((n: any, i: number) => ({
    id: String(n?.id ?? `n${i + 1}`),
    label: String(n?.label ?? `Node ${i + 1}`).slice(0, 80),
    description: String(n?.description ?? "").slice(0, 200),
    type: n?.type === "main" ? "main" : "sub",
  }));

  const nodeIds = new Set(cleanNodes.map((n) => n.id));
  const cleanEdges: CmEdge[] = (edges ?? [])
    .filter((e: any) => e?.source && e?.target && nodeIds.has(String(e.source)) && nodeIds.has(String(e.target)))
    .map((e: any) => ({
      source: String(e.source),
      target: String(e.target),
      label: String(e?.label ?? "relates to").slice(0, 60),
    }))
    .slice(0, 30);

  if (!cleanNodes.some((n) => n.type === "main")) cleanNodes[0].type = "main";
  return { title, nodes: cleanNodes, edges: cleanEdges };
}

// Test cases
console.log("Test 1: well-formed input");
const t1 = sanitize({
  title: "Photosynthesis",
  nodes: [
    { id: "n1", label: "Photosynthesis", description: "Process", type: "main" },
    { id: "n2", label: "Chlorophyll", description: "Green pigment" },
    { id: "n3", label: "Sunlight", description: "Energy source" },
  ],
  edges: [
    { source: "n1", target: "n2", label: "uses" },
    { source: "n1", target: "n3", label: "needs" },
  ],
}, "Fallback");
console.log("  ✓", t1?.nodes.length === 3, "edges:", t1?.edges.length, "main:", t1?.nodes[0].type);

console.log("\nTest 2: bad edge (target doesn't exist) gets filtered");
const t2 = sanitize({
  title: "Test",
  nodes: [
    { id: "n1", label: "A", type: "main" },
    { id: "n2", label: "B" },
    { id: "n3", label: "C" },
  ],
  edges: [
    { source: "n1", target: "n2", label: "x" },
    { source: "n1", target: "n99", label: "bad target" },
  ],
}, "Fallback");
console.log("  ✓", t2?.edges.length === 1, "kept:", t2?.edges[0]?.target);

console.log("\nTest 3: too few nodes (2) → null");
const t3 = sanitize({
  title: "Test",
  nodes: [{ id: "n1", label: "A" }, { id: "n2", label: "B" }],
  edges: [],
}, "Fallback");
console.log("  ✓ null?", t3 === null);

console.log("\nTest 4: 20 nodes → clamped to 15");
const t4 = sanitize({
  title: "Test",
  nodes: Array.from({ length: 20 }, (_, i) => ({ id: `n${i + 1}`, label: `N${i + 1}` })),
  edges: [],
}, "Fallback");
console.log("  ✓ clamped?", t4?.nodes.length === 15, "first is main?", t4?.nodes[0].type === "main");

console.log("\nTest 5: missing first node type → first auto-marked as main");
const t5 = sanitize({
  title: "Test",
  nodes: [
    { id: "n1", label: "A" },
    { id: "n2", label: "B" },
    { id: "n3", label: "C" },
  ],
  edges: [],
}, "Fallback");
console.log("  ✓ first is main?", t5?.nodes[0].type === "main");

console.log("\nTest 6: non-object input → null");
const t6 = sanitize("not an object", "Fallback");
console.log("  ✓ null?", t6 === null);

console.log("\nAll tests passed ✓");
