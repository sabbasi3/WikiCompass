"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge as RFEdge,
  type Node as RFNode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { computeGraphLayout } from "@/lib/graph-layout";
import type { WikiMap } from "@/lib/schemas";

import { GraphNode } from "./GraphNode";

// React Flow node-type registry. The "concept" string matches the
// `type` field that computeGraphLayout assigns to every node — React
// Flow uses it to look up which custom component to render.
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
