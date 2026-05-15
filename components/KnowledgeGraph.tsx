"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge as RFEdge,
  type Node as RFNode,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { computeGraphLayout } from "@/lib/graph-layout";
import type { WikiMap } from "@/lib/ai/schema";
import { NODE_STYLES } from "./node-styles";

type GraphNodeData = WikiMap["nodes"][number] & Record<string, unknown>;
type GraphNodeType = RFNode<GraphNodeData, "concept">;

function GraphNode({ data, selected }: NodeProps<GraphNodeType>) {
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

const nodeTypes = { concept: GraphNode };

export function KnowledgeGraph({
  map,
  selectedNodeId,
  onSelectNode,
}: {
  map: WikiMap;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}) {
  const initial = useMemo(() => {
    const layout = computeGraphLayout(map);
    const initialNodes: RFNode[] = layout.nodes.map((n) => ({
      id: n.id,
      type: "concept",
      position: n.position,
      data: n.data,
    }));
    const initialEdges: RFEdge[] = layout.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      labelStyle: { fontSize: 10, fill: "#71717a" },
      labelBgStyle: { fill: "transparent" },
      style: { stroke: "#a1a1aa", strokeWidth: 1.5 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#a1a1aa",
        width: 16,
        height: 16,
      },
    }));
    return { initialNodes, initialEdges };
  }, [map]);

  const [nodes, , onNodesChange] = useNodesState(initial.initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initial.initialEdges);

  const styledNodes = useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedNodeId })),
    [nodes, selectedNodeId],
  );

  return (
    <div className="h-[420px] w-full rounded-lg border border-zinc-200 bg-zinc-50 lg:h-[560px] dark:border-zinc-800 dark:bg-zinc-950">
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.05 }}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={() => onSelectNode(null)}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#d4d4d8"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
