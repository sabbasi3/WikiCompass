"use client";

import {
  Handle,
  Position,
  type Node as RFNode,
  type NodeProps,
} from "@xyflow/react";

import type { WikiMap } from "@/lib/schemas";

import { NODE_STYLES } from "./node-styles";

// The custom React Flow node component that renders one WikiMap node.
// Two invisible handles (top/bottom) are required by @xyflow/react v12
// for edges to anchor — without them, edges silently fail to render.
//
// Registered into KnowledgeGraph via `nodeTypes = { concept: GraphNode }`.
// The "concept" discriminator is what each layout node carries in its
// `type` field; React Flow looks up the renderer by that string.

export type GraphNodeData = WikiMap["nodes"][number] & Record<string, unknown>;
export type GraphNodeType = RFNode<GraphNodeData, "concept">;

export function GraphNode({ data, selected }: NodeProps<GraphNodeType>) {
  const style = NODE_STYLES[data.type] ?? NODE_STYLES.related_topic;
  const ring = selected
    ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950"
    : "";
  return (
    <div
      className={`rounded-lg border-2 ${style.bg} ${style.border} ${style.text} ${ring} px-3 py-2 shadow-sm transition`}
      style={{ width: 200 }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0, background: "transparent", border: "none" }}
        isConnectable={false}
      />
      <div className="text-[10px] uppercase tracking-wider opacity-70">
        {data.type.replace(/_/g, " ")}
      </div>
      <div className="text-sm font-semibold leading-tight line-clamp-2">
        {data.title}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0, background: "transparent", border: "none" }}
        isConnectable={false}
      />
    </div>
  );
}
