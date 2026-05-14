"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

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

function NodeCard({ node }: { node: WikiMap["nodes"][number] }) {
  return (
    <li className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium">
          {node.wikipediaUrl ? (
            <a
              href={node.wikipediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {node.title}
            </a>
          ) : (
            node.title
          )}
        </div>
        <Badge variant="outline" className="shrink-0 text-xs">
          {node.type.replace(/_/g, " ")}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {node.explanation}
      </p>
    </li>
  );
}

export function MapResult({ map, meta }: { map: WikiMap; meta: MapMeta }) {
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

      <Card className="p-6">
        <h3 className="text-lg font-semibold">
          Concepts
          <span className="ml-2 text-sm font-normal text-zinc-500">
            {map.nodes.length} nodes · {map.edges.length} edges
          </span>
        </h3>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {map.nodes.map((n) => (
            <NodeCard key={n.id} node={n} />
          ))}
        </ul>
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
