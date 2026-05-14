"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

import { KnowledgeGraph } from "@/components/KnowledgeGraph";
import { NodeDetailsPanel } from "@/components/NodeDetailsPanel";
import type { WikiMap } from "@/lib/ai/schema";
import type { MapMeta } from "@/hooks/useWikiMap";

function ConfidenceBadge({ level }: { level: WikiMap["confidence"] }) {
  const variant =
    level === "high" ? "default" : level === "medium" ? "secondary" : "outline";
  return (
    <Badge variant={variant as "default" | "secondary" | "outline"}>
      {level} confidence
    </Badge>
  );
}

export function MapResult({ map, meta }: { map: WikiMap; meta: MapMeta }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = selectedNodeId
    ? (map.nodes.find((n) => n.id === selectedNodeId) ?? null)
    : null;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{map.topicType}</Badge>
          <ConfidenceBadge level={map.confidence} />
          <span className="ml-auto text-xs text-zinc-500">
            {(meta.latencyMs / 1000).toFixed(1)}s
            {meta.usage?.totalTokens
              ? ` · ${meta.usage.totalTokens.toLocaleString()} tokens`
              : ""}
            {meta.retries > 0 ? ` · ${meta.retries} retry` : ""}
          </span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{map.topic}</h2>
        <p className="mt-3 text-zinc-700 dark:text-zinc-300">
          {map.keyTakeaway}
        </p>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          {map.summary}
        </p>
      </Card>

      {map.warnings.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
          <h3 className="font-medium text-amber-900 dark:text-amber-200">
            Warnings
          </h3>
          <ul className="mt-1 list-inside list-disc text-sm text-amber-800 dark:text-amber-200/80">
            {map.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            Knowledge graph
            <span className="ml-2 text-sm font-normal text-zinc-500">
              {map.nodes.length} nodes · {map.edges.length} edges
            </span>
          </h3>
          <span className="hidden text-xs text-zinc-500 sm:inline">
            Drag to pan · scroll to zoom · click a node for details
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <KnowledgeGraph
              map={map}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
            />
          </div>
          <div className="lg:col-span-1">
            <NodeDetailsPanel
              node={selectedNode}
              onClose={() => setSelectedNodeId(null)}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold">
          Learning path
          <span className="ml-2 text-sm font-normal text-zinc-500">
            {map.learningPath.length} steps
          </span>
        </h3>
        <p className="mt-1 text-sm italic text-zinc-600 dark:text-zinc-400">
          {map.whyThisPath}
        </p>
        <ol className="mt-4 space-y-3">
          {map.learningPath.map((s) => (
            <li key={s.order} className="flex gap-3">
              <span className="w-6 shrink-0 font-mono text-sm text-zinc-400">
                {s.order}.
              </span>
              <div className="flex-1">
                <div className="font-medium">
                  {s.wikipediaUrl ? (
                    <a
                      href={s.wikipediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {s.title}
                    </a>
                  ) : (
                    s.title
                  )}
                </div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  {s.reason}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-xs text-zinc-600 dark:text-zinc-400">
          <span className="font-medium">Grounded in Wikipedia.</span> Main
          article:{" "}
          <span className="font-medium">{map.grounding.mainArticleTitle}</span>.
          Selected{" "}
          <span className="font-medium">
            {map.grounding.selectedConceptCount}
          </span>{" "}
          concepts from{" "}
          <span className="font-medium">
            {map.grounding.candidateLinkCount}
          </span>{" "}
          candidate links.
        </div>
      </Card>
    </div>
  );
}
