// The one truly interactive piece of a MapResult — knowledge graph
// with a floating node-details overlay. Owns the selectedNodeId state
// because the overlay is a sibling (not a child) of the graph: both
// have to read from the same selection.
//
// Extracted from MapResult so the surrounding "static" blocks (topic
// overview, learning path, warnings, grounding) can render as Server
// Components when used from a server context (journey page). Only this
// component ships JS to the browser for those uses.

"use client";

import { useState } from "react";

import { KnowledgeGraph } from "@/components/map-result/KnowledgeGraph";
import { NodeDetailsPanel } from "@/components/map-result/NodeDetailsPanel";
import type { WikiMap } from "@/lib/schemas";

export function MapInteractive({ map }: { map: WikiMap }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = selectedNodeId
    ? (map.nodes.find((node) => node.id === selectedNodeId) ?? null)
    : null;

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Knowledge graph
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {map.nodes.length} nodes · {map.edges.length} edges
          </span>
        </h3>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Drag to pan · scroll to zoom · click a node for details
        </span>
      </div>
      <div className="relative">
        <KnowledgeGraph
          map={map}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />
        {selectedNode && (
          <div className="pointer-events-none absolute right-4 top-4 z-10 w-[340px] max-w-[calc(100%-2rem)]">
            <div className="pointer-events-auto">
              <NodeDetailsPanel
                node={selectedNode}
                onClose={() => setSelectedNodeId(null)}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
