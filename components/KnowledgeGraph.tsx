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

type NodeType = WikiMap["nodes"][number]["type"];

const NODE_STYLES: Record<
  NodeType,
  { bg: string; border: string; text: string }
> = {
  main_topic: {
    bg: "bg-indigo-600",
    border: "border-indigo-700",
    text: "text-white",
  },
  prerequisite: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    border: "border-emerald-400 dark:border-emerald-700",
    text: "text-emerald-900 dark:text-emerald-100",
  },
  core_concept: {
    bg: "bg-violet-100 dark:bg-violet-900/30",
    border: "border-violet-400 dark:border-violet-700",
    text: "text-violet-900 dark:text-violet-100",
  },
  related_topic: {
    bg: "bg-zinc-100 dark:bg-zinc-800",
    border: "border-zinc-300 dark:border-zinc-700",
    text: "text-zinc-800 dark:text-zinc-200",
  },
  advanced_topic: {
    bg: "bg-orange-100 dark:bg-orange-900/30",
    border: "border-orange-400 dark:border-orange-700",
    text: "text-orange-900 dark:text-orange-100",
  },
  application: {
    bg: "bg-cyan-100 dark:bg-cyan-900/30",
    border: "border-cyan-400 dark:border-cyan-700",
    text: "text-cyan-900 dark:text-cyan-100",
  },
  person: {
    bg: "bg-rose-100 dark:bg-rose-900/30",
    border: "border-rose-400 dark:border-rose-700",
    text: "text-rose-900 dark:text-rose-100",
  },
  event: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    border: "border-amber-400 dark:border-amber-700",
    text: "text-amber-900 dark:text-amber-100",
  },
  place: {
    bg: "bg-teal-100 dark:bg-teal-900/30",
    border: "border-teal-400 dark:border-teal-700",
    text: "text-teal-900 dark:text-teal-100",
  },
  historical_context: {
    bg: "bg-stone-100 dark:bg-stone-800",
    border: "border-stone-400 dark:border-stone-600",
    text: "text-stone-800 dark:text-stone-200",
  },
  organization: {
    bg: "bg-red-100 dark:bg-red-900/30",
    border: "border-red-400 dark:border-red-700",
    text: "text-red-900 dark:text-red-100",
  },
  work: {
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
    border: "border-yellow-400 dark:border-yellow-700",
    text: "text-yellow-900 dark:text-yellow-100",
  },
};

type ConceptNodeData = WikiMap["nodes"][number] & Record<string, unknown>;
type ConceptNodeType = RFNode<ConceptNodeData, "concept">;

function ConceptNode({ data, selected }: NodeProps<ConceptNodeType>) {
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

const nodeTypes = { concept: ConceptNode };

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
