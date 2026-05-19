// Interactive graph canvas. 
// Clicking a node highlights its incident edges (darker stroke, thicker, white-pill
// labels) and dims everything else — "click a node to see its world."
// Layout is computed once per map via dagre (lib/graph-layout.ts).

"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
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
      // Stash the relationship text in `data` so we can re-derive the
      // label conditionally based on which node is selected. Default
      // edges render without labels for a clean, uncluttered view.
      data: { relationship: e.label },
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

  // Edges have no labels by default — keeps the graph readable when there
  // are many edges converging on a few central nodes. When a node is
  // selected, only its incident edges get labels (with white-backed pills
  // so they're always readable even if two short edges share a midpoint).
  const styledEdges = useMemo(() => {
    return edges.map((e) => {
      const isConnected =
        selectedNodeId &&
        (e.source === selectedNodeId || e.target === selectedNodeId);
      if (isConnected) {
        return {
          ...e,
          label: (e.data?.relationship as string | undefined) ?? "",
          labelStyle: { fontSize: 11, fill: "#52525b", fontWeight: 500 },
          labelBgStyle: { fill: "white" },
          labelBgPadding: [4, 4] as [number, number],
          labelBgBorderRadius: 4,
          style: { stroke: "#52525b", strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#52525b",
            width: 16,
            height: 16,
          },
        };
      }
      // Dim non-connected edges when something is selected — focuses attention.
      if (selectedNodeId) {
        return {
          ...e,
          label: undefined,
          style: { stroke: "#d4d4d8", strokeWidth: 1 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#d4d4d8",
            width: 14,
            height: 14,
          },
        };
      }
      return { ...e, label: undefined };
    });
  }, [edges, selectedNodeId]);

  return (
    <div className="h-[480px] w-full rounded-lg border border-zinc-200 bg-zinc-50 lg:h-[700px] dark:border-zinc-800 dark:bg-zinc-950">
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
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
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(0, 0, 0, 0.05)"
          nodeColor="#a1a1aa"
          nodeStrokeColor="#71717a"
          nodeBorderRadius={4}
        />
      </ReactFlow>
    </div>
  );
}
