"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { ConceptNodeData } from "./node-types";

/**
 * Custom React Flow node for a concept map concept.
 * - "main" nodes: indigo gradient, larger
 * - "sub" nodes: white card with violet accent
 */
function ConceptNodeComponent({ data }: NodeProps<ConceptNodeData>) {
  const isMain = data?.nodeType === "main";
  return (
    <div
      className={`px-3 py-2 rounded-xl shadow-md border transition hover:shadow-lg ${
        isMain
          ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white border-indigo-400 min-w-[140px]"
          : "bg-white text-gray-900 border-violet-200 min-w-[120px]"
      }`}
      title={data?.description}
    >
      {/* Input handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className={`!w-2 !h-2 !border-0 ${isMain ? "!bg-indigo-300" : "!bg-violet-300"}`}
      />
      <div className="text-center">
        <p className={`text-xs font-bold leading-tight ${isMain ? "text-white" : "text-gray-900"}`}>
          {data?.label ?? "Concept"}
        </p>
        {data?.description && (
          <p className={`text-[10px] mt-0.5 line-clamp-2 ${isMain ? "text-white/80" : "text-gray-500"}`}>
            {data.description}
          </p>
        )}
      </div>
      {/* Output handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className={`!w-2 !h-2 !border-0 ${isMain ? "!bg-indigo-300" : "!bg-violet-300"}`}
      />
      {/* Side handles for LR layout */}
      <Handle
        type="target"
        position={Position.Left}
        id="lr-target"
        className={`!w-2 !h-2 !border-0 !opacity-0 ${isMain ? "!bg-indigo-300" : "!bg-violet-300"}`}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="lr-source"
        className={`!w-2 !h-2 !border-0 !opacity-0 ${isMain ? "!bg-indigo-300" : "!bg-violet-300"}`}
      />
    </div>
  );
}

export const ConceptNode = memo(ConceptNodeComponent);
