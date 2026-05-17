"use client";

import { useState } from "react";

import { KnowledgeGraph } from "@/components/KnowledgeGraph";
import { NodeDetailsPanel } from "@/components/NodeDetailsPanel";
import type { WikiMap } from "@/lib/schemas";
import type { MapMeta } from "@/hooks/useWikiMap";

// Reused card shell: white bg, beige border, soft shadow, generous padding.
const CARD = "rounded-xl border border-border bg-card p-6 shadow-sm";

export function MapResult({ map, meta }: { map: WikiMap; meta: MapMeta }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = selectedNodeId
    ? (map.nodes.find((n) => n.id === selectedNodeId) ?? null)
    : null;

  return (
    <div className="space-y-6">
      {/* Topic overview */}
      <section className={CARD}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {map.topicType}
          </span>
          <span className="ml-auto text-sm text-muted-foreground">
            {(meta.latencyMs / 1000).toFixed(1)}s
            {meta.usage?.totalTokens
              ? ` · ${meta.usage.totalTokens.toLocaleString()} tokens`
              : ""}
            {meta.retries > 0 ? ` · ${meta.retries} retry` : ""}
          </span>
        </div>
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          {map.topic}
        </h2>
        <p className="mt-4 leading-relaxed text-foreground/80">
          {map.keyTakeaway}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {map.summary}
        </p>
      </section>

      {/* Warnings (only renders when present) */}
      {map.warnings.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <h3 className="font-serif text-base font-semibold text-amber-900">
            Warnings
          </h3>
          <ul className="mt-2 list-inside list-disc text-sm text-amber-800">
            {map.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Knowledge graph + side panel */}
      <section className={CARD}>
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
      </section>

      {/* Learning path */}
      <section className={CARD}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
            <svg
              aria-hidden="true"
              className="h-5 w-5 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-serif text-lg font-semibold tracking-tight text-foreground">
              Learning path
            </h3>
            <p className="text-sm text-muted-foreground">
              {map.learningPath.length} steps
            </p>
          </div>
        </div>

        <p className="mb-6 border-l-2 border-emerald-200 pl-4 italic leading-relaxed text-muted-foreground">
          {map.whyThisPath}
        </p>

        <ol className="space-y-0">
          {map.learningPath.map((s, i) => (
            <li key={s.order} className="group flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-serif text-sm font-semibold text-emerald-700 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                {s.order}
              </div>
              <div
                className={`flex-1 pb-4 ${
                  i === map.learningPath.length - 1
                    ? ""
                    : "border-b border-border/60"
                } ${i === 0 ? "" : "pt-4"}`}
              >
                <div className="font-serif font-semibold text-foreground transition-colors group-hover:text-emerald-700">
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
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {s.reason}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Grounding footer — plain centered text, not a card */}
      <p className="text-center text-sm text-muted-foreground">
        <span className="font-medium text-foreground/70">
          Grounded in Wikipedia.
        </span>{" "}
        Main article:{" "}
        <span className="font-medium text-foreground/70">
          {map.grounding.mainArticleTitle}
        </span>
        . Selected{" "}
        <span className="font-medium text-foreground/70">
          {map.grounding.selectedConceptCount}
        </span>{" "}
        concepts from{" "}
        <span className="font-medium text-foreground/70">
          {map.grounding.candidateLinkCount}
        </span>{" "}
        candidate links.
      </p>
    </div>
  );
}
