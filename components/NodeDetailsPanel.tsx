"use client";

import { Badge } from "@/components/ui/badge";

import type { WikiMap } from "@/lib/ai/schema";

type Node = WikiMap["nodes"][number];

export function NodeDetailsPanel({
  node,
  onClose,
}: {
  node: Node | null;
  onClose: () => void;
}) {
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">
        Click a node in the graph to see its explanation and source link.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-3 flex items-start justify-between gap-2">
        <Badge variant="outline" className="text-xs">
          {node.type.replace(/_/g, " ")}
        </Badge>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          ✕
        </button>
      </div>
      <h3 className="text-lg font-semibold leading-tight">{node.title}</h3>
      <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
        {node.explanation}
      </p>
      {node.wikipediaUrl && (
        <a
          href={node.wikipediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          Read on Wikipedia →
        </a>
      )}
    </div>
  );
}
