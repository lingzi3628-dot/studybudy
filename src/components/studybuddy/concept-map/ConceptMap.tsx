"use client";

import { memo, useCallback, useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import { layoutConceptMap } from "./layout";
import { ConceptNodeData } from "./node-types";
import { ConceptNode } from "./ConceptNode";
import { EdgeLabel } from "./EdgeLabel";

const nodeTypes = { conceptNode: ConceptNode };
const edgeTypes = { labeled: EdgeLabel };

type CmNode = { id: string; label: string; description?: string; type?: string };
type CmEdge = { source: string; target: string; label?: string };

export type ConceptMapProps = {
  nodes: CmNode[];
  edges: CmEdge[];
  onNodeClick?: (nodeId: string, data: ConceptNodeData) => void;
  direction?: "TB" | "LR";
  showMiniMap?: boolean;
  height?: number | string;
  className?: string;
};

function ConceptMapInner({
  nodes,
  edges,
  onNodeClick,
  direction = "TB",
  showMiniMap = true,
  height = 500,
  className = "",
}: ConceptMapProps) {
  const { nodes: rfNodes, edges: rfEdges } = useMemo(
    () => layoutConceptMap(nodes, edges, direction),
    [nodes, edges, direction]
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.id, node.data as ConceptNodeData);
    },
    [onNodeClick]
  );

  const defaultEdgeOptions = useMemo(
    () => ({
      type: "labeled",
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
      labelBgStyle: { fill: "#f3f4f6", color: "#374151" },
      labelStyle: { fontSize: 11, fill: "#374151", fontWeight: 500 },
      style: { stroke: "#c7d2fe", strokeWidth: 2 },
      markerEnd: { type: "arrowclosed" as any },
    }),
    []
  );

  return (
    <div
      className={`w-full rounded-2xl border border-gray-200 bg-white overflow-hidden ${className}`}
      style={{ height }}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.5 }}
        minZoom={0.2}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />
        <Controls
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          className="!bg-white !border !border-gray-200 !rounded-xl !shadow-md"
        />
        {showMiniMap && (
          <MiniMap
            nodeColor={(node) => {
              const data = node.data as ConceptNodeData;
              return data?.nodeType === "main" ? "#6366f1" : "#a5b4fc";
            }}
            maskColor="rgba(249, 250, 251, 0.6)"
            className="!bg-white !border !border-gray-200 !rounded-lg"
            style={{ width: 120, height: 80 }}
          />
        )}
      </ReactFlow>
    </div>
  );
}

export const ConceptMap = memo(ConceptMapInner);
