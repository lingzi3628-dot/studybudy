/**
 * dagre auto-layout for React Flow.
 *
 * Converts a flat list of nodes + edges into positioned nodes
 * laid out as a top-to-bottom tree.
 */
import dagre from "dagre";
import type { Node, Edge } from "reactflow";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;

type CmNode = { id: string; label: string; description?: string; type?: string };
type CmEdge = { source: string; target: string; label?: string };

export function layoutConceptMap(
  nodes: CmNode[],
  edges: CmEdge[],
  direction: "TB" | "LR" = "TB"
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 90,
    marginx: 30,
    marginy: 30,
  });

  // Add nodes to dagre
  for (const n of nodes) {
    g.setNode(n.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      label: n.label,
    });
  }

  // Add edges
  for (const e of edges) {
    g.setEdge(e.source, e.target, { label: e.label });
  }

  // Run layout
  dagre.layout(g);

  // Convert to React Flow nodes
  const rfNodes: Node[] = nodes.map((n) => {
    const pos = g.node(n.id);
    const isMain = n.type === "main";
    return {
      id: n.id,
      type: "conceptNode",
      position: { x: (pos?.x ?? 0) - NODE_WIDTH / 2, y: (pos?.y ?? 0) - NODE_HEIGHT / 2 },
      data: {
        label: n.label,
        description: n.description ?? "",
        nodeType: isMain ? "main" : "sub",
      },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });

  // Convert to React Flow edges
  const rfEdges: Edge[] = edges.map((e, i) => ({
    id: `e-${i}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    label: e.label,
    type: "smoothstep",
    labelBgPadding: [6, 3] as [number, number],
    labelBgBorderRadius: 4,
    labelBgStyle: { fill: "#f3f4f6", color: "#374151" },
    labelStyle: { fontSize: 11, fill: "#374151", fontWeight: 500 },
    style: { stroke: "#c7d2fe", strokeWidth: 2 },
    arrowHeadType: "arrowclosed" as any,
  }));

  return { nodes: rfNodes, edges: rfEdges };
}
