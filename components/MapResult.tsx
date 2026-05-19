// Page-section composer for a successfully-generated map. Each child
// renders one block of the result UI; this file just lays them out and
// owns the cross-cutting state (which node is selected in the graph).

"use client";

import { useState } from "react";

import { GroundingPanel } from "@/components/GroundingPanel";
import { KnowledgeGraph } from "@/components/KnowledgeGraph";
import { LearningPath } from "@/components/LearningPath";
import { NodeDetailsPanel } from "@/components/NodeDetailsPanel";
import { TopicOverview } from "@/components/TopicOverview";
import { WarningsPanel } from "@/components/WarningsPanel";
import type { Grounding, WikiMap } from "@/lib/schemas";
import type { MapMeta } from "@/hooks/useWikiMap";

export function MapResult({
  map,
  grounding,
  meta,
}: {
  map: WikiMap;
  grounding: Grounding;
  meta: MapMeta;
}) {
  // selectedNodeId lives here (not inside KnowledgeGraph) because the
  // floating NodeDetailsPanel is a sibling, not a child, of the graph —
  // both need to read the same selection.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = selectedNodeId
    ? (map.nodes.find((node) => node.id === selectedNodeId) ?? null)
    : null;

  return (
    <div className="space-y-6">
      <TopicOverview map={map} meta={meta} />
      <WarningsPanel warnings={map.warnings} />

      {/* Knowledge graph + floating side panel.
          Kept inline (not extracted to its own component) because it owns
          the selectedNodeId state and the absolute-positioned overlay. */}
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

      <LearningPath path={map.learningPath} whyThisPath={map.whyThisPath} />
      <GroundingPanel grounding={grounding} />
    </div>
  );
}
