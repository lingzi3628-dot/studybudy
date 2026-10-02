/**
 * Flowchart Layout Compiler — Phase FC
 *
 * Pure, deterministic function that converts a validated FlowchartPlan
 * (semantic nodes + edges, NO coordinates) into positioned geometry
 * for the SVG renderer.
 *
 * Input: FlowchartPlan (from validateFlowchartPlan)
 * Output: CompiledFlowchart (node positions, edge paths, viewport)
 *
 * This is the key architectural change: the AI provides MEANING,
 * the code computes GEOMETRY. Same input → same output. No randomness.
 * No AI calls. No coordinate guessing.
 *
 * Supports:
 *   - top_to_bottom layout (vertical flow)
 *   - left_to_right layout (horizontal flow)
 *   - Layered assignment via topological sort (Kahn's algorithm)
 *   - Text wrapping for long labels
 *   - Node sizing based on text content
 *   - Arrow routing between layers
 *   - Disconnected node handling (placed at bottom)
 *   - Cycle handling (fallback: all cycle nodes in one layer)
 *   - Branch handling (multiple nodes per layer)
 */

import type { FlowchartPlan, FlowchartNode, FlowchartEdge } from "./flowchart-validator";
import { computeLayers } from "./flowchart-validator";

// ============================================================
// Types
// ============================================================

export type CompiledNode = {
  id: string;
  label: string;
  shape: "rectangle" | "rounded_rectangle" | "diamond" | "terminator";
  x: number;          // top-left corner
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  layer: number;
};

export type CompiledEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  points: Array<{ x: number; y: number }>;  // path from source to target
};

export type CompiledFlowchart = {
  nodes: CompiledNode[];
  edges: CompiledEdge[];
  viewport: { width: number; height: number };
};

// ============================================================
// Constants
// ============================================================

const NODE_MIN_WIDTH = 140;
const NODE_MAX_WIDTH = 240;
const NODE_HEIGHT = 56;
const NODE_PADDING_X = 16;
const NODE_PADDING_Y = 12;
const LAYER_SPACING = 120;   // vertical/horizontal distance between layers
const NODE_SPACING = 40;     // spacing between nodes in the same layer
const VIEWPORT_PADDING = 40;
const FONT_SIZE = 14;
const CHARS_PER_LINE = 22;   // approx chars that fit in NODE_MAX_WIDTH at FONT_SIZE

// ============================================================
// Text wrapping
// ============================================================

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

function measureNode(label: string): { width: number; height: number } {
  const lines = wrapText(label, CHARS_PER_LINE);
  const width = Math.min(NODE_MAX_WIDTH, Math.max(NODE_MIN_WIDTH, Math.max(...lines.map(l => l.length)) * (FONT_SIZE * 0.55) + NODE_PADDING_X * 2));
  const height = Math.max(NODE_HEIGHT, lines.length * (FONT_SIZE + 4) + NODE_PADDING_Y * 2);
  return { width: Math.round(width), height: Math.round(height) };
}

// ============================================================
// Main: compile layout
// ============================================================

export function compileFlowchartLayout(plan: FlowchartPlan): CompiledFlowchart {
  const isVertical = plan.direction === "top_to_bottom";

  // 1. Compute layers (topological sort)
  const layers = computeLayers(plan);

  // 2. Build node ID → node lookup
  const nodeMap = new Map<string, FlowchartNode>();
  for (const node of plan.nodes) {
    nodeMap.set(node.id, node);
  }

  // 3. Measure all nodes
  const nodeSizes = new Map<string, { width: number; height: number }>();
  for (const node of plan.nodes) {
    nodeSizes.set(node.id, measureNode(node.label));
  }

  // 4. Assign positions per layer
  const compiledNodes: CompiledNode[] = [];

  // Compute max layer width/height for centering
  const layerSizes = layers.map(layer => {
    const sizes = layer.map(id => nodeSizes.get(id)!);
    if (isVertical) {
      // Horizontal extent of this layer
      const totalWidth = sizes.reduce((sum, s) => sum + s.width, 0) + (sizes.length - 1) * NODE_SPACING;
      const maxHeight = Math.max(...sizes.map(s => s.height));
      return { width: totalWidth, height: maxHeight };
    } else {
      // Vertical extent of this layer
      const totalHeight = sizes.reduce((sum, s) => sum + s.height, 0) + (sizes.length - 1) * NODE_SPACING;
      const maxWidth = Math.max(...sizes.map(s => s.width));
      return { width: maxWidth, height: totalHeight };
    }
  });

  // Track accumulated position
  let accumPos = VIEWPORT_PADDING;

  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    const layerSize = layerSizes[layerIdx];

    // Center this layer within the max layer extent
    const maxLayerExtent = isVertical
      ? Math.max(...layerSizes.map(ls => ls.width))
      : Math.max(...layerSizes.map(ls => ls.height));

    let crossPos: number;
    if (isVertical) {
      // Center horizontally
      crossPos = VIEWPORT_PADDING + (maxLayerExtent - layerSize.width) / 2;
    } else {
      // Center vertically
      crossPos = VIEWPORT_PADDING + (maxLayerExtent - layerSize.height) / 2;
    }

    for (const nodeId of layer) {
      const node = nodeMap.get(nodeId)!;
      const size = nodeSizes.get(nodeId)!;

      let x: number, y: number;
      if (isVertical) {
        x = crossPos;
        y = accumPos;
      } else {
        x = accumPos;
        y = crossPos;
      }

      compiledNodes.push({
        id: nodeId,
        label: node.label,
        shape: node.shape,
        x: Math.round(x),
        y: Math.round(y),
        width: size.width,
        height: size.height,
        centerX: Math.round(x + size.width / 2),
        centerY: Math.round(y + size.height / 2),
        layer: layerIdx,
      });

      // Advance cross position
      if (isVertical) {
        crossPos += size.width + NODE_SPACING;
      } else {
        crossPos += size.height + NODE_SPACING;
      }
    }

    // Advance along the flow axis
    if (isVertical) {
      accumPos += layerSize.height + LAYER_SPACING;
    } else {
      accumPos += layerSize.width + LAYER_SPACING;
    }
  }

  // 5. Compute viewport
  const viewportWidth = isVertical
    ? Math.max(...layerSizes.map(ls => ls.width)) + VIEWPORT_PADDING * 2
    : accumPos + VIEWPORT_PADDING;
  const viewportHeight = isVertical
    ? accumPos + VIEWPORT_PADDING
    : Math.max(...layerSizes.map(ls => ls.height)) + VIEWPORT_PADDING * 2;

  // 6. Compute edge paths
  const nodeById = new Map(compiledNodes.map(n => [n.id, n]));
  const compiledEdges: CompiledEdge[] = [];

  for (const edge of plan.edges) {
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    if (!fromNode || !toNode) continue;

    const points = computeEdgePath(fromNode, toNode, isVertical);
    compiledEdges.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: edge.label,
      points,
    });
  }

  return {
    nodes: compiledNodes,
    edges: compiledEdges,
    viewport: {
      width: Math.round(viewportWidth),
      height: Math.round(viewportHeight),
    },
  };
}

// ============================================================
// Edge path computation
// ============================================================

function computeEdgePath(
  from: CompiledNode,
  to: CompiledNode,
  isVertical: boolean,
): Array<{ x: number; y: number }> {
  if (isVertical) {
    // Top-to-bottom: arrow exits bottom of source, enters top of target
    // If same layer or target is above, use a side exit
    if (to.layer > from.layer) {
      // Normal: bottom → top
      return [
        { x: from.centerX, y: from.y + from.height },
        { x: to.centerX, y: to.y },
      ];
    } else {
      // Same layer or backward: exit right → enter left
      return [
        { x: from.x + from.width, y: from.centerY },
        { x: from.x + from.width + 20, y: from.centerY },
        { x: from.x + from.width + 20, y: to.centerY },
        { x: to.x, y: to.centerY },
      ];
    }
  } else {
    // Left-to-right: arrow exits right of source, enters left of target
    if (to.layer > from.layer) {
      return [
        { x: from.x + from.width, y: from.centerY },
        { x: to.x, y: to.centerY },
      ];
    } else {
      // Same layer or backward: exit bottom → enter top
      return [
        { x: from.centerX, y: from.y + from.height },
        { x: from.centerX, y: from.y + from.height + 20 },
        { x: to.centerX, y: from.y + from.height + 20 },
        { x: to.centerX, y: to.y },
      ];
    }
  }
}
